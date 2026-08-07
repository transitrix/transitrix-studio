#!/usr/bin/env node
// Release-time step: fold changelog/fragments/*.md into CHANGELOG.md's
// Unreleased section, then delete the fragments it consumed.
//
// Run this as the first step of preparing a release PR (docs/internal/release-runbook.md
// step 1), before retitling "## Unreleased" to the release version. Safe to
// run with zero fragments present (no-op).

import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { assembleChangelog, groupFragments, parseFragment } from './changelog-fragments.mjs';

const ROOT = process.cwd();
const FRAGMENTS_DIR = path.join(ROOT, 'changelog', 'fragments');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

function loadFragmentFiles() {
  let names;
  try {
    names = readdirSync(FRAGMENTS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return names.filter((name) => name.endsWith('.md') && name !== 'README.md').sort();
}

const files = loadFragmentFiles();
if (files.length === 0) {
  console.log('[assemble-changelog] no fragments in changelog/fragments/ — nothing to do.');
  process.exit(0);
}

const fragments = files.map((file) => {
  const content = readFileSync(path.join(FRAGMENTS_DIR, file), 'utf8');
  const { section, body } = parseFragment(file, content);
  return { file, section, body };
});

const grouped = groupFragments(fragments);
const changelogText = readFileSync(CHANGELOG_PATH, 'utf8');
const updated = assembleChangelog(changelogText, grouped);

writeFileSync(CHANGELOG_PATH, updated);
for (const file of files) {
  rmSync(path.join(FRAGMENTS_DIR, file));
}

console.log(`[assemble-changelog] folded ${files.length} fragment(s) into CHANGELOG.md:`);
for (const file of files) console.log(`  ${file}`);
