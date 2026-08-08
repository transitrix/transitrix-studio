#!/usr/bin/env node
/**
 * Re-vendor @transitrix/document-renderer's pass-1 resolver into vendor/methodology/.
 *
 * Same contract as vendor-methodology-vocabulary.mjs: vendor a tagged release,
 * never a local sibling checkout and never a branch, so what lands here is what
 * shipped. The package's own README states this is the intended integration
 * path — "Pass 1 ships as a unit callable on its own, so pass 2 and Studio's
 * preview can both depend on it as a library."
 *
 * Five files make up the callable unit: pass1.mjs is the entry point;
 * parse-template.mjs, repository.mjs, ids.mjs and syntax.mjs are what it
 * imports. Vendored verbatim, with their relative imports intact, so
 * pass1.mjs resolves the same way here as it does in methodology's own tree.
 *
 * Usage:
 *   node scripts/vendor-methodology-document-renderer.mjs --ref v3.4.0
 *   node scripts/vendor-methodology-document-renderer.mjs --ref v3.4.0 --check
 *
 * --check fetches and reports what would change without writing anything.
 *
 * Requires the GitHub CLI (`gh`) to be installed and authenticated.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.resolve(HERE, '..', 'vendor', 'methodology', 'document-renderer');

const SOURCE_REPO = 'transitrix/methodology';
const SOURCE_DIR = 'packages/document-renderer/src';
const FILES = ['pass1.mjs', 'parse-template.mjs', 'repository.mjs', 'ids.mjs', 'syntax.mjs'];

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
  console.error(`vendor-methodology-document-renderer: ${message}`);
  process.exit(1);
}

/** SHA-256 over LF-normalised bytes — matches tests/document-renderer-vendor.test.ts. */
function hashArtefact(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function fetchFile(ref, name) {
  let raw;
  try {
    raw = execFileSync(
      'gh',
      ['api', '-H', 'Accept: application/vnd.github.raw', `repos/${SOURCE_REPO}/contents/${SOURCE_DIR}/${name}?ref=${ref}`],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (err) {
    die(`could not fetch ${SOURCE_DIR}/${name} at ${ref}: ${err.stderr?.toString().trim() || err.message}`);
  }
  return raw.replace(/\r\n/g, '\n');
}

function readCurrentPin() {
  try {
    return JSON.parse(readFileSync(path.join(VENDOR_DIR, 'VENDORED.json'), 'utf8'));
  } catch {
    return null;
  }
}

const { ref, check } = parseArgs(process.argv.slice(2));
const current = readCurrentPin();

const fetched = {};
for (const name of FILES) {
  const text = fetchFile(ref, name);
  fetched[name] = { text, sha256: hashArtefact(text) };
}

const unchanged = current
  && current.source_ref === ref
  && FILES.every((name) => current.files?.[name] === fetched[name].sha256);

if (unchanged) {
  console.log(`already vendored: ${SOURCE_REPO}@${ref}`);
  process.exit(0);
}

console.log(`  from  ${current ? current.source_ref : '(nothing vendored)'}`);
console.log(`  to    ${ref}`);
for (const name of FILES) {
  const before = current?.files?.[name];
  const after = fetched[name].sha256;
  console.log(`    ${name}: ${before === after ? 'unchanged' : `${before ?? '(new)'} -> ${after}`}`);
}

if (check) {
  console.log('--check: nothing written.');
  process.exit(0);
}

const pin = {
  source_repo: SOURCE_REPO,
  source_ref: ref,
  source_path: SOURCE_DIR,
  files: Object.fromEntries(FILES.map((name) => [name, fetched[name].sha256])),
  vendored_on: new Date().toISOString().slice(0, 10),
};

mkdirSync(VENDOR_DIR, { recursive: true });
for (const name of FILES) {
  writeFileSync(path.join(VENDOR_DIR, name), fetched[name].text, 'utf8');
}
writeFileSync(path.join(VENDOR_DIR, 'VENDORED.json'), `${JSON.stringify(pin, null, 2)}\n`, 'utf8');
console.log('written. Run `npx vitest run tests/document-renderer-vendor.test.ts` before committing.');
