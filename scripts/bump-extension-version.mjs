import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const extPkgPath = path.join(root, 'extension', 'package.json');
const rootPkgPath = path.join(root, 'package.json');

function bumpPatch(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) {
    throw new Error(
      `bump-extension-version: expected semver X.Y.Z, got "${version}".`,
    );
  }
  const next = `${m[1]}.${m[2]}.${String(Number(m[3]) + 1)}`;
  return next;
}

const extRaw = await fs.readFile(extPkgPath, 'utf8');
const extPkg = JSON.parse(extRaw);
const prev = extPkg.version;
const next = bumpPatch(String(prev));

extPkg.version = next;
await fs.writeFile(extPkgPath, `${JSON.stringify(extPkg, null, 2)}\n`, 'utf8');

const rootRaw = await fs.readFile(rootPkgPath, 'utf8');
const rootPkg = JSON.parse(rootRaw);
rootPkg.version = next;
await fs.writeFile(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`, 'utf8');

console.log(`Version: ${prev} → ${next} (extension/package.json + package.json)`);
