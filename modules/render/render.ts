import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { DiagramReport } from '../diagram/types';
import { startServer } from '../server/server';
import { launchChrome } from '../shared/chrome';

export type RenderOptions = {
  diagramPath: string;
  imagePath: string;
  svgPath: string;
  renderer?: 'puppeteer' | 'resvg';
  width?: number;
  height?: number;
};

type BrowserPageApi = {
  prepareForExport: (options?: { padding?: number; maxScale?: number }) => DiagramReport;
};

export async function renderDiagramArtifacts(options: RenderOptions): Promise<void> {
  const diagramPath = resolve(options.diagramPath);
  const imagePath = resolve(options.imagePath);
  const svgPath = resolve(options.svgPath);
  const width = options.width ?? 1600;
  const height = options.height ?? 1000;

  await mkdir(dirname(imagePath), { recursive: true });
  await mkdir(dirname(svgPath), { recursive: true });

  if (options.renderer === 'resvg') {
    const { renderWithResvg } = await import('./resvg');
    await renderWithResvg({ diagramPath, imagePath, svgPath, width, height });
    return;
  }

  // Always own an ephemeral server — never PUT onto a foreign listener.
  const ownedServer = await startServer({ diagramPath, port: 0, quiet: true });
  const port = ownedServer.port;
  if (!port) {
    ownedServer.stop();
    throw new Error('Rendering server did not bind a port.');
  }

  const diagramUrl = `http://127.0.0.1:${port}/api/diagram`;
  const ready = await waitForHttp(diagramUrl, 10_000);
  if (!ready) {
    ownedServer.stop();
    throw new Error('Rendering server did not become ready.');
  }

  const browser = await launchChrome({ width, height, deviceScaleFactor: 2 });

  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/?mode=render`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => {
      const browserWindow = window as typeof window & { __maxGraphEditor?: BrowserPageApi };
      return Boolean(browserWindow.__maxGraphEditor);
    }, { timeout: 15_000 });
    await page.waitForSelector('#graph[data-rendered="true"]', { timeout: 15_000 });

    await page.evaluate(() => {
      const browserWindow = window as typeof window & { __maxGraphEditor?: BrowserPageApi };
      const api = browserWindow.__maxGraphEditor;
      if (!api) {
        throw new Error('Missing editor API');
      }
      api.prepareForExport({ padding: 48, maxScale: 1.25 });
    });

    const svg = await page.evaluate(extractSvgMarkup);
    await writeFile(svgPath, svg.endsWith('\n') ? svg : `${svg}\n`, 'utf8');

    // Render the already-cropped SVG in isolation so PNG and SVG have the
    // same bounds. Screenshotting #graph captures the full editor viewport.
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0}</style></head><body>${svg}</body></html>`,
    );
    const svgHandle = await page.$('svg');
    if (!svgHandle) {
      throw new Error('Could not prepare the exported SVG for PNG rendering');
    }
    await svgHandle.screenshot({ path: imagePath, type: 'png' });
  } finally {
    await browser.close();
    ownedServer.stop();
  }
}

function extractSvgMarkup() {
  const svg = document.querySelector('#graph svg');
  if (!(svg instanceof SVGSVGElement)) {
    throw new Error('No SVG found under #graph');
  }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.removeAttribute('style');
  for (const image of clone.querySelectorAll('image')) {
    const href =
      image.getAttribute('href') ??
      image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
      '';
    if (/(?:expanded|collapsed)\.gif(?:$|\?)/.test(href)) {
      image.remove();
    }
  }

  const bbox = svg.getBBox();
  const pad = 24;
  const x = bbox.x - pad;
  const y = bbox.y - pad;
  const width = Math.max(1, bbox.width + pad * 2);
  const height = Math.max(1, bbox.height + pad * 2);
  clone.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('x', String(x));
  background.setAttribute('y', String(y));
  background.setAttribute('width', String(width));
  background.setAttribute('height', String(height));
  background.setAttribute('fill', '#ffffff');
  clone.insertBefore(background, clone.firstChild);

  return new XMLSerializer().serializeToString(clone);
}

async function waitForHttp(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHttpReachable(url)) {
      return true;
    }
    await sleep(100);
  }
  return false;
}

async function isHttpReachable(url: string) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1_000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
