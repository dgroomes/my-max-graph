/**
 * WARNING: Unedited AI output.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeTextFile(path: string, contents: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents.endsWith('\n') ? contents : `${contents}\n`, 'utf8');
}
