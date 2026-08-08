#!/usr/bin/env node
/**
 * Re-vendor the methodology closed-vocabulary artefact into vendor/methodology/.
 *
 * The artefact's own contract for consumers outside the methodology repository
 * is: vendor the tagged release and read the vendored path. No cross-repo
 * package dependency, no sibling-checkout read, no runtime fetch. This script is
 * the maintainer-side half of that — it fetches from a *tag*, never from a local
 * clone and never from a branch, so what lands here is what shipped.
 *
 * It writes vocabulary.yaml verbatim and rewrites VENDORED.json with the tag,
 * the artefact's own methodology_version, and a SHA-256 over LF-normalised
 * bytes. `tests/vocabulary-drift.test.ts` verifies all three on every run.
 *
 * Usage:
 *   node scripts/vendor-methodology-vocabulary.mjs --ref v3.4.0
 *   node scripts/vendor-methodology-vocabulary.mjs --ref v3.4.0 --check
 *
 * --check fetches and reports what would change without writing anything.
 *
 * Requires the GitHub CLI (`gh`) to be installed and authenticated.
 *
 * Re-vendoring usually surfaces new drift — that is the point. Resolve or
 * re-date the affected tests/vocabulary-drift/allowlist.ts entries in the same
 * change; do not land a refresh that leaves the check red.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.resolve(HERE, '..', 'vendor', 'methodology');

const SOURCE_REPO = 'transitrix/methodology';
const SOURCE_PATH = 'notations/vocabulary.yaml';

function parseArgs(argv) {
  const out = { ref: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ref') out.ref = argv[++i];
    else if (argv[i] === '--check') out.check = true;
    else die(`unknown argument: ${argv[i]}`);
  }
  if (!out.ref) die('--ref <tag> is required (a release tag, e.g. v3.4.0 — not a branch)');
  if (!/^v\d+\.\d+\.\d+$/.test(out.ref)) die(`--ref must be a release tag like v3.4.0, got: ${out.ref}`);
  return out;
}

function die(message) {
  console.error(`vendor-methodology-vocabulary: ${message}`);
  process.exit(1);
}

/** SHA-256 over LF-normalised bytes — matches tests/vocabulary-drift/artefact.ts. */
function hashArtefact(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function fetchArtefact(ref) {
  let raw;
  try {
    raw = execFileSync(
      'gh',
      ['api', '-H', 'Accept: application/vnd.github.raw', `repos/${SOURCE_REPO}/contents/${SOURCE_PATH}?ref=${ref}`],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (err) {
    die(`could not fetch ${SOURCE_PATH} at ${ref}: ${err.stderr?.toString().trim() || err.message}`);
  }
  const text = raw.replace(/\r\n/g, '\n');
  const declared = /^methodology_version:\s*"?(\d+\.\d+\.\d+)"?\s*$/m.exec(text);
  if (!declared) die(`the artefact at ${ref} carries no semver methodology_version`);
  if (`v${declared[1]}` !== ref) {
    die(`the artefact at ${ref} declares methodology_version ${declared[1]} — tag and artefact disagree`);
  }
  return { text, methodologyVersion: declared[1] };
}

function readCurrentPin() {
  try {
    return JSON.parse(readFileSync(path.join(VENDOR_DIR, 'VENDORED.json'), 'utf8'));
  } catch {
    return null;
  }
}

const { ref, check } = parseArgs(process.argv.slice(2));
const { text, methodologyVersion } = fetchArtefact(ref);
const sha256 = hashArtefact(text);
const current = readCurrentPin();

if (current && current.sha256 === sha256 && current.source_ref === ref) {
  console.log(`already vendored: ${SOURCE_REPO}@${ref} (${methodologyVersion}), sha256 ${sha256}`);
  process.exit(0);
}

console.log(`  from  ${current ? `${current.source_ref} (${current.methodology_version}), sha256 ${current.sha256}` : '(nothing vendored)'}`);
console.log(`  to    ${ref} (${methodologyVersion}), sha256 ${sha256}`);

if (check) {
  console.log('--check: nothing written.');
  process.exit(0);
}

const pin = {
  source_repo: SOURCE_REPO,
  source_ref: ref,
  source_path: SOURCE_PATH,
  methodology_version: methodologyVersion,
  sha256,
  vendored_on: new Date().toISOString().slice(0, 10),
};

writeFileSync(path.join(VENDOR_DIR, 'vocabulary.yaml'), text, 'utf8');
writeFileSync(path.join(VENDOR_DIR, 'VENDORED.json'), `${JSON.stringify(pin, null, 2)}\n`, 'utf8');
console.log('written. Run `npx vitest run tests/vocabulary-drift.test.ts` and settle the allowlist before committing.');
