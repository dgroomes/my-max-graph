/**
 * WARNING: Unedited AI output.
 */
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { publicDir, resolveProjectRoot } from '../shared/paths';

export type StartServerOptions = {
  diagramPath: string;
  /** Defaults to 3000 for interactive serve; pass 0 for an ephemeral port (render). */
  port?: number;
  /** Suppress listen/diagram-path logs (used by headless render). */
  quiet?: boolean;
};

export type RunningServer = {
  port: number;
  stop: () => void;
};

export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const rootDir = resolveProjectRoot();
  const staticDir = publicDir(rootDir);
  const listenPort = options.port ?? 3000;
  const diagramPath = resolve(options.diagramPath);

  if (!Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535) {
    throw new Error(`Invalid port: ${listenPort}`);
  }
  if (!existsSync(diagramPath)) {
    throw new Error(`Diagram file does not exist: ${diagramPath}`);
  }
  if (!existsSync(staticDir)) {
    throw new Error(`Missing public/ directory at ${staticDir}. Run: node build.mjs`);
  }

  const sockets = new Set<WebSocket>();
  let lastWrittenHash = contentHash(readDiagram(diagramPath));
  let watchTimer: ReturnType<typeof setTimeout> | null = null;

  const httpServer = createServer((req, res) => {
    void handleRequest(req, res, diagramPath, staticDir, sockets, (hash) => {
      lastWrittenHash = hash;
    });
  });

  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/sync') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws);
      ws.send(JSON.stringify({ type: 'diagram', xml: readDiagram(diagramPath), source: 'server' }));
      ws.on('close', () => {
        sockets.delete(ws);
      });
      ws.on('message', () => {
        // Receive-only: browser persists via HTTP PUT; agents edit the file on disk.
        ws.send(JSON.stringify({ type: 'error', message: 'WebSocket is receive-only; use PUT /api/diagram.' }));
      });
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    httpServer.once('error', rejectListen);
    httpServer.listen(listenPort, '127.0.0.1', () => {
      httpServer.off('error', rejectListen);
      resolveListen();
    });
  });

  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : listenPort;

  const diagramBasename = basename(diagramPath);
  const watcher = watch(dirname(diagramPath), { persistent: true }, (_event, filename) => {
    if (filename != null && filename !== diagramBasename) {
      return;
    }
    if (watchTimer) {
      clearTimeout(watchTimer);
    }
    watchTimer = setTimeout(() => {
      watchTimer = null;
      try {
        if (!existsSync(diagramPath)) {
          return;
        }
        const xml = readDiagram(diagramPath);
        const hash = contentHash(xml);
        if (hash === lastWrittenHash) {
          return;
        }
        lastWrittenHash = hash;
        broadcast(sockets, { type: 'diagram', xml, source: 'file' });
      } catch {
        // Ignore transient read errors during atomic renames.
      }
    }, 100);
  });

  const stop = () => {
    if (watchTimer) {
      clearTimeout(watchTimer);
      watchTimer = null;
    }
    try {
      watcher.close();
    } catch {
      // already closed
    }
    for (const socket of [...sockets]) {
      try {
        socket.terminate();
      } catch {
        // ignore
      }
    }
    sockets.clear();
    try {
      wss.close();
    } catch {
      // ignore
    }
    httpServer.closeAllConnections?.();
    httpServer.close();
  };

  if (!options.quiet) {
    console.log(`my-max-graph listening on http://127.0.0.1:${port}`);
    console.log(`Diagram file: ${diagramPath}`);
  }
  return { port, stop };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  diagramPath: string,
  staticDir: string,
  sockets: Set<WebSocket>,
  rememberHash: (hash: string) => void,
) {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/api/diagram' && req.method === 'GET') {
      send(res, 200, readDiagram(diagramPath), 'application/xml; charset=utf-8');
      return;
    }

    if (url.pathname === '/api/diagram' && req.method === 'PUT') {
      const xml = await readBody(req);
      const written = writeDiagram(diagramPath, xml, rememberHash);
      broadcast(sockets, { type: 'diagram', xml: written, source: 'http' });
      send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
      return;
    }

    if (url.pathname === '/api/health' && req.method === 'GET') {
      send(
        res,
        200,
        JSON.stringify({ ok: true, diagramPath, port: (req.socket.localPort ?? null) }),
        'application/json; charset=utf-8',
      );
      return;
    }

    const pathPart = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    const filePath = resolve(staticDir, pathPart);
    if (!isInsidePublicDir(staticDir, filePath) || !existsSync(filePath)) {
      send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      return;
    }

    send(res, 200, readFileSync(filePath), contentTypeFor(filePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send(res, 500, message, 'text/plain; charset=utf-8');
  }
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(res: ServerResponse, status: number, body: string | Buffer, contentType: string) {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
}

function contentTypeFor(filePath: string) {
  switch (extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function readDiagram(diagramPath: string) {
  return readFileSync(diagramPath, 'utf-8');
}

function writeDiagram(
  diagramPath: string,
  xml: string,
  rememberHash?: (hash: string) => void,
) {
  const dir = dirname(diagramPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const content = xml.endsWith('\n') ? xml : `${xml}\n`;
  // Record hash before rename so a racing fs.watch callback treats this as a self-write.
  rememberHash?.(contentHash(content));
  const tempPath = `${diagramPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, content, 'utf-8');
  renameSync(tempPath, diagramPath);
  return content;
}

function contentHash(xml: string) {
  return createHash('sha256').update(normalizeXml(xml)).digest('hex');
}

function normalizeXml(xml: string) {
  return xml.replace(/\r\n/g, '\n').trimEnd();
}

function isInsidePublicDir(publicDirectory: string, filePath: string) {
  const normalizedPublic = publicDirectory.endsWith(sep) ? publicDirectory : `${publicDirectory}${sep}`;
  return filePath === publicDirectory || filePath.startsWith(normalizedPublic);
}

function broadcast(sockets: Set<WebSocket>, message: unknown) {
  const json = JSON.stringify(message);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(json);
    }
  }
}
