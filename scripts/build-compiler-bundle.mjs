/**
 * Bundles the BPMN compiler entries (compiler.ts, metrics.ts) into ESM files
 * in extension/compiler/. Runtime npm dependencies (ajv, ajv-formats,
 * bpmn-moddle, elkjs, js-yaml, xmlbuilder2 — COMPILER_RUNTIME_EXTERNALS) are
 * bundled inline: each was verified to have no dynamic `require()` that
 * survives esbuild bundling (a full compile + ELK layout + XML emission +
 * ajv validation run, both success and failure paths, was exercised against
 * the bundled output — see epic transitrix-hq#138 hold 2 / task
 * transitrix-hq#140). Only `@resvg/resvg-js` stays external: it is a native
 * module whose platform `.node` binary cannot be bundled by esbuild.
 *
 * Also syncs schemas/ → extension/schemas/ and installs the one remaining
 * runtime dependency declared in extension/package.json (`@resvg/resvg-js`)
 * into a clean extension/node_modules/ (independent of workspace hoisting).
 * This is a temporary, resvg-only carve-out — hold 3 (transitrix-hq#141)
 * removes `@resvg/resvg-js` entirely and this install step goes with it.
 */
import esbuild from 'esbuild';
import fs from 'node:fs/promises';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NODE_BUILTIN_EXTERNALS, REQUIRE_BANNER } from './esbuild-helpers.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const compilerOut = resolve(root, 'extension', 'compiler');
const schemaOut = resolve(root, 'extension', 'schemas');
const extensionRoot = resolve(root, 'extension');

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

// Install the one remaining runtime dep (@resvg/resvg-js) into
// extension/node_modules/ — clean install, ignoring the workspace at root so
// the result is a standalone tree (no symlinks to hoisted packages, which
// would otherwise cause vsce's case-insensitive duplicate-paths error). This
// is a temporary, resvg-only carve-out: hold 3 (transitrix-hq#141) removes
// @resvg/resvg-js entirely and this install step goes with it.
const extNodeModules = resolve(extensionRoot, 'node_modules');
await fs.rm(extNodeModules, { recursive: true, force: true });

// Install into a temp dir (fully isolated from the root npm workspaces
// config), then move the resulting node_modules into extension/. Running
// `npm install` directly in extension/ has been unreliable — npm 11's
// --no-workspaces still hits workspace filter logic and silently produces
// an empty install. The temp-dir approach is workspace-blind, so it works
// regardless of root configuration.
//
// Use RUNNER_TEMP when available (GitHub-hosted Windows runners put it on the
// same drive as the workspace, avoiding EXDEV on the rename below). Falls back
// to os.tmpdir() for local development where a single device is the norm.
const tempBase = process.env.RUNNER_TEMP ?? os.tmpdir();
const tempInstall = await fs.mkdtemp(resolve(tempBase, 'tx-ext-install-'));
await fs.copyFile(
  resolve(extensionRoot, 'package.json'),
  resolve(tempInstall, 'package.json'),
);
await fs.copyFile(
  resolve(extensionRoot, 'package-lock.json'),
  resolve(tempInstall, 'package-lock.json'),
);

console.log(`Installing @resvg/resvg-js in temp dir: ${tempInstall}`);
execSync(
  // npm ci against the committed lockfile — exact versions, not ranges, so
  // the resolved tree is pinned rather than whatever `^` allows on the day.
  // --legacy-peer-deps escapes the @types/react peer conflict in sibling
  // @transitrix/diagrams (which the temp-isolated install does NOT see,
  // but kept defensively so the script doesn't trip if extension/
  // package.json later lists a peer-conflicting dep on purpose).
  'npm ci --omit=dev --no-audit --no-fund --legacy-peer-deps',
  { cwd: tempInstall, stdio: 'inherit' },
);

// Move the temp node_modules into the extension folder
await fs.rename(resolve(tempInstall, 'node_modules'), extNodeModules);
await fs.rm(tempInstall, { recursive: true, force: true });

// @resvg/resvg-js (PNG export) is a NATIVE module: its
// platform `.node` binary ships as a per-OS optional dependency, so `npm
// install` lays down only the binary matching the build machine. That is
// exactly right for per-platform VSIX packaging (`vsce package --target`),
// but it means a build on one OS cannot produce a working VSIX for another —
// build each target on its own OS (or CI runner). Fail loudly if neither the
// package nor any platform binary landed, so a broken PNG build is caught at
// prep time rather than by the user.
try {
  await fs.access(resolve(extNodeModules, '@resvg', 'resvg-js', 'package.json'));
} catch {
  throw new Error(
    'extension/node_modules/@resvg/resvg-js not found after install. ' +
    'Check extension/package.json declares "@resvg/resvg-js" in dependencies.',
  );
}
const resvgScoped = await fs.readdir(resolve(extNodeModules, '@resvg')).catch(() => []);
const hasResvgBinary = resvgScoped.some((d) => d.startsWith('resvg-js-'));
if (!hasResvgBinary) {
  throw new Error(
    'No @resvg/resvg-js platform binary (@resvg/resvg-js-<platform>) installed. ' +
    'PNG export would fail at runtime. Build the VSIX on the target platform, ' +
    'or install the matching optional dependency before packaging.',
  );
}

console.log('Compiler bundle → extension/compiler/  |  schemas → extension/schemas/  |  runtime deps → extension/node_modules/');
