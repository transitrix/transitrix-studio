/**
 * Cross-platform replacement for build-extension.bat / build-extension.sh.
 * Runs extension:prep, optionally bumps the version, verifies packaging, and
 * invokes `vsce package` to produce a universal .vsix in output/.
 *
 * Usage:
 *   node scripts/package-extension.mjs              Build the VSIX
 *   node scripts/package-extension.mjs --bump       Patch bump, then build
 *
 * The extension declares no runtime dependencies and no native/platform
 * component, so `vsce package` (no `--target`) produces a single VSIX that
 * installs on any OS/arch — see docs/internal/packaging.md.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { mediaReviewSuites } from './verify-extension-packaging.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = path.join(root, 'extension');
const outputDir = path.join(root, 'output');

const USAGE = `package-extension — build the VS Code extension's universal .vsix.

Usage:
  node scripts/package-extension.mjs [--bump]

Options:
  --bump    Patch-bump the extension version before packaging.`;

const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help')) {
  console.log(USAGE);
  process.exit(0);
}

let bump = false;

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--bump') {
    bump = true;
  } else {
    console.error(`package-extension: unknown argument "${argv[i]}".`);
    console.error('Usage: node scripts/package-extension.mjs [--bump]');
    process.exit(2);
  }
}

// Windows: spawning a .cmd (npm.cmd, npx.cmd) requires shell:true since
// Node 18.20.2 (CVE-2024-27980). Do NOT quote the command — Node 26 changed
// %~dp0 resolution so a quoted command resolves relative to CWD instead of
// the Node install dir, breaking npm.cmd's own path lookups.
function run(command, args, options = {}) {
  const isBatch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: isBatch,
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with code ${code}`));
    });
  });
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

await fs.mkdir(outputDir, { recursive: true });

console.log('\n=== [1/3] extension:prep');
await run(npm, ['run', 'extension:prep'], { cwd: root });

if (bump) {
  console.log('\n=== [2/3] bump-extension-version');
  await run(npm, ['run', 'bump-extension-version'], { cwd: root });
} else {
  console.log('\n=== [2/3] skipping version bump (pass --bump to enable)');
}

console.log('\n=== verify-extension-packaging');
await run(
  process.execPath,
  [path.join(root, 'scripts', 'verify-extension-packaging.mjs')],
  { cwd: root },
);

console.log('\n=== [3/3] vsce package -> output/');

const vsceArgs = ['--no-install', 'vsce', 'package'];
// Relative output path from extensionDir avoids shell-quoting concerns on
// paths that contain spaces (e.g. a Windows home dir with a space in the name).
vsceArgs.push('-o', '../output');

await run(npx, vsceArgs, { cwd: extensionDir });

const manifest = JSON.parse(await fs.readFile(path.join(extensionDir, 'package.json'), 'utf8'));
const vsix = path.join(outputDir, `${manifest.name}-${manifest.version}.vsix`);
const reviewDir = await fs.mkdtemp(path.join(os.tmpdir(), 'listing-review-'));
try {
  // Reuse the renderer and editing regression suites for every candidate.
  // The transient review is neither shipped nor uploaded as a public artifact.
  const reportPath = path.join(reviewDir, 'tests.json');
  await run(process.execPath, [
    path.join(root, 'node_modules/vitest/vitest.mjs'), 'run',
    ...mediaReviewSuites, '--maxWorkers=2', '--reporter=json', `--outputFile=${reportPath}`,
  ], { cwd: path.join(root, 'packages/diagrams') });
  const reviewPath = path.join(reviewDir, 'review.json');
  await fs.writeFile(reviewPath, JSON.stringify({
    packageSha256: createHash('sha256').update(await fs.readFile(vsix)).digest('hex'),
    tests: JSON.parse(await fs.readFile(reportPath, 'utf8')),
  }));
  await run(process.execPath, [path.join(root, 'scripts/verify-extension-packaging.mjs'),
    '--vsix', vsix, '--review', reviewPath], { cwd: root });
} finally {
  await fs.rm(reviewDir, { recursive: true, force: true });
}

const vsixFiles = (await fs.readdir(outputDir)).filter((f) => f.endsWith('.vsix'));
console.log('\nBuild complete. Artifacts in output/:');
for (const f of vsixFiles) console.log(`  ${f}`);
