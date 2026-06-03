/**
 * Bundles `@transitrix/diagrams` into a browser-ready ESM-IIFE for the
 * IntelliJ JCEF preview surface (ADR 0001 step 2).
 *
 * Inputs:
 *   - packages/diagrams/src/webview/entry.ts (the host-facing API)
 *   - packages/diagrams/src/webview/styles.css (base + error-panel theme)
 *
 * Outputs (under packages/diagrams/dist/webview/):
 *   - transitrix-render.js   — IIFE; installs `window.transitrix.render(...)`
 *   - transitrix-render.css  — base styles
 *
 * Step 3+ of the IntelliJ epic copies these into the plugin `.zip` under
 * `resources/webview/` so JCEF can load them at runtime. The bundle is fully
 * self-contained (js-yaml is inlined), so there is no runtime dependency on a
 * node_modules tree on the JVM side.
 *
 * `platform: 'browser'` + `external: []` makes esbuild fail loudly if any
 * Node-only API (fs, path, child_process, etc.) sneaks into the diagrams
 * library — that's the "is @transitrix/diagrams browser-safe?" check the ADR
 * called for.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'packages', 'diagrams', 'src', 'webview', 'entry.ts');
const cssSrc = path.join(root, 'packages', 'diagrams', 'src', 'webview', 'styles.css');
const outDir = path.join(root, 'packages', 'diagrams', 'dist', 'webview');
const outJs = path.join(outDir, 'transitrix-render.js');
const outCss = path.join(outDir, 'transitrix-render.css');

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  outfile: outJs,
  platform: 'browser',
  format: 'iife',
  globalName: '__transitrixWebview',
  target: ['es2020'],
  sourcemap: true,
  // Keep the bundle self-contained for JCEF. We expressly do NOT mark anything
  // external — if a Node-only import slips into @transitrix/diagrams, esbuild
  // raises here, which is what we want for the browser-safety guard.
  external: [],
  metafile: true,
  logLevel: 'info',
});

await fs.copyFile(cssSrc, outCss);

// Manual safety net for Node-only globals that esbuild would otherwise
// substitute via shims rather than reject. None of @transitrix/diagrams should
// touch these — if it ever does, fail the build instead of shipping a bundle
// that explodes inside JCEF.
const bundled = await fs.readFile(outJs, 'utf8');
const banned = ['__dirname', '__filename', 'require(', 'process.env'];
const hits = banned.filter((tok) => bundled.includes(tok));
if (hits.length > 0) {
  throw new Error(
    `Browser-bundle leaked Node-only token(s): ${hits.join(', ')}. ` +
      `The diagrams library must stay browser-safe (ADR 0001 step 2).`,
  );
}

const sizeKb = (Buffer.byteLength(bundled, 'utf8') / 1024).toFixed(1);
console.log(`Webview bundle → ${path.relative(root, outJs)} (${sizeKb} KB)`);
console.log(`Webview styles → ${path.relative(root, outCss)}`);

// Surface esbuild's metafile size summary so PR reviews can spot drift.
if (result.metafile) {
  const inputs = Object.entries(result.metafile.inputs)
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 5);
  console.log('Top 5 inputs by size:');
  for (const [name, info] of inputs) {
    console.log(`  ${(info.bytes / 1024).toFixed(1).padStart(7)} KB  ${name}`);
  }
}
