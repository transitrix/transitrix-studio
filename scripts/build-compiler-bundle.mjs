/**
 * Bundles the BPMN compiler entries (compiler.ts, metrics.ts) into ESM files
 * in extension/compiler/. Runtime npm dependencies (ajv, ajv-formats,
 * bpmn-moddle, elkjs, js-yaml, xmlbuilder2 — COMPILER_RUNTIME_EXTERNALS) are
 * bundled inline: each was verified to have no dynamic `require()` that
 * survives esbuild bundling (a full compile + ELK layout + XML emission +
 * ajv validation run, both success and failure paths, was exercised against
 * the bundled output — see epic transitrix-hq#138 hold 2 / task
 * transitrix-hq#140).
 *
 * Also syncs schemas/ → extension/schemas/. `extension/package.json` now
 * declares no runtime dependencies (`@resvg/resvg-js` removed — hold 3,
 * transitrix-hq#141: PNG export rasterizes in the webview's own canvas), so
 * there is no longer a runtime install step here — the VSIX ships with no
 * `extension/node_modules/` at all.
 */
import esbuild from 'esbuild';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NODE_BUILTIN_EXTERNALS, REQUIRE_BANNER } from './esbuild-helpers.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const compilerOut = resolve(root, 'extension', 'compiler');
const schemaOut = resolve(root, 'extension', 'schemas');

// Rebuild compiler output directory
await fs.rm(compilerOut, { recursive: true, force: true });
await fs.mkdir(compilerOut, { recursive: true });

await esbuild.build({
  entryPoints: [
    resolve(root, 'src', 'compiler.ts'),
    resolve(root, 'src', 'metrics.ts'),
  ],
  bundle: true,
  outdir: compilerOut,
  external: ['vscode', ...NODE_BUILTIN_EXTERNALS],
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: false,
  logLevel: 'info',
  banner: REQUIRE_BANNER,
});

// Sync schemas
await fs.rm(schemaOut, { recursive: true, force: true });
await fs.mkdir(schemaOut, { recursive: true });
for (const name of await fs.readdir(resolve(root, 'schemas'))) {
  await fs.copyFile(resolve(root, 'schemas', name), resolve(schemaOut, name));
}

// Drop any previously copied Python backend runtime — the blocks notation
// now renders natively in TypeScript and the svgbob/Python pipeline has been
// removed. Older clones may still carry extension/backends/ from a previous
// prep run; clear it so the VSIX does not ship dead files.
await fs.rm(resolve(root, 'extension', 'backends'), { recursive: true, force: true });

// extension/package.json declares no runtime dependencies (the @resvg/resvg-js
// carve-out is gone — hold 3, transitrix-hq#141), so there is nothing left to
// install. Clear any extension/node_modules/ an older prep run may have left
// behind so a stale native binary can't leak into the packaged VSIX.
await fs.rm(resolve(root, 'extension', 'node_modules'), { recursive: true, force: true });

console.log('Compiler bundle → extension/compiler/  |  schemas → extension/schemas/');
