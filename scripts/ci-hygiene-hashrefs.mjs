#!/usr/bin/env node
// Public-surface hygiene — work-item references.
//
// Two rules, on two different surfaces.
//
// 1. COMMITTED CONTENT carries no reference to a work item at all — neither the
// neutral `HUB-<number>` form nor a bare hash-number. The evidence for the
// stronger rule is the sweep that produced it: of roughly 110 such references
// across this repository and its sibling, not one carried information a reader
// could use. The prose beside them already said what the code does and why; the
// number was decoration that only a maintainer with private access could
// resolve, and it aged badly the moment a work item was renumbered or closed.
// What a line of code needs is the REASON, and a durable reason is a decision —
// cited by name and date, which is stable, public, and resolvable by anyone.
//
// 2. A PR TITLE OR BODY may cite a work item, and there `HUB-<number>` is the
// form. A pull request is a transient coordination surface, not content anyone
// reads later. A bare hash-number is still forbidden there, for a separate
// reason: GitHub auto-links it to the item of that number IN THIS REPOSITORY,
// which renders as a WORKING link to something unrelated — worse than a dead
// reference, because it reads as correct.
//
// A reference to this repository's own issue or pull request is untouched by
// either rule: a plain hash-number, and the `closes` / `fixes` auto-close
// keywords, mean what they say. Only work-item forms match — the `HUB-` prefix,
// or a hash-number dressed as task / epic / hub work.
//
// These patterns name nothing confidential, so they live here in the open and
// the matched token IS printed. A contributor who cannot see why the build
// failed routes around the rule, which is how this class of reference
// accumulated in the first place. This file is in the skip list; that exclusion
// is also the escape hatch for a doc that must legitimately show the form.

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

import { HASHREF, WORKITEM, parseCommitLog } from './hygiene-patterns.mjs';

const SKIP = new Set([
  'scripts/ci-hygiene-check.mjs',
  'scripts/ci-hygiene-tree.mjs',
  'scripts/ci-hygiene-hashrefs.mjs',
  'scripts/hygiene-patterns.mjs',
  'tests/ci-hygiene-hashrefs.test.ts',
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

// 3) Commit messages over the PR's commit range — a diff pass sees added file
// content, never the message that landed the commit.
if (baseSha && headSha) {
  let log = '';
  try {
    log = execSync(`git log --format=%H%x1f%B%x1e ${baseSha}..${headSha}`, {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch (err) {
    console.error('[hygiene-hashrefs] failed to read commit messages:', err.message);
    process.exit(2);
  }
  for (const { sha, body } of parseCommitLog(log)) {
    const hit = tokens(body, WORKITEM);
    if (hit) problems.push(`commit ${sha.slice(0, 12)} — ${hit.join(', ')}`);
  }
}

// 4) Full tree — the diff pass cannot see what already landed.
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
