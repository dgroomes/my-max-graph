#!/usr/bin/env node

/**
 * WARNING: Unedited AI output.
 *
 * Print module line counts. Output only — the README "Code Mix" table is
 * hand-edited (by a person or an agent) from these numbers.
 *
 * Usage (Node type stripping; no transpile step):
 *   node scripts/module-line-counts.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Row = {
  name: string;
  lines: number;
  files: number;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES_DIR = join(ROOT, 'modules');
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.mjs']);

const modules = readdirSync(MODULES_DIR)
  .filter((name) => statSync(join(MODULES_DIR, name)).isDirectory())
  .sort()
  .map((name) => countModule(name));

const publicStatic = countDir('public/ (static shell)', join(ROOT, 'public'), (rel) => rel !== 'app.js');

const rows: Row[] = [...modules, publicStatic];
const total = rows.reduce((sum, row) => sum + row.lines, 0);

console.log('Module line counts (source lines via wc-equivalent; blank lines included):\n');
for (const row of rows) {
  console.log(`${row.name.padEnd(28)} ${String(row.lines).padStart(5)}  (${row.files} files)`);
}
console.log(`${'TOTAL'.padEnd(28)} ${String(total).padStart(5)}`);

function countModule(name: string): Row {
  const dir = join(MODULES_DIR, name);
  const files = listFiles(dir).filter((file) => CODE_EXT.has(extname(file)));
  return { name: `modules/${name}/`, lines: countLines(files), files: files.length };
}

function countDir(label: string, dir: string, include: (rel: string) => boolean): Row {
  const files = listFiles(dir)
    .filter((file) => CODE_EXT.has(extname(file)))
    .filter((file) => include(relative(dir, file)));
  return { name: label, lines: countLines(files), files: files.length };
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function countLines(files: string[]): number {
  let totalLines = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (text.length === 0) {
      continue;
    }
    totalLines += text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
  }
  return totalLines;
}

function extname(path: string): string {
  const idx = path.lastIndexOf('.');
  return idx >= 0 ? path.slice(idx) : '';
}
