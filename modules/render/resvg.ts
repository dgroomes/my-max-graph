import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { RenderOptions } from './render';

let dom: import('jsdom').JSDOM | undefined;

/** maxGraph writes SVG into jsdom; the native resvg CLI renders the PNG. */
export async function renderWithResvg(options: Required<Omit<RenderOptions, 'renderer'>>): Promise<void> {
  const { diagramPath, svgPath, imagePath, width, height } = options;
  if (!dom) {
    const { JSDOM } = await import('jsdom');
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    for (const name of [
      'window', 'document', 'navigator', 'location', 'DOMParser', 'XMLSerializer',
      'Node', 'Element', 'HTMLElement', 'SVGElement', 'SVGSVGElement', 'getComputedStyle',
    ]) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value: dom.window[name as keyof typeof dom.window],
      });
    }
  }
  // maxGraph reads DOM globals during module initialization.
  const { Graph, ModelXmlSerializer, TextShape } = await import('@maxgraph/core');
  const xml = new DOMParser().parseFromString(await readFile(diagramPath, 'utf8'), 'application/xml');
  if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'GraphDataModel') {
    throw new Error('Expected a valid GraphDataModel XML document.');
  }
  if (xml.querySelector('foreignObject') ||
      Array.from(xml.querySelectorAll('Object[as="style"]')).some((style) =>
        ['1', 'true'].includes(style.getAttribute('html') ?? ''))) {
    throw new Error('The resvg renderer supports plain SVG labels, not HTML labels.');
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const graph = new Graph(container, undefined, []);
  try {
    graph.setEnabled(false);
    graph.setHtmlLabels(false);
    graph.isFoldingEnabled = () => false;
    graph.cellRenderer.defaultTextShape = class extends TextShape {
      // jsdom has no text layout. Keep model coordinates and omit text-sized backgrounds.
      override ignoreStringSize = true;

      override createSvgCanvas() {
        const canvas = super.createSvgCanvas();
        if (canvas) canvas.addTextBackground = () => {};
        return canvas;
      }
    };
    new ModelXmlSerializer(graph.getDataModel()).import(xml.documentElement);
    graph.refresh();

    const svg = container.querySelector('svg')!.cloneNode(true) as SVGSVGElement;
    if (svg.querySelector('image, foreignObject')) {
      throw new Error('The resvg renderer does not support images or HTML labels.');
    }
    svg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.w3.org/2000/svg');
    svg.removeAttribute('style');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // resvg does not resolve the browser's font aliases. Keep requested fonts
    // first, with commonly installed substitutes for systems without them.
    const substitutes: Record<string, string> = {
      arial: 'Liberation Sans,DejaVu Sans',
      helvetica: 'Liberation Sans,DejaVu Sans',
      'sans-serif': 'Arial,Helvetica,Liberation Sans,DejaVu Sans',
      'courier new': 'Liberation Mono,DejaVu Sans Mono',
      monospace: 'Courier New,Liberation Mono,DejaVu Sans Mono',
      'times new roman': 'Liberation Serif,DejaVu Serif',
      serif: 'Times New Roman,Liberation Serif,DejaVu Serif',
    };
    for (const node of svg.querySelectorAll('[font-family]')) {
      const families = node.getAttribute('font-family')!.split(',').flatMap((family) => {
        const fallback = substitutes[family.trim().replace(/^['"]|['"]$/g, '').toLowerCase()];
        return fallback ? [family, fallback] : [family];
      });
      node.setAttribute('font-family', [...families, 'Arial,Helvetica,Liberation Sans,DejaVu Sans'].join(','));
    }
    for (const node of svg.querySelectorAll('*')) {
      for (const attribute of Array.from(node.attributes)) {
        if (attribute.value.includes('url(')) {
          node.setAttribute(attribute.name, attribute.value.replace(/url\([^)]*#([^)]*)\)/g, 'url(#$1)'));
        }
      }
    }
    await writeFile(svgPath, `${new XMLSerializer().serializeToString(svg)}\n`, 'utf8');
  } finally {
    graph.destroy();
    container.remove();
  }

  try {
    const { stderr } = await promisify(execFile)(
      'resvg', ['--zoom', '2', svgPath, imagePath], { timeout: 30_000 },
    );
    if (stderr) process.stderr.write(stderr);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('resvg CLI was not found. Install it with cargo install resvg --locked and put it on PATH.');
    }
    throw error;
  }
}
