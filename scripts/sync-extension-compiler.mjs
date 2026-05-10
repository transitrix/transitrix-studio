import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const compilerOut = path.join(root, 'extension', 'compiler');
const schemaOut = path.join(root, 'extension', 'schemas');

await fs.rm(compilerOut, { recursive: true, force: true });
await fs.rm(schemaOut, { recursive: true, force: true });
await fs.mkdir(compilerOut, { recursive: true });
await fs.mkdir(schemaOut, { recursive: true });

for (const name of await fs.readdir(path.join(root, 'dist'))) {
  if (name.endsWith('.js') || name.endsWith('.js.map')) {
    await fs.copyFile(path.join(root, 'dist', name), path.join(compilerOut, name));
  }
}

for (const name of await fs.readdir(path.join(root, 'schemas'))) {
  await fs.copyFile(path.join(root, 'schemas', name), path.join(schemaOut, name));
}

console.log('Synced dist/ → extension/compiler/, schemas → extension/schemas/');
