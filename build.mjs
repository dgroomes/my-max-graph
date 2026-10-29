#!/usr/bin/env node

/**
 * Build browser + Node CLI bundles with esbuild.
 *
 *   node build.mjs
 */
import * as esbuild from 'esbuild';
import { chmod, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const distCli = join(root, 'dist', 'mmg.js');
const browserOut = join(root, 'public', 'app.js');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const buildTimestamp = new Date().toISOString();

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
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
  },
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});

await chmod(distCli, 0o755);

console.log(`Built ${browserOut}`);
console.log(`Built ${distCli}`);
