#!/usr/bin/env node
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const diagramsPkgPath = resolve(root, 'packages', 'diagrams', 'package.json');
const cliDistMetaPath = resolve(root, 'packages', 'cli', 'dist', 'bundle-metadata.json');

const diagramsPkg = JSON.parse(await fs.readFile(diagramsPkgPath, 'utf8'));
let bundleMeta;
try {
  bundleMeta = JSON.parse(await fs.readFile(cliDistMetaPath, 'utf8'));
} catch (error) {
  console.error('[cli-bundle-check] missing bundle metadata at packages/cli/dist/bundle-metadata.json');
  console.error('[cli-bundle-check] run the CLI prepack/build step first.');
  throw error;
}

const expected = String(diagramsPkg.version);
const actual = String(bundleMeta?.diagramsVersion ?? '');

if (actual !== expected) {
  console.error(
    `[cli-bundle-check] diagrams version mismatch: bundled=${actual || '<missing>'}, workspace=${expected}`,
  );
  process.exit(1);
}

console.log(`[cli-bundle-check] ok: bundled diagrams version ${actual}`);
