/**
 * Gate before `vsce package`: the extension/ tree must not contain archive
 * folders. vsce only respects .vscodeignore for packaging — archived retired
 * code belongs under repo-root `0. archive/extension/`, not inside extension/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const extRoot = path.join(root, 'extension');

const FORBIDDEN_DIR_NAMES = new Set(['0. archive', '.archive']);

/** @returns {string[]} relative paths under extension/ that must not ship */
function findForbiddenPaths(dir, rel = '') {
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
      hits.push(...findForbiddenPaths(path.join(dir, ent.name), relPath));
    }
  }
  return hits;
}

const forbidden = findForbiddenPaths(extRoot);
if (forbidden.length > 0) {
  console.error('verify-extension-packaging: archive path(s) under extension/ — must not ship in a VSIX:');
  for (const p of forbidden) {
    console.error(`  extension/${p}`);
  }
  console.error('');
  console.error('Move retired extension sources to 0. archive/extension/ at the repo root.');
  console.error('extension/.vscodeignore also excludes 0. archive/** and .archive/** as a safety net.');
  process.exit(1);
}

console.log('verify-extension-packaging: OK (no archive folders under extension/)');
