#!/usr/bin/env node
// Public-surface hygiene — full-tree pass.
//
// The diff check (ci-hygiene-check.mjs) only sees what a PR adds, so anything
// already committed stays invisible to it forever. This pass reads every tracked
// text file instead.
//
// Deliberately scoped to the HYGIENE_HUB_SLUG pattern alone: the older slots
// have never been evaluated tree-wide, and enabling them here would fail every
// PR on pre-existing content rather than on the change under review.
//
// Same anti-recursion discipline as the diff check — reports file:line, never
// the matched substring.

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const raw = process.env.HYGIENE_HUB_SLUG;
if (!raw || raw.trim() === '') {
  console.warn('[hygiene-tree] HYGIENE_HUB_SLUG secret is not set — skipping check.');
  process.exit(0);
}

let pattern;
try {
  pattern = new RegExp(raw, 'i');
} catch {
  console.error('[hygiene-tree] HYGIENE_HUB_SLUG is not a valid JavaScript regex.');
  process.exit(2);
}

const TAG = 'hygiene-tree';
const SLOTS = [['HYGIENE_HUB_SLUG', raw]];

// Self-validation. A pattern can be perfectly valid and still useless: an empty
// alternative (`a||b`) or a bare `.*` compiles and then matches every input,
// which turns the guard from a filter into a wall and is indistinguishable from
// a real hit. Each slot is checked against a deliberately meaningless control
// string that nothing legitimate can blocklist, and an over-broad slot is
// reported BY NAME — the value itself is still never printed.
const CANARY = 'zq-canary-000 lorem ipsum dolor sit amet zq-canary-999';
{
  let broad = false;
  for (const [name, value] of SLOTS) {
    if (!value || !value.trim()) continue;
    let re;
    try {
      re = new RegExp(value, 'i');
    } catch {
      console.error(`[${TAG}] ${name} is not a valid JavaScript regex.`);
      process.exit(2);
    }
    if (re.test(CANARY)) {
      console.error(`[${TAG}] ${name} matches a meaningless control string — the value is over-broad (a stray empty alternative or an unanchored wildcard matches every input). The value is deliberately not printed.`);
      broad = true;
    }
  }
  if (broad) process.exit(2);
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
