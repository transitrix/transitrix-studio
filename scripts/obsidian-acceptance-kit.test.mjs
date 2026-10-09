import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  ASSETS,
  OVERSIZE_BYTES,
  PLUGIN_ID,
  buildKit,
  buildOversizeNote,
  checkKit,
  compareNotes,
  fillTemplate,
  parseArgs,
  parseSourceCommit,
  sha256,
} from './obsidian-acceptance-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_DIR = path.join(ROOT, 'packages', 'obsidian-plugin');
const SOURCE_SHA = 'a'.repeat(40);

const assets = {
  'main.js': Buffer.from('/* fake bundle */\n'),
  'manifest.json': readFileSync(path.join(PLUGIN_DIR, 'manifest.json')),
  'styles.css': Buffer.from('.x { color: red; }\n'),
};
const digests = Object.fromEntries(ASSETS.map((name) => [name, sha256(assets[name])]));
const release = {
  tag_name: JSON.parse(assets['manifest.json'].toString('utf8')).version,
  html_url: 'https://example.test/releases/tag/x',
  body: `Built from [\`x@aaaaaaa\`](https://github.com/o/r/commit/${SOURCE_SHA}).`,
};

describe('obsidian acceptance kit', () => {
  let work;
  let out;
  let counter = 0;

  before(() => {
    work = mkdtempSync(path.join(tmpdir(), 'obsidian-kit-test-'));
  });
  after(() => rmSync(work, { recursive: true, force: true }));
  beforeEach(() => {
    counter += 1;
    out = path.join(work, `kit-${counter}`);
  });

  const build = () => buildKit({ out, release, assets, expectedDigests: digests, repo: 'o/r' });
  const vaultFile = (...parts) => path.join(out, 'vault', ...parts);

  it('builds a vault with the verified release, notes, plan and report', () => {
    const { kit } = build();
    assert.equal(kit.release.sourceCommit, SOURCE_SHA);
    assert.deepEqual(kit.release.assets, digests);

    const pluginDir = path.join('.obsidian', 'plugins', PLUGIN_ID);
    for (const name of ASSETS) assert.ok(existsSync(vaultFile(pluginDir, name)), name);
    assert.deepEqual(JSON.parse(readFileSync(vaultFile('.obsidian', 'community-plugins.json'), 'utf8')), [PLUGIN_ID]);

    for (const rel of ['valid/T01-goals.md', 'valid/T08-mixed.md', 'errors/E07-unknown-language.md', 'scratch/S01-edit-me.md']) {
      assert.ok(existsSync(vaultFile(rel)), rel);
    }
    assert.ok(existsSync(path.join(out, 'screenshots')));
  });

  it('fills every placeholder in the plan and the report', () => {
    build();
    const plan = readFileSync(path.join(out, 'MANUAL-TEST.md'), 'utf8');
    const report = readFileSync(path.join(out, 'REPORT.md'), 'utf8');
    for (const text of [plan, report]) assert.doesNotMatch(text, /\{\{[A-Z_]+\}\}/);
    assert.ok(plan.includes(vaultFile()));
    assert.ok(report.includes(digests['main.js']));
    assert.ok(report.includes(SOURCE_SHA));
    assert.ok(report.includes('automation@transitrix.com'));
    assert.ok(plan.includes('automation@transitrix.com'));
  });

  it('generates an oversize note that exceeds the plugin limit', () => {
    build();
    const note = readFileSync(vaultFile('errors', 'E05-oversize.md'), 'utf8');
    const fence = /```transitrix-goals\n([\s\S]*?)\n```/.exec(note)?.[1] ?? '';
    assert.ok(Buffer.byteLength(fence) > OVERSIZE_BYTES);
    assert.equal(note, buildOversizeNote());
    const pluginSource = readFileSync(path.join(PLUGIN_DIR, 'src', 'parse-block-source.ts'), 'utf8');
    assert.match(pluginSource, /MAX_BLOCK_BYTES = 32 \* 1024/);
  });

  it('refuses a non-empty output directory and never overwrites it', () => {
    build();
    const marker = path.join(out, 'keep.txt');
    writeFileSync(marker, 'mine');
    assert.throws(build, /must be empty or missing/);
    assert.equal(readFileSync(marker, 'utf8'), 'mine');
  });

  it('rejects assets that do not match the release digests', () => {
    assert.throws(
      () => buildKit({ out, release, assets, expectedDigests: { ...digests, 'main.js': '0'.repeat(64) } }),
      /does not match the release digest/,
    );
    assert.equal(existsSync(path.join(out, 'vault')), false);
  });

  it('fails closed when the release has no digest', () => {
    assert.throws(
      () => buildKit({ out, release, assets, expectedDigests: { ...digests, 'styles.css': '' } }),
      /cannot verify/,
    );
  });

  it('passes check on an untouched vault', () => {
    build();
    const { ok, report } = checkKit({ out });
    assert.equal(ok, true);
    assert.match(report, /Verdict: PASS/);
    assert.ok(existsSync(path.join(out, 'AUTO-CHECKS.md')));
  });

  it('allows editing scratch/ but reports it', () => {
    build();
    writeFileSync(vaultFile('scratch', 'S01-edit-me.md'), 'edited\n');
    const { ok, report } = checkKit({ out });
    assert.equal(ok, true);
    assert.match(report, /S01-edit-me\.md \(meant to be edited\): edited/);
  });

  it('fails when a guarded note is changed, removed or added', () => {
    build();
    writeFileSync(vaultFile('valid', 'T01-goals.md'), 'changed\n');
    rmSync(vaultFile('errors', 'E01-invalid-yaml.md'));
    writeFileSync(vaultFile('valid', 'extra.md'), 'new\n');
    const { ok, report } = checkKit({ out });
    assert.equal(ok, false);
    assert.match(report, /changed: valid\/T01-goals\.md/);
    assert.match(report, /missing: errors\/E01-invalid-yaml\.md/);
    assert.match(report, /added: valid\/extra\.md/);
    assert.match(report, /Verdict: FAIL/);
  });

  it('fails when a plugin file no longer equals the release', () => {
    build();
    writeFileSync(vaultFile('.obsidian', 'plugins', PLUGIN_ID, 'main.js'), 'tampered');
    const { ok, report } = checkKit({ out });
    assert.equal(ok, false);
    assert.match(report, /\| main\.js \| FAIL/);
  });

  it('lists the persisted plugin settings', () => {
    build();
    const settings = { theme: 'transitrix-dark', nodeSize: 'wide', edgeStyle: 'polyline', curvature: 2 };
    writeFileSync(vaultFile('.obsidian', 'plugins', PLUGIN_ID, 'data.json'), JSON.stringify(settings));
    const { report } = checkKit({ out });
    assert.match(report, /"theme": "transitrix-dark"/);
    assert.match(report, /"curvature": 2/);
  });

  it('refuses to check a directory that is not a kit', () => {
    assert.throws(() => checkKit({ out: work }), /kit\.json missing/);
  });
});

