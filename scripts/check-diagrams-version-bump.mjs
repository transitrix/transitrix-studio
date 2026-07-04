#!/usr/bin/env node
// CI guard: fail if packages/diagrams/src changes without a version bump.
//
// Runs on every PR targeting main. If any non-test file under
// packages/diagrams/src/ is added or modified and the version field in
// packages/diagrams/package.json is unchanged relative to the PR base, the
// check fails. Test files (under __tests__/ or matching *.test.ts(x)) are
// excluded from the trigger.

import { execSync } from 'node:child_process';

const baseSha = process.env.BASE_SHA;
const headSha = process.env.HEAD_SHA;

if (!baseSha || !headSha) {
  console.error('[diagrams-version-bump] missing BASE_SHA / HEAD_SHA env vars (must be invoked from a pull_request workflow).');
  process.exit(2);
}

try {
  execSync(`git fetch --no-tags --depth=1 origin ${baseSha}`, { stdio: 'pipe' });
} catch {
  // Fallback: rely on existing fetch depth from the checkout step.
}

let changedFiles;
try {
  changedFiles = execSync(`git diff --name-only ${baseSha} ${headSha}`, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
} catch (err) {
  console.error('[diagrams-version-bump] failed to compute diff:', err.message);
  process.exit(2);
}

const srcChanges = changedFiles.filter((f) => {
  if (!f.startsWith('packages/diagrams/src/')) return false;
  if (f.includes('/__tests__/')) return false;
  if (f.endsWith('.test.ts') || f.endsWith('.test.tsx')) return false;
  return true;
});

if (srcChanges.length === 0) {
  console.log('[diagrams-version-bump] no non-test src changes in packages/diagrams — check skipped.');
  process.exit(0);
}

console.log(`[diagrams-version-bump] ${srcChanges.length} non-test src change(s) detected:`);
for (const f of srcChanges) console.log(`  ${f}`);

let baseVersion, headVersion;
try {
  const basePkg = JSON.parse(
    execSync(`git show ${baseSha}:packages/diagrams/package.json`, { encoding: 'utf8' }),
  );
  baseVersion = basePkg.version;
} catch (err) {
  console.error('[diagrams-version-bump] failed to read packages/diagrams/package.json at base:', err.message);
  process.exit(2);
}

try {
  const headPkg = JSON.parse(
    execSync(`git show ${headSha}:packages/diagrams/package.json`, { encoding: 'utf8' }),
  );
  headVersion = headPkg.version;
} catch (err) {
  console.error('[diagrams-version-bump] failed to read packages/diagrams/package.json at head:', err.message);
  process.exit(2);
}

if (baseVersion === headVersion) {
  console.error(`[diagrams-version-bump] FAIL: packages/diagrams/src changed but version is still ${headVersion}.`);
  console.error('[diagrams-version-bump] Bump packages/diagrams/package.json version before merging.');
  process.exit(1);
}

console.log(`[diagrams-version-bump] OK: version bumped ${baseVersion} → ${headVersion}.`);
