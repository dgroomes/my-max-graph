/**
 * WARNING: Unedited AI output.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { DiagramReport } from '../diagram/types';
import { startServer } from '../server/server';
import { launchChrome } from '../shared/chrome';

export type RenderOptions = {
  diagramPath: string;
  imagePath: string;
  svgPath: string;
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

    const graphHandle = await page.$('#graph');
    if (!graphHandle) {
      throw new Error('Could not locate #graph in render mode');
    }
    await graphHandle.screenshot({ path: imagePath, type: 'png' });

    const svg = await page.evaluate(extractSvgMarkup);
    await writeFile(svgPath, svg.endsWith('\n') ? svg : `${svg}\n`, 'utf8');
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
