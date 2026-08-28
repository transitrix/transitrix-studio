/**
 * Sync schemas/ → extension/schemas/
 * Ensures schema consistency test (RD-098) can run without extension:prep.
 */
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const schemaOut = resolve(root, 'extension', 'schemas');

await fs.rm(schemaOut, { recursive: true, force: true });
await fs.mkdir(schemaOut, { recursive: true });
for (const name of await fs.readdir(resolve(root, 'schemas'))) {
  await fs.copyFile(resolve(root, 'schemas', name), resolve(schemaOut, name));
}

console.log('schemas → extension/schemas/');
