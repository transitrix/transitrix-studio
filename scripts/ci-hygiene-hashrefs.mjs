#!/usr/bin/env node
// Public-surface hygiene — bare hash-number references to hub work.
//
// A hub work item written as a bare `#813` is the worst of the banned forms:
// GitHub auto-links it to the item numbered 813 IN THIS REPOSITORY, which has
// its own issues and pull requests at those numbers — so it renders as a
// WORKING link to something unrelated. A dead reference at least reads as
// broken. Write `HUB-813`.
//
// Unlike the blocklist checks, this pattern names nothing confidential, so it
// lives here in the open and the matched token IS printed. A contributor who
// cannot see why the build failed routes around the rule, which is how this
// class of reference accumulated on public surfaces in the first place.
//
// Scoped to the words that precede hub work (`task`, `epic`, `hub`) so that a
// legitimate reference to this repository's own issue — the ordinary `#12`, and
// the `closes #12` / `fixes #12` auto-close keywords — is untouched.
//
// Covers all three surfaces in one pass: added diff lines, the PR title and
// body, and every tracked text file.

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const HASHREF = /\b(?:task|epic|hub)s?[\s:]+#\d+/gi;

const SKIP = new Set([
  'scripts/ci-hygiene-check.mjs',
  'scripts/ci-hygiene-tree.mjs',
  'scripts/ci-hygiene-hashrefs.mjs',
  '.github/workflows/public-surface-hygiene.yml',
  '.gitignore',
]);
const MAX_BYTES = 2_000_000;

/** Distinct matched tokens in a string, or null when there are none. */
function tokens(text) {
  const found = [...String(text ?? '').matchAll(HASHREF)].map((m) => m[0].trim());
  return found.length ? [...new Set(found)] : null;
}

const problems = [];

// 1) Added diff lines.
const baseSha = process.env.BASE_SHA;
const headSha = process.env.HEAD_SHA;
if (baseSha && headSha) {
  let diff = '';
  try {
    diff = execSync(`git diff --unified=0 ${baseSha} ${headSha}`, {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch (err) {
    console.error('[hygiene-hashrefs] failed to compute diff:', err.message);
    process.exit(2);
  }

  let currentFile = null;
  let currentLine = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      currentLine = 0;
      continue;
    }
    if (line.startsWith('+++ ') || line.startsWith('--- ')) continue;
    if (line.startsWith('diff --git')) {
      currentFile = null;
      currentLine = 0;
      continue;
    }
    if (line.startsWith('@@')) {
      const m = line.match(/\+(\d+)(?:,\d+)?/);
      currentLine = m ? parseInt(m[1], 10) : 0;
      continue;
    }
    if (line.startsWith('+') && currentFile) {
      if (!SKIP.has(currentFile)) {
        const hit = tokens(line.slice(1));
        if (hit) problems.push(`${currentFile}:${currentLine} — ${hit.join(', ')}`);
      }
      currentLine++;
    }
  }
} else {
  console.warn('[hygiene-hashrefs] no BASE_SHA / HEAD_SHA — skipping the diff pass.');
}

// 2) PR title and body.
for (const [label, value] of [
  ['PR title', process.env.PR_TITLE],
  ['PR body', process.env.PR_BODY],
]) {
  const hit = tokens(value);
  if (hit) problems.push(`${label} — ${hit.join(', ')}`);
}

// 3) Full tree — the diff pass cannot see what already landed.
let files = [];
try {
  files = execSync('git ls-files -z', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
} catch (err) {
  console.error('[hygiene-hashrefs] failed to list tracked files:', err.message);
  process.exit(2);
}

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
    const hit = tokens(lines[i]);
    if (hit) problems.push(`${file}:${i + 1} — ${hit.join(', ')}`);
  }
}

if (problems.length === 0) {
  console.log(`[hygiene-hashrefs] clean — ${files.length} tracked file(s), diff and PR metadata scanned.`);
  process.exit(0);
}

console.error('[hygiene-hashrefs] a bare hash-number reference to hub work is on a public surface.');
console.error('[hygiene-hashrefs] write HUB-<number> instead: a bare #NNN auto-links to this repository\'s own item of that number, which renders as a working link to something unrelated.');
console.error('[hygiene-hashrefs] a reference to this repository\'s OWN issue is fine — just do not dress it as a task, an epic, or hub work.');
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
