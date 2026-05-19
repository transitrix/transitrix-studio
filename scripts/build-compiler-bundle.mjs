/**
 * Bundles the BPMN compiler entries (compiler.ts, metrics.ts) into ESM files
 * in extension/compiler/. Marks runtime npm dependencies as external — they
 * are installed into extension/node_modules/ as a separate step so they can
 * resolve at runtime in the installed VSIX (some have dynamic require
 * patterns that esbuild cannot fully inline).
 *
 * Also syncs schemas/ → extension/schemas/ and installs the runtime
 * dependencies declared in extension/package.json into a clean
 * extension/node_modules/ (independent of the workspace hoisting).
 */
import esbuild from 'esbuild';
import fs from 'node:fs/promises';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const compilerOut = resolve(root, 'extension', 'compiler');
const schemaOut = resolve(root, 'extension', 'schemas');
const backendsOut = resolve(root, 'extension', 'backends', 'blocks');
const extensionRoot = resolve(root, 'extension');

// Runtime Python scripts copied from backends/blocks/ into extension/backends/blocks/.
// The root backends/ tree is the canonical source (also used by the CLI through
// src/blocks-backend.ts); extension/backends/ is regenerated on every prep.
const BACKEND_RUNTIME_FILES = ['blocks_stdio.py', 'diagram_generator.py'];

// Rebuild compiler output directory
await fs.rm(compilerOut, { recursive: true, force: true });
await fs.mkdir(compilerOut, { recursive: true });

const NODE_BUILTIN_EXTERNALS = [
  'vscode',
  'node:path', 'node:url', 'node:fs', 'node:fs/promises',
  'node:child_process', 'node:os', 'node:http', 'node:https',
  'node:stream', 'node:util', 'node:events', 'node:buffer',
  'node:crypto', 'node:worker_threads', 'node:module',
  'path', 'url', 'fs', 'os', 'child_process', 'crypto',
  'http', 'https', 'stream', 'util', 'events', 'buffer',
  'worker_threads',
];

// Runtime npm deps declared in extension/package.json — kept external so the
// installed extension can resolve them via node_modules at runtime. Some
// (notably ajv) have dynamic require patterns that esbuild cannot inline
// reliably; shipping the real packages avoids fighting the bundler.
const RUNTIME_DEPS_EXTERNAL = [
  'ajv',
  'ajv-formats',
  'elkjs',
  'js-yaml',
  'xmlbuilder2',
  'bpmn-moddle',
];

await esbuild.build({
  entryPoints: [
    resolve(root, 'src', 'compiler.ts'),
    resolve(root, 'src', 'metrics.ts'),
  ],
  bundle: true,
  outdir: compilerOut,
  external: [...NODE_BUILTIN_EXTERNALS, ...RUNTIME_DEPS_EXTERNAL],
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: false,
  logLevel: 'info',
  // Inject createRequire so bundled CJS deps' dynamic `require(...)` calls
  // resolve via Node's real module resolver instead of esbuild's stub.
  banner: {
    js: "import { createRequire as __createRequire__ } from 'node:module'; const require = __createRequire__(import.meta.url);",
  },
});

// Sync schemas
await fs.rm(schemaOut, { recursive: true, force: true });
await fs.mkdir(schemaOut, { recursive: true });
for (const name of await fs.readdir(resolve(root, 'schemas'))) {
  await fs.copyFile(resolve(root, 'schemas', name), resolve(schemaOut, name));
}

// Sync Python backend runtime (nested-blocks generator).
await fs.rm(resolve(root, 'extension', 'backends'), { recursive: true, force: true });
await fs.mkdir(backendsOut, { recursive: true });
for (const name of BACKEND_RUNTIME_FILES) {
  await fs.copyFile(resolve(root, 'backends', 'blocks', name), resolve(backendsOut, name));
}

// Install runtime deps into extension/node_modules/ — clean install, ignoring
// the workspace at root so the result is a standalone tree (no symlinks to
// hoisted packages, which would otherwise cause vsce's case-insensitive
// duplicate-paths error).
const extNodeModules = resolve(extensionRoot, 'node_modules');
await fs.rm(extNodeModules, { recursive: true, force: true });

// Install runtime deps into a temp dir (fully isolated from the root npm
// workspaces config), then move the resulting node_modules into
// extension/. Running `npm install` directly in extension/ has been
// unreliable — npm 11's --no-workspaces still hits workspace filter logic
// and silently produces an empty install. The temp-dir approach is
// workspace-blind, so it works regardless of root configuration.
const tempInstall = await fs.mkdtemp(resolve(os.tmpdir(), 'tx-ext-install-'));
await fs.copyFile(
  resolve(extensionRoot, 'package.json'),
  resolve(tempInstall, 'package.json'),
);

console.log(`Installing runtime dependencies in temp dir: ${tempInstall}`);
execSync(
  // --legacy-peer-deps escapes the @types/react peer conflict in sibling
  // @transitrix/diagrams (which the temp-isolated install does NOT see,
  // but kept defensively so the script doesn't trip if extension/
  // package.json later lists a peer-conflicting dep on purpose).
  'npm install --omit=dev --no-package-lock --no-audit --no-fund --legacy-peer-deps',
  { cwd: tempInstall, stdio: 'inherit' },
);

// Move the temp node_modules into the extension folder
await fs.rename(resolve(tempInstall, 'node_modules'), extNodeModules);
await fs.rm(tempInstall, { recursive: true, force: true });

// Verify a few canonical deps actually landed — fail loudly if they didn't.
for (const dep of RUNTIME_DEPS_EXTERNAL) {
  const pkgJson = resolve(extNodeModules, dep, 'package.json');
  try {
    await fs.access(pkgJson);
  } catch {
    throw new Error(
      `extension/node_modules/${dep}/package.json not found after install. ` +
      `Check extension/package.json declares "${dep}" in dependencies.`,
    );
  }
}

console.log('Compiler bundle → extension/compiler/  |  schemas → extension/schemas/  |  backends → extension/backends/  |  runtime deps → extension/node_modules/');
