import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const extPkgPath = path.join(root, 'extension', 'package.json');
const rootPkgPath = path.join(root, 'package.json');

const USAGE = `bump-extension-version: bump the version in extension/package.json and package.json.

Usage:
  node scripts/bump-extension-version.mjs                    Patch bump (default)
  node scripts/bump-extension-version.mjs patch              Patch bump (X.Y.Z → X.Y.[Z+1])
  node scripts/bump-extension-version.mjs minor              Minor bump (X.Y.Z → X.[Y+1].0)
  node scripts/bump-extension-version.mjs major              Major bump (X.Y.Z → [X+1].0.0)
  node scripts/bump-extension-version.mjs set 1.0.0          Set an explicit version

Cutting 1.0.0 from 0.4.x:
  node scripts/bump-extension-version.mjs set 1.0.0`;

function parseSemver(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) {
    throw new Error(
      `bump-extension-version: expected semver X.Y.Z, got "${version}".`,
    );
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function nextVersion(current, mode, explicit) {
  if (mode === 'set') {
    if (!explicit) throw new Error('bump-extension-version: "set" requires an explicit version.');
    parseSemver(explicit); // Validate that the explicit value is a clean semver.
    return explicit;
  }
  const [major, minor, patch] = parseSemver(current);
  if (mode === 'major') return `${major + 1}.0.0`;
  if (mode === 'minor') return `${major}.${minor + 1}.0`;
  if (mode === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`bump-extension-version: unknown mode "${mode}". See --help.`);
}

const argv = process.argv.slice(2);

if (argv.includes('-h') || argv.includes('--help')) {
  console.log(USAGE);
  process.exit(0);
}

const mode = argv[0] ?? 'patch';
const explicit = mode === 'set' ? argv[1] : undefined;

const extRaw = await fs.readFile(extPkgPath, 'utf8');
const extPkg = JSON.parse(extRaw);
const prev = String(extPkg.version);
const next = nextVersion(prev, mode, explicit);

extPkg.version = next;
await fs.writeFile(extPkgPath, `${JSON.stringify(extPkg, null, 2)}\n`, 'utf8');

const rootRaw = await fs.readFile(rootPkgPath, 'utf8');
const rootPkg = JSON.parse(rootRaw);
rootPkg.version = next;
await fs.writeFile(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`, 'utf8');

console.log(`Version: ${prev} → ${next} (extension/package.json + package.json)`);
