#!/usr/bin/env node

/**
 * WARNING: Unedited AI output.
 *
 * Build browser + Node CLI bundles with esbuild.
 *
 *   node build.mjs
 */
import * as esbuild from 'esbuild';
import { chmod, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const distCli = join(root, 'dist', 'my-max-graph.js');
const browserOut = join(root, 'public', 'app.js');

await mkdir(join(root, 'dist'), { recursive: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(root, 'modules', 'browser', 'main.tsx')],
  bundle: true,
  outfile: browserOut,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  logLevel: 'info',
});

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(root, 'modules', 'cli', 'main.ts')],
  bundle: true,
  outfile: distCli,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});

await chmod(distCli, 0o755);

console.log(`Built ${browserOut}`);
console.log(`Built ${distCli}`);
