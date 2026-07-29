#!/usr/bin/env node
// Public-surface hygiene — full-tree pass.
//
// The diff check (ci-hygiene-check.mjs) only sees what a PR adds, so anything
// already committed stays invisible to it forever. This pass reads every tracked
// text file instead.
//
// Deliberately scoped to the HYGIENE_BLOCKLIST_3 pattern alone: the older slots
// have never been evaluated tree-wide, and enabling them here would fail every
// PR on pre-existing content rather than on the change under review.
//
// Same anti-recursion discipline as the diff check — reports file:line, never
// the matched substring.

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const raw = process.env.HYGIENE_BLOCKLIST_3;
if (!raw || raw.trim() === '') {
  console.warn('[hygiene-tree] HYGIENE_BLOCKLIST_3 secret is not set — skipping check.');
  process.exit(0);
}

let pattern;
try {
  pattern = new RegExp(raw, 'i');
} catch {
  console.error('[hygiene-tree] HYGIENE_BLOCKLIST_3 is not a valid JavaScript regex.');
  process.exit(2);
}

const SKIP = new Set([
  'scripts/ci-hygiene-check.mjs',
  'scripts/ci-hygiene-tree.mjs',
  '.github/workflows/public-surface-hygiene.yml',
  '.gitignore',
]);
const MAX_BYTES = 2_000_000;

let files;
try {
  files = execSync('git ls-files -z', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
} catch (err) {
  console.error('[hygiene-tree] failed to list tracked files:', err.message);
  process.exit(2);
}

const hits = [];
for (const file of files) {
  if (SKIP.has(file)) continue;
  let text;
  try {
    if (statSync(file).size > MAX_BYTES) continue;
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // unreadable, binary, or removed between listing and read
  }
  if (text.includes('\0')) continue; // binary
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) hits.push(`${file}:${i + 1}`);
  }
}

if (hits.length === 0) {
  console.log(`[hygiene-tree] clean — ${files.length} tracked file(s) scanned.`);
  process.exit(0);
}

console.error('[hygiene-tree] a tracked file carries content this repository does not put on a public surface.');
console.error('[hygiene-tree] (matched terms are intentionally not printed — repeating them would re-leak them.)');
console.error('[hygiene-tree] use the neutral form documented in the contributor guide.');
for (const h of hits) console.error(`  - ${h}`);
process.exit(1);
