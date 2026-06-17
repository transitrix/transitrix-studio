#!/usr/bin/env node
// Public-surface hygiene check.
//
// Fails the PR if the diff (added lines), PR title, or PR body matches a regex
// blocklist held in the repo Actions secret HYGIENE_BLOCKLIST. The blocklist
// stays out of source on purpose; this script only reports file:line of hits
// and never echoes the matched substring (anti-recursion).

import { execSync } from 'node:child_process';

const blocklist = process.env.HYGIENE_BLOCKLIST;
if (!blocklist || blocklist.trim() === '') {
  console.warn('[hygiene] HYGIENE_BLOCKLIST secret is not set — skipping check.');
  console.warn('[hygiene] Set the repo Actions secret HYGIENE_BLOCKLIST to a regex to enable enforcement.');
  process.exit(0);
}

const blocklistHub = process.env.HYGIENE_BLOCKLIST_HUB;
const combined = blocklistHub && blocklistHub.trim() ? `${blocklist}|${blocklistHub}` : blocklist;

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

try {
  execSync(`git fetch --no-tags --depth=1 origin ${baseSha}`, { stdio: 'pipe' });
} catch {
  // Fallback: rely on existing fetch depth from checkout step.
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

const titleHit = pattern.test(process.env.PR_TITLE || '');
const bodyHit = pattern.test(process.env.PR_BODY || '');

if (hits.length === 0 && !titleHit && !bodyHit) {
  console.log('[hygiene] no blocklist matches in diff or PR metadata.');
  process.exit(0);
}

console.error('[hygiene] blocklisted vocabulary detected. Replace with neutral wording before merging.');
console.error('[hygiene] (matched terms are intentionally not printed — repeating them would re-leak them.)');
if (titleHit) console.error('  - PR title contains a match');
if (bodyHit) console.error('  - PR body contains a match');
for (const h of hits) {
  console.error(`  - ${h.file}:${h.line}`);
}
process.exit(1);
