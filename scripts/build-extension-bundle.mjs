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
import { NODE_BUILTIN_EXTERNALS, REQUIRE_BANNER } from './esbuild-helpers.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

await esbuild.build({
  entryPoints: [resolve(root, 'extension/src/extension.ts')],
  bundle: true,
  outfile: resolve(root, 'extension/out/extension.js'),
  external: [
    'vscode',
    // Native module — its platform .node binary cannot be bundled; resolved
    // at runtime from the node_modules shipped inside the VSIX.
    '@resvg/resvg-js',
    ...NODE_BUILTIN_EXTERNALS,
  ],
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: false,
  logLevel: 'info',
  banner: REQUIRE_BANNER,
});
