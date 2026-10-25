import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  type Cell,
  Client,
  Graph,
  InternalEvent,
  KeyHandler,
  ModelXmlSerializer,
  PopupMenuHandler,
  RubberBandHandler,
  UndoManager,
} from '@maxgraph/core';
import type { DiagramReport } from '../diagram/types';

type SyncMessage = {
  type?: string;
  xml?: string;
  source?: string;
  message?: string;
};

/** Page API for headless render — intentionally tiny. */
type MaxGraphEditorApi = {
  getDiagramReport: () => DiagramReport;
  prepareForExport: (options?: { padding?: number; maxScale?: number }) => DiagramReport;
};

const RECT_STYLE = { rounded: 1, whiteSpace: 'wrap', fillColor: '#dae8fc', strokeColor: '#6c8ebf' };
const ELLIPSE_STYLE = { shape: 'ellipse', whiteSpace: 'wrap', fillColor: '#fff2cc', strokeColor: '#d6b656' };
const DEFAULT_VERTEX_WIDTH = 150;
const DEFAULT_VERTEX_HEIGHT = 64;

declare global {
  interface Window {
    __maxGraphEditor?: MaxGraphEditorApi;
  }
}

function serializeCellStyle(style: unknown) {
  if (style == null) {
    return '';
  }
  if (typeof style === 'string') {
    return style;
  }
  if (typeof style === 'object') {
    return Object.entries(style as Record<string, unknown>)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(';');
  }
  return String(style);
}

