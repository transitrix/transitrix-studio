/**
 * Gate before `vsce package`:
 * 1. extension/ must not contain archive folders (they would ship in the VSIX).
 * 2. Repo root must not use legacy `0. archive/extension/` — retired extension
 *    sources belong under `.archive/extension/`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const extRoot = path.join(root, 'extension');

const FORBIDDEN_UNDER_EXTENSION = new Set(['0. archive', '.archive']);
const LEGACY_EXTENSION_ARCHIVE = path.join(root, '0. archive', 'extension');
const CANONICAL_EXTENSION_ARCHIVE = path.join(root, '.archive', 'extension');

/** @returns {string[]} relative paths under extension/ that must not ship */
function findForbiddenUnderExtension(dir, rel = '') {
  const hits = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return hits;
  }
  for (const ent of entries) {
    const relPath = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (FORBIDDEN_UNDER_EXTENSION.has(ent.name)) {
        hits.push(relPath);
        continue;
      }
      hits.push(...findForbiddenUnderExtension(path.join(dir, ent.name), relPath));
    }
  }
  return hits;
}

let failed = false;

const underExtension = findForbiddenUnderExtension(extRoot);
if (underExtension.length > 0) {
  failed = true;
  console.error('verify-extension-packaging: archive path(s) under extension/ — must not ship in a VSIX:');
  for (const p of underExtension) {
    console.error(`  extension/${p}`);
  }
  console.error('');
  console.error(`Move retired extension sources to ${path.relative(root, CANONICAL_EXTENSION_ARCHIVE)}/ at the repo root.`);
}

if (fs.existsSync(LEGACY_EXTENSION_ARCHIVE)) {
  failed = true;
  console.error('verify-extension-packaging: legacy repo-root path still present:');
  console.error(`  ${path.relative(root, LEGACY_EXTENSION_ARCHIVE)}/`);
  console.error(`Migrate contents to ${path.relative(root, CANONICAL_EXTENSION_ARCHIVE)}/ and remove the legacy folder.`);
}

if (failed) {
  console.error('');
  console.error('extension/.vscodeignore excludes 0. archive/** and .archive/** as a VSIX safety net.');
  process.exit(1);
}

console.log('verify-extension-packaging: OK (no archive folders under extension/; no legacy 0. archive/extension/)');
