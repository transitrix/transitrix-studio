#!/usr/bin/env node
// CI guard: fail if packages/diagrams/package.json bumps its version without
// packages/cli/package.json also bumping in the same PR.
//
// Why: scripts/build-cli-package.mjs bundles the @transitrix/diagrams
// *source* into @transitrix/cli's published dist/ at prepack — the slim npm
// package never lists @transitrix/diagrams as a runtime dependency. But
// .github/workflows/npm-publish.yml only republishes @transitrix/cli when
// its own package.json version isn't already on the registry. If diagrams
// changes (fixing a validator bug, say) and cli's version field doesn't move,
// the publish step silently no-ops and the fix never reaches npm — exactly
// what happened to the BL-006 TYPE-registry fix (diagrams 1.8.20) while
// @transitrix/cli stayed on 2.2.0.
//
// This mirrors check-diagrams-version-bump.mjs's shape/diffing approach.

import { execSync } from 'node:child_process';

const baseSha = process.env.BASE_SHA;
const headSha = process.env.HEAD_SHA;

if (!baseSha || !headSha) {
  console.error('[cli-diagrams-alignment] missing BASE_SHA / HEAD_SHA env vars (must be invoked from a pull_request workflow).');
  process.exit(2);
}

try {
  execSync(`git fetch --no-tags --depth=1 origin ${baseSha}`, { stdio: 'pipe' });
} catch {
  // Fallback: rely on existing fetch depth from the checkout step.
}

function readJsonAt(sha, path) {
  return JSON.parse(execSync(`git show ${sha}:${path}`, { encoding: 'utf8' }));
}

let baseDiagramsVersion, headDiagramsVersion;
try {
  baseDiagramsVersion = readJsonAt(baseSha, 'packages/diagrams/package.json').version;
  headDiagramsVersion = readJsonAt(headSha, 'packages/diagrams/package.json').version;
} catch (err) {
  console.error('[cli-diagrams-alignment] failed to read packages/diagrams/package.json:', err.message);
  process.exit(2);
}

if (baseDiagramsVersion === headDiagramsVersion) {
  console.log('[cli-diagrams-alignment] packages/diagrams version unchanged — check skipped.');
  process.exit(0);
}

console.log(`[cli-diagrams-alignment] packages/diagrams version bumped ${baseDiagramsVersion} → ${headDiagramsVersion}.`);

let baseCliVersion, headCliVersion;
try {
  baseCliVersion = readJsonAt(baseSha, 'packages/cli/package.json').version;
  headCliVersion = readJsonAt(headSha, 'packages/cli/package.json').version;
} catch (err) {
  console.error('[cli-diagrams-alignment] failed to read packages/cli/package.json:', err.message);
  process.exit(2);
}

if (baseCliVersion === headCliVersion) {
  console.error(
    `[cli-diagrams-alignment] FAIL: packages/diagrams bumped to ${headDiagramsVersion} but packages/cli is still ${headCliVersion}.`,
  );
  console.error('[cli-diagrams-alignment] @transitrix/cli bundles the @transitrix/diagrams source at prepack — bump');
  console.error('[cli-diagrams-alignment] packages/cli/package.json too, or npm-publish.yml will skip republishing');
  console.error('[cli-diagrams-alignment] it (its version is already on the registry) and the diagrams change never');
  console.error('[cli-diagrams-alignment] reaches npm.');
  process.exit(1);
}

console.log(`[cli-diagrams-alignment] OK: packages/cli version bumped ${baseCliVersion} → ${headCliVersion}.`);
