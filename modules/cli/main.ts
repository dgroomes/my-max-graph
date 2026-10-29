/**
 * CLI entrypoint (bundled to dist/mmg.js). Owns process bootstrap,
 * argument parsing, help text, and command dispatch.
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { renderDiagramArtifacts } from '../render/render';
import { startServer } from '../server/server';
import { writeTextFile } from '../shared/fs';
import { starterDiagramXml } from './starter-template';

declare const __APP_VERSION__: string;
declare const __BUILD_TIMESTAMP__: string;

type Args = {
  positional: string[];
  flags: Map<string, string | boolean>;
};

try {
  await runCli(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function runCli(argv: string[]) {
  const parsed = parseArgs(argv);
  await dispatch(parsed);
}

async function dispatch(parsed: Args) {
  const head = parsed.positional[0];

  if (head === 'version' || head === '-v' || parsed.flags.has('version')) {
    console.log(`mmg ${__APP_VERSION__}\nBuilt: ${formatLocalTimestamp(__BUILD_TIMESTAMP__)}`);
    return;
  }

  if (!head || head === 'help' || head === '--help' || head === '-h' || parsed.flags.has('help')) {
    printHelp();
    return;
  }

  if (head === 'serve') {
    await cmdServe(parsed.positional[1], parsed);
    return;
  }
  if (head === 'render') {
    await cmdRender(parsed.positional[1], parsed);
    return;
  }
  if (head === 'new') {
    await cmdNew(parsed.positional[1]);
    return;
  }

  if (looksLikeDiagramPath(head)) {
    await cmdServe(head, parsed);
    return;
  }

  throw new Error(`Unknown command: ${head}\n\nRun: mmg help`);
}

async function cmdServe(diagramArg: string | undefined, parsed: Args) {
  if (!diagramArg) {
    throw new Error('Usage: mmg serve <diagram.xml> [--port 3000]');
  }
  const diagramPath = resolve(process.cwd(), diagramArg);
  if (!existsSync(diagramPath)) {
    throw new Error(`Diagram file does not exist: ${diagramPath}`);
  }
  const port = Number(getFlag(parsed, 'port', '3000'));
  const server = await startServer({ diagramPath, port });
  const shutdown = (signal: NodeJS.Signals) => {
    try {
      server.stop();
    } catch {
      // ignore double-stop
    }
    // Force-exit so open handles (watchers/sockets) cannot keep the process alive.
    process.exit(signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

async function cmdRender(diagramArg: string | undefined, parsed: Args) {
  if (!diagramArg) {
    throw new Error(
      'Usage: mmg render <diagram.xml> [--renderer puppeteer|resvg] [--out diagram.png] [--svg diagram.svg]',
    );
  }

  const diagramPath = resolve(process.cwd(), diagramArg);
  if (!existsSync(diagramPath)) {
    throw new Error(`Diagram file does not exist: ${diagramPath}`);
  }

  const renderer = getFlag(parsed, 'renderer', 'puppeteer');
  if (renderer !== 'puppeteer' && renderer !== 'resvg') {
    throw new Error(`Unknown renderer: ${renderer}. Choose puppeteer or resvg.`);
  }
  const outRaw = getOptionalFlag(parsed, 'out');
  const imagePath = resolve(process.cwd(), outRaw || defaultImagePath(diagramPath));
  const svgFlag = parsed.flags.get('svg');
  const svgPath = resolve(
    process.cwd(),
    typeof svgFlag === 'string' ? svgFlag : defaultSvgPath(diagramPath, imagePath),
  );

  await mkdir(dirname(imagePath), { recursive: true });
  await mkdir(dirname(svgPath), { recursive: true });

  await renderDiagramArtifacts({
    diagramPath,
    imagePath,
    svgPath,
    renderer,
  });

  process.stdout.write(`${JSON.stringify({ diagramPath, imagePath, svgPath }, null, 2)}\n`);
}

async function cmdNew(diagramArg: string | undefined) {
  if (!diagramArg) {
    throw new Error('Usage: mmg new <diagram.xml>');
  }
  const diagramPath = resolve(process.cwd(), diagramArg);
  if (existsSync(diagramPath)) {
    throw new Error(`Refusing to overwrite existing file: ${diagramPath}`);
  }
  await writeTextFile(diagramPath, starterDiagramXml());
  process.stdout.write(`${JSON.stringify({ diagramPath }, null, 2)}\n`);
}

/** Existing file ending in .xml. */
function looksLikeDiagramPath(value: string) {
  if (value.startsWith('-')) {
    return false;
  }
  const resolved = resolve(process.cwd(), value);
  if (!value.toLowerCase().endsWith('.xml')) {
    return false;
  }
  return existsSync(resolved);
}

function defaultImagePath(diagramPath: string) {
  return `${stripXmlExtension(diagramPath)}.png`;
}

function defaultSvgPath(diagramPath: string, imagePath: string) {
  if (imagePath.toLowerCase().endsWith('.png')) {
    return `${imagePath.slice(0, -4)}.svg`;
  }
  return `${stripXmlExtension(diagramPath)}.svg`;
}

function stripXmlExtension(diagramPath: string) {
  const ext = extname(diagramPath);
  return ext ? diagramPath.slice(0, -ext.length) : diagramPath;
}

function formatLocalTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const offset = -date.getTimezoneOffset();
  const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, -1);
  const sign = offset < 0 ? '-' : '+';
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(offset) % 60).padStart(2, '0');
  return `${local}${sign}${hours}:${minutes}`;
}

function printHelp() {
  console.log(`my-max-graph

My tooling over maxGraph for working on diagrams with an agent.

Usage:
  mmg serve <diagram.xml> [--port 3000]
  mmg new <diagram.xml>
  mmg render <diagram.xml> [--renderer puppeteer|resvg] [--out diagram.png] [--svg diagram.svg]
  mmg version                 (also --version or -v)
  mmg help

Canonical loop:
  1. mmg new diagram.xml
  2. mmg serve diagram.xml
  3. ask an agent: "make the middle box smaller"
  4. agent edits XML, runs: mmg render diagram.xml
  5. agent inspects the image; browser syncs from the file
`);
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags.set(key, true);
      continue;
    }
    flags.set(key, next);
    i += 1;
  }
  return { positional, flags };
}

function getFlag(parsed: Args, key: string, fallback: string) {
  const value = parsed.flags.get(key);
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean') {
    throw new Error(`Missing value for --${key}`);
  }
  return fallback;
}

function getOptionalFlag(parsed: Args, key: string) {
  const value = parsed.flags.get(key);
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean') {
    throw new Error(`Missing value for --${key}`);
  }
  return null;
}
