/**
 * Cross-platform replacement for build-extension.bat / build-extension.sh.
 * Runs extension:prep, optionally bumps the version, verifies packaging, and
 * invokes `vsce package` to produce a .vsix in output/.
 *
 * Usage:
 *   node scripts/package-extension.mjs              Universal VSIX (local install only)
 *   node scripts/package-extension.mjs --bump       Patch bump, then build
 *   node scripts/package-extension.mjs --target win32-x64  Targeted VSIX
 *   node scripts/package-extension.mjs --bump --target darwin-arm64
 *
 * WARNING — universal build (no --target):
 *   `vsce package` without --target produces a VSIX claiming universal
 *   compatibility but carrying only the build machine's resvg binary.
 *   PNG export will fail on any other OS/arch. Use ONLY for local install
 *   testing — NEVER publish to the Marketplace without --target.
 *   See docs/packaging.md.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = path.join(root, 'extension');
const outputDir = path.join(root, 'output');

const SUPPORTED_TARGETS = [
  'win32-x64', 'win32-arm64',
  'darwin-x64', 'darwin-arm64',
  'linux-x64', 'linux-arm64',
];

const USAGE = `package-extension — build the VS Code extension .vsix.

Usage:
  node scripts/package-extension.mjs [--bump] [--target <target>]

Options:
  --bump            Patch-bump the extension version before packaging.
  --target <value>  Build a platform-specific VSIX (required for Marketplace).
                    Supported: ${SUPPORTED_TARGETS.join(', ')}.

WARNING: building without --target produces a universal VSIX carrying only the
build machine's @resvg/resvg-js binary. Install locally only — do not publish
to the Marketplace. See docs/packaging.md.`;

const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help')) {
  console.log(USAGE);
  process.exit(0);
}

let bump = false;
let target = '';

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--bump') {
    bump = true;
  } else if (argv[i] === '--target') {
    if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
      console.error('package-extension: --target requires a value (e.g. win32-x64).');
      process.exit(2);
    }
    target = argv[++i];
  } else if (argv[i].startsWith('--target=')) {
    target = argv[i].slice('--target='.length);
    if (!target) {
      console.error('package-extension: --target requires a value (e.g. win32-x64).');
      process.exit(2);
    }
  } else {
    console.error(`package-extension: unknown argument "${argv[i]}".`);
    console.error('Usage: node scripts/package-extension.mjs [--bump] [--target <target>]');
    process.exit(2);
  }
}

// Windows: spawning a .cmd (npm.cmd, npx.cmd) requires shell:true since
// Node 18.20.2 (CVE-2024-27980). Quote the command so a path with spaces
// survives; other executables (node via process.execPath) spawn directly.
function run(command, args, options = {}) {
  const isBatch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command);
  return new Promise((resolve, reject) => {
    const child = spawn(isBatch ? `"${command}"` : command, args, {
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

if (target) {
  console.log(`\n=== [3/3] vsce package --target ${target} -> output/`);
} else {
  console.log('\n=== [3/3] vsce package -> output/');
  console.log('package-extension: WARNING - no --target given; VSIX is local-install only.');
  console.log('package-extension: see docs/packaging.md before publishing to the Marketplace.');
}

const vsceArgs = ['--no-install', 'vsce', 'package'];
if (target) vsceArgs.push('--target', target);
// Relative output path from extensionDir avoids shell-quoting concerns on
// paths that contain spaces (e.g. a Windows home dir with a space in the name).
vsceArgs.push('-o', '../output');

await run(npx, vsceArgs, { cwd: extensionDir });

const vsixFiles = (await fs.readdir(outputDir)).filter((f) => f.endsWith('.vsix'));
console.log('\nBuild complete. Artifacts in output/:');
for (const f of vsixFiles) console.log(`  ${f}`);
