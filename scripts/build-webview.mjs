import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'node_modules', 'bpmn-js', 'dist', 'assets');
const mediaDir = path.join(root, 'extension', 'media');
const extensionAssets = path.join(root, 'extension', 'assets');

await fs.rm(mediaDir, { recursive: true, force: true });
await fs.mkdir(mediaDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'extension', 'webview', 'viewer.ts')],
  bundle: true,
  outfile: path.join(mediaDir, 'viewer.js'),
  platform: 'browser',
  format: 'iife',
  sourcemap: true,
  loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.svg': 'file' },
  target: ['es2020'],
});

await fs.cp(path.join(assets, 'diagram-js.css'), path.join(mediaDir, 'diagram-js.css'));
await fs.cp(path.join(assets, 'bpmn-js.css'), path.join(mediaDir, 'bpmn-js.css'));
await fs.cp(path.join(assets, 'bpmn-font'), path.join(mediaDir, 'bpmn-font'), { recursive: true });

// Monochrome Transitrix mark for the unified Preview command icon — source
// lives in extension/assets/ (tracked); media/ itself is gitignored build
// output regenerated on every extension:prep.
await fs.cp(
  path.join(extensionAssets, 'transitrix-icon-mono.svg'),
  path.join(mediaDir, 'transitrix-icon-mono.svg'),
);

console.log('Webview bundled to extension/media');
