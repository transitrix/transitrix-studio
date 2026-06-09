/**
 * Gate before `vsce package`: extension/ must contain only shippable runtime
 * assets. Non-runtime directory names are blocked by FORBIDDEN_DIR_NAMES below.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const extRoot = path.join(root, 'extension');

// Directory names that must never appear under extension/ (would ship in the VSIX).
const FORBIDDEN_DIR_NAMES = new Set(['0. archive', '.archive']);

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
      if (FORBIDDEN_DIR_NAMES.has(ent.name)) {
        hits.push(relPath);
        continue;
      }
      hits.push(...findForbiddenUnderExtension(path.join(dir, ent.name), relPath));
    }
  }
  return hits;
}

const forbidden = findForbiddenUnderExtension(extRoot);
if (forbidden.length > 0) {
  console.error('verify-extension-packaging: non-runtime path(s) under extension/:');
  for (const p of forbidden) {
    console.error(`  extension/${p}`);
  }
  console.error('Remove or relocate before packaging. See docs/packaging.md.');
  process.exit(1);
}

console.log('verify-extension-packaging: OK');
