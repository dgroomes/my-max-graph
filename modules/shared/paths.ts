import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the my-max-graph package root (directory with package.json + public/).
 *
 * Order:
 * 1. MY_MAX_GRAPH_ROOT
 * 2. Walk from this module / the bundled CLI location
 */
export function resolveProjectRoot(fromMetaUrl: string = import.meta.url): string {
  const envRoot = process.env.MY_MAX_GRAPH_ROOT?.trim();
  if (envRoot) {
    const resolved = resolve(envRoot);
    if (!isProjectRoot(resolved)) {
      throw new Error(`MY_MAX_GRAPH_ROOT is not a my-max-graph project root: ${resolved}`);
    }
    return resolved;
  }

  const fromMeta = dirname(fileURLToPath(fromMetaUrl));
  // Bundled CLI lives in dist/; source modules live under modules/*/.
  const candidates = [
    resolve(fromMeta, '..'),
    resolve(fromMeta, '../..'),
    fromMeta,
    process.cwd(),
  ];

  for (const candidate of candidates) {
    if (isProjectRoot(candidate)) {
      return candidate;
    }
  }

  let dir = process.cwd();
  for (let i = 0; i < 12; i += 1) {
    if (isProjectRoot(dir)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  throw new Error(
    'Could not locate my-max-graph package root (needs public/ and package.json). Set MY_MAX_GRAPH_ROOT.',
  );
}

export function publicDir(root: string) {
  return join(root, 'public');
}

function isProjectRoot(dir: string) {
  return existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'public'));
}
