#!/usr/bin/env node
// Public-surface hygiene — work-item references.
//
// A work-item reference does not go on a public surface: not in committed
// content, not in a PR title, not in a PR body, not in a commit message. It
// lives in the hub issue, which already links to the pull request.
//
// Two operative reasons, both about how the text reads later:
//
// - A number is not a reason. What a line needs is why it is the way it is, and
//   the durable form for that is a decision cited by name and date - resolvable
//   by any reader, and stable when a work item is renumbered or closed.
// - PR metadata is committed content with a delay. A PR title becomes a commit
//   subject on merge. Commit messages are read for the same reason, over
//   BASE..HEAD only, so a change is judged on what it adds.
//
// A reference to this repository's own issue or PR is untouched: a plain
// hash-number, and the `closes` / `fixes` auto-close keywords, mean what they
// say. Only work-item forms match: the `HUB-` prefix, or a hash-number dressed
// as task / epic / hub work. The bare hash-number is the worst form - it
// auto-links to the item of that number IN THIS REPOSITORY, so it renders as a
// working link to something unrelated.
//
// These patterns name nothing confidential, so the matched token is printed - a
// contributor has to be able to see what tripped. This file is in its own skip
// list, which doubles as the escape hatch for a doc that must legitimately show
// the form.

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

// Committed content: either form. PR metadata: the bare form only.
const HASHREF = /\b(?:task|epic|hub)s?[\s:]+#\d+/gi;
const WORKITEM = /\bHUB-\d+|\b(?:task|epic|hub)s?[\s:]+#\d+/gi;

const SKIP = new Set([
  'scripts/ci-hygiene-check.mjs',
  'scripts/ci-hygiene-tree.mjs',
  'scripts/ci-hygiene-hashrefs.mjs',
  '.github/workflows/public-surface-hygiene.yml',
  '.gitignore',
]);
const MAX_BYTES = 2_000_000;

/** Distinct matched tokens in a string, or null when there are none. */
function tokens(text, pattern) {
  const found = [...String(text ?? '').matchAll(pattern)].map((m) => m[0].trim());
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
        const hit = tokens(line.slice(1), WORKITEM);
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
  const hit = tokens(value, HASHREF);
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
    const hit = tokens(lines[i], WORKITEM);
    if (hit) problems.push(`${file}:${i + 1} — ${hit.join(', ')}`);
  }
}

if (problems.length === 0) {
  console.log(`[hygiene-hashrefs] clean — ${files.length} tracked file(s), plus the diff, PR metadata and commit messages.`);
  process.exit(0);
}

console.error('[hygiene-hashrefs] a work-item reference is on a public surface.');
console.error('[hygiene-hashrefs] in COMMITTED CONTENT: carry no work-item reference at all — keep the reason and drop the number, or cite the decision by name and date.');
console.error('[hygiene-hashrefs] in a PR TITLE OR BODY: HUB-<number> is fine; a bare hash-number is not, because it auto-links to this repository\'s own item of that number.');
console.error('[hygiene-hashrefs] a reference to this repository\'s OWN issue or PR is always fine — just do not dress it as a task, an epic, or hub work.');
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
