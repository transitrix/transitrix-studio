/**
 * Bundles the VS Code extension source into a single ESM file,
 * including all npm runtime dependencies (e.g. js-yaml).
 * Replaces the tsc-only compile step for the extension output.
 *
 * External modules that VS Code provides at runtime:
 *   - vscode
 *   - Node.js built-ins (node:*, path, url, etc.)
 */
import esbuild from 'esbuild';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

await esbuild.build({
  entryPoints: [resolve(root, 'extension/src/extension.ts')],
  bundle: true,
  outfile: resolve(root, 'extension/out/extension.js'),
  external: [
    'vscode',
    'node:path',
    'node:url',
    'node:fs',
    'node:fs/promises',
    'node:child_process',
    'node:os',
    'node:http',
    'node:https',
    'node:stream',
    'node:util',
    'node:events',
    'node:buffer',
    'node:crypto',
    'path',
    'url',
    'fs',
    'os',
    'http',
    'https',
    'stream',
    'util',
    'events',
    'buffer',
    'child_process',
    'crypto',
  ],
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: false,
  logLevel: 'info',
});
