#!/usr/bin/env node
// Release-time guard: refuse to publish a release whose package versions do
// not carry the changes the release contains.
//
// Runs as the gate job of .github/workflows/npm-publish.yml, before either
// npm publish step. It compares the release commit against the previous
// release tag and applies the two invariants in scripts/release-version-guards.mjs.
//
// Requires a checkout with full history and tags (fetch-depth: 0).
//
// Env:
//   RELEASE_TAG — the tag being released (github.event.release.tag_name).
//                 Optional: on workflow_dispatch there is no release payload,
//                 and the newest reachable tag is used as the release point.

import { execSync } from 'node:child_process';

import {
  evaluateReleaseVersions,
  pickPreviousReleaseTag,
  selectDiagramsSrcChanges,
} from './release-version-guards.mjs';

const LABEL = '[release-versions]';

function git(command) {
  return execSync(`git ${command}`, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

function fail(message) {
  console.error(`${LABEL} ${message}`);
  process.exit(2);
}

const releaseTag = (process.env.RELEASE_TAG || '').trim();

// No shell glob here — quoting a pattern is not portable across the shells
// execSync picks. pickPreviousReleaseTag() does the vX.Y.Z filtering itself.
let reachableTags;
try {
  reachableTags = git('tag --merged HEAD').split('\n');
} catch (err) {
  fail(`failed to list tags — the checkout needs full history and tags (fetch-depth: 0): ${err.message}`);
}

// On workflow_dispatch there is no release payload; treat the newest reachable
// tag as the release point so a re-run checks the same span the release did.
const effectiveTag = releaseTag || pickPreviousReleaseTag(reachableTags, null);
if (!effectiveTag) {
  console.log(`${LABEL} no release tag and no reachable v* tag — nothing to compare. Skipping.`);
  process.exit(0);
}

const previousTag = pickPreviousReleaseTag(reachableTags, effectiveTag);
if (!previousTag) {
  console.log(`${LABEL} ${effectiveTag} is the first release — no previous release to compare against. Skipping.`);
  process.exit(0);
}

console.log(`${LABEL} release span ${previousTag} → ${effectiveTag} (HEAD).`);

let changedFiles;
try {
  changedFiles = git(`diff --name-only ${previousTag} HEAD`)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
} catch (err) {
  fail(`failed to diff ${previousTag}..HEAD: ${err.message}`);
}

function readVersionAt(ref, path) {
  const source = ref === null ? git(`show HEAD:${path}`) : git(`show ${ref}:${path}`);
  return JSON.parse(source).version;
}

let versions;
try {
  versions = {
    previousDiagramsVersion: readVersionAt(previousTag, 'packages/diagrams/package.json'),
    releaseDiagramsVersion: readVersionAt(null, 'packages/diagrams/package.json'),
    previousCliVersion: readVersionAt(previousTag, 'packages/cli/package.json'),
    releaseCliVersion: readVersionAt(null, 'packages/cli/package.json'),
  };
} catch (err) {
  fail(`failed to read a package.json version: ${err.message}`);
}

const diagramsSrcChanges = selectDiagramsSrcChanges(changedFiles);

console.log(
  `${LABEL} @transitrix/diagrams ${versions.previousDiagramsVersion} → ${versions.releaseDiagramsVersion}, ` +
    `@transitrix/cli ${versions.previousCliVersion} → ${versions.releaseCliVersion}, ` +
    `${diagramsSrcChanges.length} non-test packages/diagrams/src change(s) in span.`,
);

const failures = evaluateReleaseVersions({ diagramsSrcChanges, ...versions });

if (failures.length === 0) {
  console.log(`${LABEL} OK: every package version covers what this release contains.`);
  process.exit(0);
}

// A release span can touch dozens of files; list enough to identify the change
// without burying the failure message itself.
const MAX_DETAILS = 20;

for (const failure of failures) {
  console.error(`${LABEL} FAIL (${failure.package}): ${failure.message}`);
  for (const detail of failure.details.slice(0, MAX_DETAILS)) console.error(`${LABEL}   ${detail}`);
  if (failure.details.length > MAX_DETAILS) {
    console.error(`${LABEL}   … and ${failure.details.length - MAX_DETAILS} more`);
  }
  console.error(`::error title=${failure.package} version does not cover this release::${failure.message}`);
}
process.exit(1);
