#!/usr/bin/env node
// Public-surface hygiene check.
//
// Fails the PR if the diff (added lines), PR title, or PR body matches a regex
// blocklist held in the repo Actions secret HYGIENE_BLOCKLIST. The blocklist
// stays out of source on purpose; this script only reports file:line of hits
// and never echoes the matched substring (anti-recursion).

import { execSync } from 'node:child_process';

import { parseCommitLog } from './hygiene-patterns.mjs';

const blocklist = process.env.HYGIENE_BLOCKLIST;
if (!blocklist || blocklist.trim() === '') {
  console.warn('[hygiene] HYGIENE_BLOCKLIST secret is not set — skipping check.');
  console.warn('[hygiene] Set the repo Actions secret HYGIENE_BLOCKLIST to a regex to enable enforcement.');
  process.exit(0);
}

const blocklistHub = process.env.HYGIENE_BLOCKLIST_HUB;
const blocklistHubSlug = process.env.HYGIENE_HUB_SLUG;
const combined = [blocklist, blocklistHub, blocklistHubSlug]
  .filter((p) => p && p.trim())
  .join('|');

const TAG = 'hygiene';
const SLOTS = [
  ['HYGIENE_BLOCKLIST', blocklist],
  ['HYGIENE_BLOCKLIST_HUB', blocklistHub],
  ['HYGIENE_HUB_SLUG', blocklistHubSlug],
];

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

let pattern;
try {
  pattern = new RegExp(combined, 'i');
} catch {
  console.error('[hygiene] HYGIENE_BLOCKLIST (combined) is not a valid JavaScript regex.');
  process.exit(2);
}

const baseSha = process.env.BASE_SHA;
const headSha = process.env.HEAD_SHA;
if (!baseSha || !headSha) {
  console.error('[hygiene] missing BASE_SHA / HEAD_SHA env vars (must be invoked from a pull_request workflow).');
  process.exit(2);
}

// Ensure base is present. Never use `--depth=1` here: on a full checkout
// (fetch-depth: 0) it converts the clone to shallow and breaks `base..head`
// ancestry, so merge commits list unrelated history already on main.
try {
  execSync(`git cat-file -e ${baseSha}^{commit}`, { stdio: 'pipe' });
} catch {
  try {
    execSync(`git fetch --no-tags origin ${baseSha}`, { stdio: 'pipe' });
  } catch {
    // Fallback: rely on existing fetch from the checkout step.
  }
}

let diff;
try {
  diff = execSync(`git diff --unified=0 ${baseSha} ${headSha}`, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
} catch (err) {
  console.error('[hygiene] failed to compute diff:', err.message);
  process.exit(2);
}

const hits = [];
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
    if (pattern.test(line.slice(1))) {
      hits.push({ file: currentFile, line: currentLine });
    }
    currentLine++;
  }
}

// Commit messages over the PR's commit range — a diff pass sees added file
// content, never the message that landed the commit.
let log = '';
try {
  log = execSync(`git log --format=%H%x1f%B%x1e ${baseSha}..${headSha}`, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
} catch (err) {
  console.error('[hygiene] failed to read commit messages:', err.message);
  process.exit(2);
}
for (const { sha, body } of parseCommitLog(log)) {
  if (pattern.test(body)) hits.push({ file: `commit ${sha.slice(0, 12)}`, line: null });
}

const titleHit = pattern.test(process.env.PR_TITLE || '');
const bodyHit = pattern.test(process.env.PR_BODY || '');

if (hits.length === 0 && !titleHit && !bodyHit) {
  console.log('[hygiene] no blocklist matches in the diff, PR metadata, or a commit message.');
  process.exit(0);
}

console.error('[hygiene] blocklisted vocabulary detected. Replace with neutral wording before merging.');
console.error('[hygiene] (matched terms are intentionally not printed — repeating them would re-leak them.)');
if (titleHit) console.error('  - PR title contains a match');
if (bodyHit) console.error('  - PR body contains a match');
for (const h of hits) {
  console.error(`  - ${h.file}${h.line ? ':' + h.line : ''}`);
}
process.exit(1);