function App() {
  const [xml, setXml] = useState('');
  const [status, setStatus] = useState('Connecting...');
  const [statusClass, setStatusClass] = useState('muted');
  const [lastSync, setLastSync] = useState('No sync yet.');
  const [nextLabel, setNextLabel] = useState('New Node');
  const [selectionCount, setSelectionCount] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const keyHandlerRef = useRef<KeyHandler | null>(null);
  const undoManagerRef = useRef<UndoManager | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sendTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const xmlRef = useRef('');
  const applyingXmlRef = useRef(false);
  const nextInsertPointRef = useRef({ x: 80, y: 80 });

  const socketUrl = useMemo(
    () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/sync`,
    [],
  );
  const renderOnly = useMemo(() => new URLSearchParams(location.search).get('mode') === 'render', []);

  useEffect(() => {
    document.body.classList.toggle('render-only', renderOnly);
    return () => {
      document.body.classList.remove('render-only');
    };
  }, [renderOnly]);

  useEffect(() => {
    const container = graphContainerRef.current;
    if (!container) {
      return;
    }

    container.tabIndex = 0;
    InternalEvent.disableContextMenu(container);
    const graph = new Graph(container);
    graph.setConnectable(!renderOnly);
    graph.setCellsEditable(!renderOnly);
    graph.setCellsMovable(!renderOnly);
    graph.setCellsResizable(!renderOnly);
    graph.setPanning(!renderOnly);
    new RubberBandHandler(graph);
    graph.getDataModel().addListener(InternalEvent.CHANGE, onGraphModelChanged);
    const onSelectionChanged = () => setSelectionCount(graph.getSelectionCount());
    graph.getSelectionModel().addListener(InternalEvent.CHANGE, onSelectionChanged);

    const undoManager = new UndoManager(100);
    const undoListener = (_sender: unknown, evt: { getProperty: (key: string) => unknown }) => {
      undoManager.undoableEditHappened(evt.getProperty('edit') as never);
      refreshUndoButtons();
    };
    graph.getDataModel().addListener(InternalEvent.UNDO, undoListener);
    graph.getView().addListener(InternalEvent.UNDO, undoListener);
    undoManagerRef.current = undoManager;

    let keyHandler: KeyHandler | null = null;
    if (!renderOnly) {
      keyHandler = new KeyHandler(graph, container);
      // Cmd on macOS counts as control for undo/redo (maxGraph docs pattern).
      const keyMaps = keyHandler as KeyHandler & {
        controlKeys: Record<number, (evt: KeyboardEvent) => void>;
        normalKeys: Record<number, (evt: KeyboardEvent) => void>;
      };
      keyHandler.getFunction = (evt: KeyboardEvent) => {
        if (!evt) {
          return null;
        }
        const control = evt.ctrlKey || (Client.IS_MAC && evt.metaKey);
        if (control) {
          return keyMaps.controlKeys[evt.keyCode] ?? null;
        }
        return keyMaps.normalKeys[evt.keyCode] ?? null;
      };
      keyHandler.bindKey(46, () => {
        removeSelection();
      });
      keyHandler.bindKey(8, () => {
        removeSelection();
      });
      keyHandler.bindControlKey(90, () => {
        undo();
      });
      keyHandler.bindControlKey(89, () => {
        redo();
      });
      keyHandlerRef.current = keyHandler;
    }

    const popupMenuHandler = graph.getPlugin<PopupMenuHandler>('PopupMenuHandler');
    if (popupMenuHandler && !renderOnly) {
      popupMenuHandler.factoryMethod = (menu, cell, mouseEvent) => {
        const point = graph.getPointForEvent(mouseEvent);
        menu.addItem('Add Box', null, () => {
          insertVertexWithStyle('New Node', point.x, point.y, DEFAULT_VERTEX_WIDTH, DEFAULT_VERTEX_HEIGHT, RECT_STYLE);
        });
        menu.addItem('Add Ellipse', null, () => {
          insertVertexWithStyle(
            'New Node',
            point.x,
            point.y,
            DEFAULT_VERTEX_WIDTH,
            DEFAULT_VERTEX_HEIGHT,
            ELLIPSE_STYLE,
          );
        });
        if (graph.getSelectionCount() >= 2) {
          menu.addItem('Connect Selected', null, () => {
            connectSelection();
          });
        }
        const candidateCells = cell ? [cell] : graph.getSelectionCells();
        if (candidateCells.length > 0) {
          menu.addItem('Delete', null, () => {
            const deletable = graph.getDeletableCells(candidateCells);
            if (deletable.length > 0) {
              graph.removeCells(deletable);
            }
          });
        }
      };
    }

    const focusGraph = () => {
      container.focus();
    };
    if (!renderOnly) {
      container.addEventListener('pointerdown', focusGraph);
    }

    onSelectionChanged();
    graphRef.current = graph;

    const api: MaxGraphEditorApi = {
      getDiagramReport() {
        return buildDiagramReport();
      },
      prepareForExport(options) {
        return prepareForExport(options);
      },
    };
    window.__maxGraphEditor = api;

    return () => {
      if (window.__maxGraphEditor === api) {
        delete window.__maxGraphEditor;
      }
      if (!renderOnly) {
        container.removeEventListener('pointerdown', focusGraph);
      }
      keyHandler?.onDestroy();
      keyHandlerRef.current = null;
      graph.getSelectionModel().removeListener(onSelectionChanged);
      graph.getDataModel().removeListener(onGraphModelChanged);
      graph.getDataModel().removeListener(undoListener);
      graph.getView().removeListener(undoListener);
      undoManager.clear();
      undoManagerRef.current = null;
      graph.destroy();
      graphRef.current = null;
    };
  }, [renderOnly]);

  useEffect(() => {
    mountedRef.current = true;
    void loadInitial();
    connect();

    return () => {
      mountedRef.current = false;
      if (sendTimerRef.current) {
        window.clearTimeout(sendTimerRef.current);
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, [socketUrl]);

  function connect() {
    if (!mountedRef.current) {
      return;
    }

    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      if (mountedRef.current) {
        setStatusWithClass('Live sync connected', 'ok');
      }
    });

    socket.addEventListener('close', () => {
      if (!mountedRef.current) {
        return;
      }
      setStatusWithClass('Disconnected; retrying...', 'warn');
      reconnectTimerRef.current = window.setTimeout(connect, 800);
    });

    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data) as SyncMessage;
      if (payload.type === 'diagram' && typeof payload.xml === 'string' && payload.xml !== xmlRef.current) {
        setXml(payload.xml);
        xmlRef.current = payload.xml;
        renderGraph(payload.xml);
        undoManagerRef.current?.clear();
        refreshUndoButtons();
        noteSync(payload.source ?? 'remote');
        setStatusWithClass(`Synced from ${payload.source ?? 'remote'}`, 'ok');
      } else if (payload.type === 'error' && typeof payload.message === 'string') {
        setStatusWithClass(`Sync error: ${payload.message}`, 'warn');
      }
    });
  }

  async function loadInitial() {
    const response = await fetch('/api/diagram');
    const initialXml = await response.text();
    setXml(initialXml);
    xmlRef.current = initialXml;
    renderGraph(initialXml);
    noteSync('loaded from disk');
  }

  function onXmlChanged(nextXml: string) {
    setXml(nextXml);
    xmlRef.current = nextXml;
    renderGraph(nextXml);
    noteSync('local edit');
    queuePersist(nextXml);
  }

  async function persistXml(nextXml: string) {
    try {
      const response = await fetch('/api/diagram', {
        method: 'PUT',
        headers: { 'content-type': 'application/xml; charset=utf-8' },
        body: nextXml,
      });

      if (!response.ok) {
        setStatusWithClass(`Sync failed (${response.status})`, 'warn');
        return;
      }

      setStatusWithClass('Synced to disk', 'ok');
      noteSync('local save');
    } catch {
      setStatusWithClass('Sync failed (network)', 'warn');
    }
  }

  function clearRenderedFlag() {
    graphContainerRef.current?.removeAttribute('data-rendered');
  }

  function markRenderedFlag() {
    graphContainerRef.current?.setAttribute('data-rendered', 'true');
  }

  function renderGraph(nextXml: string) {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    clearRenderedFlag();
    try {
      applyingXmlRef.current = true;
      new ModelXmlSerializer(graph.getDataModel()).import(nextXml);
      graph.refresh();
      if (renderOnly) {
        prepareForExport();
        markRenderedFlag();
      }
    } catch (error) {
      noteSync(`render error: ${String(error)}`);
    } finally {
      applyingXmlRef.current = false;
    }
  }

  function onGraphModelChanged() {
    if (applyingXmlRef.current) {
      return;
    }

    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    const nextXml = new ModelXmlSerializer(graph.getDataModel()).export();
    setXml(nextXml);
    xmlRef.current = nextXml;
    noteSync('graph edit');
    refreshUndoButtons();
    queuePersist(nextXml);
  }

  function normalizedLabel(raw: string) {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : 'New Node';
  }

  function nextInsertPoint() {
    const point = { ...nextInsertPointRef.current };
    nextInsertPointRef.current = { x: point.x + 44, y: point.y + 28 };
    if (nextInsertPointRef.current.x > 900) {
      nextInsertPointRef.current.x = 80;
    }
    if (nextInsertPointRef.current.y > 620) {
      nextInsertPointRef.current.y = 80;
    }
    return point;
  }

  function insertVertexWithStyle(
    label: string,
    x: number,
    y: number,
    width: number,
    height: number,
    style?: unknown,
  ): { id: string; label: string } {
    const graph = graphRef.current;
    const safeLabel = normalizedLabel(label);
    if (!graph) {
      return { id: '', label: safeLabel };
    }

    let insertedId = '';
    let insertedCell: unknown;
    graph.batchUpdate(() => {
      insertedCell = graph.insertVertex(
        graph.getDefaultParent(),
        null,
        safeLabel,
        x,
        y,
        width,
        height,
        style as never,
      );
      insertedId = String((insertedCell as { id?: string }).id ?? '');
    });
    if (insertedCell) {
      graph.setSelectionCell(insertedCell as never);
    }
    setStatusWithClass('Node added', 'ok');
    refreshUndoButtons();
    return { id: insertedId, label: safeLabel };
  }

  function insertShape(shape: 'box' | 'ellipse') {
    const point = nextInsertPoint();
    if (shape === 'ellipse') {
      insertVertexWithStyle(
        nextLabel,
        point.x,
        point.y,
        DEFAULT_VERTEX_WIDTH,
        DEFAULT_VERTEX_HEIGHT,
        ELLIPSE_STYLE,
      );
      return;
    }
    insertVertexWithStyle(nextLabel, point.x, point.y, DEFAULT_VERTEX_WIDTH, DEFAULT_VERTEX_HEIGHT, RECT_STYLE);
  }

  function removeSelection() {
    const graph = graphRef.current;
    if (!graph) {
      return 0;
    }
    const selection = graph.getSelectionCells();
    const deletable = graph.getDeletableCells(selection);
    if (deletable.length === 0) {
      return 0;
    }
    graph.removeCells(deletable);
    setStatusWithClass(`Deleted ${deletable.length} cell${deletable.length === 1 ? '' : 's'}`, 'ok');
    refreshUndoButtons();
    return deletable.length;
  }

  function connectSelection() {
    const graph = graphRef.current;
    if (!graph) {
      return null;
    }

    const selection = graph.getSelectionCells();
    if (selection.length < 2) {
      return null;
    }

    const [source, target] = selection;
    let edgeId = '';
    graph.batchUpdate(() => {
      const edge = graph.insertEdge(
        graph.getDefaultParent(),
        null,
        '',
        source,
        target,
        { endArrow: 'block', rounded: 1 } as never,
      ) as { id?: string };
      edgeId = String(edge.id ?? '');
      graph.setSelectionCell(edge as never);
    });
    setStatusWithClass('Connected selected cells', 'ok');
    refreshUndoButtons();
    return edgeId ? { id: edgeId } : null;
  }

  function undo() {
    const undoManager = undoManagerRef.current;
    if (!undoManager?.canUndo()) {
      return;
    }
    undoManager.undo();
    setStatusWithClass('Undo', 'ok');
    refreshUndoButtons();
  }

  function redo() {
    const undoManager = undoManagerRef.current;
    if (!undoManager?.canRedo()) {
      return;
    }
    undoManager.redo();
    setStatusWithClass('Redo', 'ok');
    refreshUndoButtons();
  }

  function refreshUndoButtons() {
    const undoManager = undoManagerRef.current;
    setCanUndo(Boolean(undoManager?.canUndo()));
    setCanRedo(Boolean(undoManager?.canRedo()));
  }

  function queuePersist(nextXml: string) {
    if (sendTimerRef.current) {
      window.clearTimeout(sendTimerRef.current);
    }

    sendTimerRef.current = window.setTimeout(() => {
      void persistXml(nextXml);
    }, 250);
  }

  function setStatusWithClass(text: string, cssClass: string) {
    setStatus(text);
    setStatusClass(cssClass);
  }

  function noteSync(source: string) {
    setLastSync(`Last sync: ${new Date().toLocaleTimeString()} from ${source}`);
  }

  function buildDiagramReport(): DiagramReport {
    const graph = graphRef.current;
    if (!graph) {
      return {
        generatedAt: new Date().toISOString(),
        vertexCount: 0,
        edgeCount: 0,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        labels: [],
        nodes: [],
        edges: [],
      };
    }

    const parent = graph.getDefaultParent() as Cell;
    const nodes = parent.getChildVertices().map((cell) => {
      const geometry = cell.getGeometry();
      return {
        id: String(cell.id ?? ''),
        label: graph.getLabel(cell) ?? '',
        x: geometry?.x ?? 0,
        y: geometry?.y ?? 0,
        width: geometry?.width ?? 0,
        height: geometry?.height ?? 0,
        style: serializeCellStyle(cell.getStyle()),
      };
    });
    const edges = parent.getChildEdges().map((cell) => {
      const source = cell.getTerminal(true);
      const target = cell.getTerminal(false);
      return {
        id: String(cell.id ?? ''),
        label: graph.getLabel(cell) ?? '',
        sourceId: String(source?.id ?? ''),
        sourceLabel: source ? graph.getLabel(source) ?? '' : '',
        targetId: String(target?.id ?? ''),
        targetLabel: target ? graph.getLabel(target) ?? '' : '',
        style: serializeCellStyle(cell.getStyle()),
      };
    });

    const bounds = graph.getGraphBounds();
    return {
      generatedAt: new Date().toISOString(),
      vertexCount: nodes.length,
      edgeCount: edges.length,
      bounds: {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      },
      labels: nodes.map((node) => node.label).filter((label) => label.length > 0),
      nodes,
      edges,
    };
  }

  function prepareForExport(options?: { padding?: number; maxScale?: number }): DiagramReport {
    const graph = graphRef.current;
    const container = graphContainerRef.current;
    if (!graph || !container) {
      return buildDiagramReport();
    }

    const padding = Math.max(0, Number(options?.padding ?? 24));
    const maxScale = Math.max(0.1, Number(options?.maxScale ?? 1.4));
    graph.refresh();
    graph.zoomActual();

    const bounds = graph.getGraphBounds();
    if (bounds.width > 0 && bounds.height > 0) {
      const availableWidth = Math.max(200, container.clientWidth - padding * 2);
      const availableHeight = Math.max(200, container.clientHeight - padding * 2);
      const scale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height, maxScale);
      if (Number.isFinite(scale) && scale > 0) {
        graph.zoomTo(scale, false);
      }
      graph.center(true, true);
    }

    graph.refresh();
    return buildDiagramReport();
  }

  return (
    <>
      {!renderOnly && (
        <header>
          <strong>my-max-graph</strong>
          <span className={statusClass} title="Sync status">
            {status}
          </span>
        </header>
      )}
      <main>
        {!renderOnly && (
          <section className="panel">
            <h2>Diagram XML</h2>
            <p className="panel-note">
              Light GUI edits only (move/add/connect). Style and long-tail changes belong in this XML — ask an agent.
            </p>
            <textarea value={xml} spellCheck={false} onChange={(event) => onXmlChanged(event.target.value)} />
          </section>
        )}
        <section className="panel">
          {!renderOnly && <h2>Diagram</h2>}
          {!renderOnly && (
            <div className="graph-toolbar">
              <input
                value={nextLabel}
                onChange={(event) => setNextLabel(event.target.value)}
                aria-label="New node label"
                placeholder="Node label"
              />
              <button type="button" onClick={() => insertShape('box')}>
                Add Box
              </button>
              <button type="button" onClick={() => insertShape('ellipse')}>
                Add Ellipse
              </button>
              <button type="button" onClick={() => connectSelection()} disabled={selectionCount < 2}>
                Connect Selected
              </button>
              <button type="button" onClick={() => removeSelection()} disabled={selectionCount < 1}>
                Delete Selected
              </button>
              <button type="button" onClick={() => undo()} disabled={!canUndo}>
                Undo
              </button>
              <button type="button" onClick={() => redo()} disabled={!canRedo}>
                Redo
              </button>
              <span className="selection-summary">
                {selectionCount} selected. Drag to move. Delete/Backspace removes. Ctrl/Cmd+Z / Ctrl/Cmd+Y undo/redo.
              </span>
            </div>
          )}
          <div ref={graphContainerRef} id="graph" />
          {!renderOnly && <p className="sync-line muted">{lastSync}</p>}
        </section>
      </main>
    </>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