describe('helpers', () => {
  it('parses the source commit from release notes', () => {
    assert.equal(parseSourceCommit(release.body), SOURCE_SHA);
    assert.equal(parseSourceCommit('no link'), null);
  });

  it('keeps unknown placeholders visible', () => {
    assert.equal(fillTemplate('{{A}} {{B}}', { A: '1' }), '1 {{B}}');
  });

  it('classifies note changes', () => {
    const before = { 'a.md': '1', 'b.md': '2', 'scratch/s.md': '3' };
    const result = compareNotes(before, { 'a.md': '1', 'b.md': 'x', 'scratch/s.md': 'y', 'new.md': 'z' });
    assert.deepEqual(result.unchanged, ['a.md']);
    assert.deepEqual(result.changed, ['b.md']);
    assert.deepEqual(result.added, ['new.md']);
    assert.deepEqual(result.scratch, { 'scratch/s.md': 'edited' });
  });

  it('validates arguments', () => {
    assert.deepEqual(parseArgs(['prepare', '--out', 'x', '--version', '1.2.3']).version, '1.2.3');
    assert.throws(() => parseArgs(['bogus', '--out', 'x']), /Usage/);
    assert.throws(() => parseArgs(['prepare']), /--out/);
    assert.throws(() => parseArgs(['prepare', '--out']), /requires a value/);
    assert.throws(() => parseArgs(['prepare', '--out', 'x', '--force']), /Unknown argument/);
  });

  it('uses fixtures that exist next to the plan', () => {
    for (const file of ['MANUAL-TEST.md', 'REPORT-TEMPLATE.md', 'cases.json']) {
      assert.ok(statSync(path.join(PLUGIN_DIR, 'acceptance', file)).isFile(), file);
    }
  });
});
