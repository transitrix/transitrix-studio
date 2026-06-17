/**
 * Assembles the slim @transitrix/cli npm package under packages/cli/.
 *
 * Runs at the workspace's `prepack` (so `npm pack` and `npm publish` both
 * regenerate dist/ + schemas/ deterministically from the current source tree).
 * Outputs:
 *   packages/cli/dist/cli.js                 — bundled entry (shebang preserved)
 *   packages/cli/dist/repo-validate.js       — bundled `validate --scope=repo` handler
 *   packages/cli/dist/export-compliance.js   — bundled `export-compliance` handler
 *   packages/cli/dist/validate-notation.js   — bundled per-notation `validate <file>` dispatch
 *   packages/cli/schemas/bpmn-dsl.schema.json — copied from root schemas/
 *
 * Runtime npm dependencies are kept external; they are declared in
 * packages/cli/package.json and resolved by npm at install time. The
 * Transitrix diagrams *source* (imported by repo-validate.ts,
 * export-compliance.ts and validate-notation.ts) is bundled in — the slim
 * package does not list @transitrix/diagrams as a runtime dependency.
 */
import esbuild from 'esbuild';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NODE_BUILTIN_EXTERNALS, REQUIRE_BANNER, COMPILER_RUNTIME_EXTERNALS } from './esbuild-helpers.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkgRoot = resolve(root, 'packages', 'cli');
const distOut = resolve(pkgRoot, 'dist');
const schemaOut = resolve(pkgRoot, 'schemas');

await fs.rm(distOut, { recursive: true, force: true });
await fs.mkdir(distOut, { recursive: true });
await fs.rm(schemaOut, { recursive: true, force: true });
await fs.mkdir(schemaOut, { recursive: true });

// Mirrors packages/cli/package.json "dependencies". Kept external so npm
// resolves them at install time (ajv has dynamic require patterns that
// esbuild cannot reliably inline).
const RUNTIME_DEPS_EXTERNAL = COMPILER_RUNTIME_EXTERNALS;

const sharedBuildOptions = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  logLevel: 'info',
  external: [...NODE_BUILTIN_EXTERNALS, ...RUNTIME_DEPS_EXTERNAL],
  banner: REQUIRE_BANNER,
};

await esbuild.build({
  ...sharedBuildOptions,
  entryPoints: { cli: resolve(root, 'src', 'cli.ts') },
  outdir: distOut,
});

await esbuild.build({
  ...sharedBuildOptions,
  entryPoints: { 'repo-validate': resolve(root, 'src', 'repo-validate.ts') },
  outdir: distOut,
});

await esbuild.build({
  ...sharedBuildOptions,
  entryPoints: { 'export-compliance': resolve(root, 'src', 'export-compliance.ts') },
  outdir: distOut,
});

await esbuild.build({
  ...sharedBuildOptions,
  entryPoints: { 'validate-notation': resolve(root, 'src', 'validate-notation.ts') },
  outdir: distOut,
});

// Restore the shebang on the CLI entry — esbuild strips it from non-IIFE
// bundles. Without it, `npm i -g` installs a bin that can't be executed
// directly on POSIX (Windows uses the shim that npm writes either way).
const cliPath = resolve(distOut, 'cli.js');
const cliSource = await fs.readFile(cliPath, 'utf8');
if (!cliSource.startsWith('#!')) {
  await fs.writeFile(cliPath, `#!/usr/bin/env node\n${cliSource}`);
}

// Copy the JSON Schema next to dist/ so `dist/../schemas/bpmn-dsl.schema.json`
// resolves at runtime (see src/schema-path.ts).
for (const name of await fs.readdir(resolve(root, 'schemas'))) {
  if (name.endsWith('.json')) {
    await fs.copyFile(resolve(root, 'schemas', name), resolve(schemaOut, name));
  }
}

console.log(`@transitrix/cli assembled → ${pkgRoot}`);
