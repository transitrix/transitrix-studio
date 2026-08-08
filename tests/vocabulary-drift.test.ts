// Vocabulary drift check — this repo's closed sets against the vendored
// methodology artefact (`vendor/methodology/vocabulary.yaml`).
//
// Drift check first, migration on contact. The scattered per-module vocabulary
// literals are not replaced in one sweep; this check makes every divergence
// visible at once and keeps the set from growing, and each module migrates to
// reading the artefact when it is next touched for other reasons.
//
// It fails closed. A missing, unparseable, unpinned or tampered artefact fails
// the build — it never passes because it could not evaluate its input.

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, afterEach } from 'vitest';

import { ALLOWLIST } from './vocabulary-drift/allowlist.js';
import { loadVendoredVocabulary, hashArtefact, VENDOR_DIR } from './vocabulary-drift/artefact.js';
import { compareVocabulary, describeDivergence, divergenceKey } from './vocabulary-drift/compare.js';
import type { RepoSurface } from './vocabulary-drift/compare.js';
import { declaredMethodologyVersion, repoSurface } from './vocabulary-drift/surface.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const scratch: string[] = [];

function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'vocab-drift-'));
  scratch.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

function pinFor(yaml: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    source_repo: 'transitrix/methodology',
    source_ref: 'v9.9.9',
    source_path: 'notations/vocabulary.yaml',
    methodology_version: '9.9.9',
    sha256: hashArtefact(yaml),
    vendored_on: '2026-08-08',
    ...overrides,
  });
}

/** A minimal but structurally complete artefact — every section the loader
 *  requires, small enough to reason about a diff by eye. */
const FIXTURE_YAML = [
  'methodology_version: "9.9.9"',
  'element_types:',
  '  GOAL: { mode: standalone }',
  '  DRIVER: { mode: standalone }',
  'deprecated_element_types:',
  '  FACTOR: { replaced_by: DRIVER }',
  'relation_types:',
  '  goal_parent: { from: [GOAL], to: [GOAL] }',
  'deprecated_relation_types:',
  '  activity_goal: { replaced_by: action_goal }',
  'value_vocabularies:',
  '  agreement:',
  '    values: [draft, agreed, disputed]',
  'rule_codes:',
  '  AGREE-001: { severity: error }',
  '',
].join('\n');

/** The surface that exactly matches FIXTURE_YAML — the clean-pass baseline. */
function fixtureSurface(overrides: Partial<RepoSurface> = {}): RepoSurface {
  return {
    declaredMethodologyVersion: '9.9.9',
    bindings: [
      { key: 'element_types', values: ['GOAL', 'DRIVER', 'FACTOR'], origin: 'fixture' },
      { key: 'relation_types', values: ['goal_parent', 'activity_goal'], origin: 'fixture' },
      { key: 'rule_codes', values: ['AGREE-001'], origin: 'fixture' },
      { key: 'value_vocabularies.agreement', values: ['draft', 'agreed', 'disputed'], origin: 'fixture' },
    ],
    ...overrides,
  };
}

afterEach(() => {
  while (scratch.length) rmSync(scratch.pop()!, { recursive: true, force: true });
});

describe('the vendored artefact loads and is pinned', () => {
  it('loads the repo’s own vendored copy', () => {
    const { pin, artefact } = loadVendoredVocabulary();
    expect(pin.source_repo).toBe('transitrix/methodology');
    expect(artefact.methodologyVersion).toBe(pin.methodology_version);
    expect(artefact.elementTypes.length).toBeGreaterThan(0);
    expect(artefact.relationTypes.length).toBeGreaterThan(0);
    expect(artefact.valueVocabularies.size).toBeGreaterThan(0);
    expect(artefact.ruleCodes.length).toBeGreaterThan(0);
  });

  it('reads package.json’s declared methodology version', () => {
    expect(declaredMethodologyVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('it fails closed on input it cannot trust', () => {
  it('a missing artefact fails', () => {
    const dir = fixtureDir({ 'VENDORED.json': pinFor(FIXTURE_YAML) });
    expect(() => loadVendoredVocabulary(dir)).toThrow(/vocabulary artefact not found/);
  });

  it('a missing pin fails', () => {
    const dir = fixtureDir({ 'vocabulary.yaml': FIXTURE_YAML });
    expect(() => loadVendoredVocabulary(dir)).toThrow(/vendor pin not found/);
  });

  it('an unpinned artefact fails', () => {
    const yaml = FIXTURE_YAML;
    const pin = JSON.parse(pinFor(yaml)) as Record<string, unknown>;
    delete pin.methodology_version;
    const dir = fixtureDir({ 'vocabulary.yaml': yaml, 'VENDORED.json': JSON.stringify(pin) });
    expect(() => loadVendoredVocabulary(dir)).toThrow(/missing `methodology_version`/);
  });

  it('a corrupted artefact fails — unparseable YAML', () => {
    const yaml = `${FIXTURE_YAML}\n  : : not yaml [\n`;
    const dir = fixtureDir({ 'vocabulary.yaml': yaml, 'VENDORED.json': pinFor(yaml) });
    expect(() => loadVendoredVocabulary(dir)).toThrow(/not parseable YAML/);
  });

  it('a corrupted artefact fails — content that does not match its hash', () => {
    const dir = fixtureDir({
      'vocabulary.yaml': FIXTURE_YAML.replace('GOAL:', 'TAMPERED:'),
      'VENDORED.json': pinFor(FIXTURE_YAML),
    });
    expect(() => loadVendoredVocabulary(dir)).toThrow(/does not match its pin/);
  });

  it('a truncated artefact fails — a required section is gone', () => {
    const yaml = FIXTURE_YAML.split('rule_codes:')[0];
    const dir = fixtureDir({ 'vocabulary.yaml': yaml, 'VENDORED.json': pinFor(yaml) });
    expect(() => loadVendoredVocabulary(dir)).toThrow(/`rule_codes` is missing/);
  });

  it('an artefact whose version contradicts its pin fails', () => {
    const dir = fixtureDir({
      'vocabulary.yaml': FIXTURE_YAML,
      'VENDORED.json': pinFor(FIXTURE_YAML, { methodology_version: '1.2.3' }),
    });
    expect(() => loadVendoredVocabulary(dir)).toThrow(/does not match the vendor pin/);
  });

  it('a hash stable across CRLF checkout, unstable across content change', () => {
    expect(hashArtefact(FIXTURE_YAML.replace(/\n/g, '\r\n'))).toBe(hashArtefact(FIXTURE_YAML));
    expect(hashArtefact(`${FIXTURE_YAML} `)).not.toBe(hashArtefact(FIXTURE_YAML));
  });

  it('a vendor directory that does not exist fails', () => {
    const dir = join(tmpdir(), 'vocab-drift-absent-dir');
    rmSync(dir, { recursive: true, force: true });
    expect(() => loadVendoredVocabulary(dir)).toThrow(/vendor pin not found/);
  });
});

describe('the comparison', () => {
  it('reports nothing when the surface matches the artefact', () => {
    const dir = fixtureDir({ 'vocabulary.yaml': FIXTURE_YAML, 'VENDORED.json': pinFor(FIXTURE_YAML) });
    const { artefact } = loadVendoredVocabulary(dir);
    expect(compareVocabulary(artefact, fixtureSurface())).toEqual([]);
  });

  it('reports a value the artefact defines and the repo does not', () => {
    const dir = fixtureDir({ 'vocabulary.yaml': FIXTURE_YAML, 'VENDORED.json': pinFor(FIXTURE_YAML) });
    const { artefact } = loadVendoredVocabulary(dir);
    const surface = fixtureSurface();
    const bindings = surface.bindings.map((b) =>
      b.key === 'element_types' ? { ...b, values: ['GOAL', 'FACTOR'] } : b,
    );
    const found = compareVocabulary(artefact, { ...surface, bindings });
    expect(found.map(divergenceKey)).toEqual(['element_types:missing:DRIVER']);
  });

  it('reports a value the repo carries and the artefact does not', () => {
    const dir = fixtureDir({ 'vocabulary.yaml': FIXTURE_YAML, 'VENDORED.json': pinFor(FIXTURE_YAML) });
    const { artefact } = loadVendoredVocabulary(dir);
    const surface = fixtureSurface();
    const bindings = surface.bindings.map((b) =>
      b.key === 'value_vocabularies.agreement'
        ? { ...b, values: ['draft', 'agreed', 'disputed', 'withdrawn'] }
        : b,
    );
    const found = compareVocabulary(artefact, { ...surface, bindings });
    expect(found.map(divergenceKey)).toEqual(['value_vocabularies.agreement:extra:withdrawn']);
  });

  it('reports a whole set no constant here expresses', () => {
    const dir = fixtureDir({ 'vocabulary.yaml': FIXTURE_YAML, 'VENDORED.json': pinFor(FIXTURE_YAML) });
    const { artefact } = loadVendoredVocabulary(dir);
    const surface = fixtureSurface();
    const bindings = surface.bindings.map((b) => (b.key === 'rule_codes' ? { ...b, values: null } : b));
    const found = compareVocabulary(artefact, { ...surface, bindings });
    expect(found.map(divergenceKey)).toEqual(['rule_codes:unbound']);
  });

  it('reports a declared version that does not name the vendored artefact', () => {
    const dir = fixtureDir({ 'vocabulary.yaml': FIXTURE_YAML, 'VENDORED.json': pinFor(FIXTURE_YAML) });
    const { artefact } = loadVendoredVocabulary(dir);
    const found = compareVocabulary(artefact, fixtureSurface({ declaredMethodologyVersion: '1.0.0' }));
    expect(found.map(divergenceKey)).toEqual(['methodology_version:mismatch']);
  });

  it('refuses a surface that leaves an artefact vocabulary unaccounted for', () => {
    const dir = fixtureDir({ 'vocabulary.yaml': FIXTURE_YAML, 'VENDORED.json': pinFor(FIXTURE_YAML) });
    const { artefact } = loadVendoredVocabulary(dir);
    const surface = fixtureSurface();
    const bindings = surface.bindings.filter((b) => b.key !== 'relation_types');
    expect(() => compareVocabulary(artefact, { ...surface, bindings })).toThrow(/does not account for/);
  });

  it('refuses a surface that binds a vocabulary the artefact no longer defines', () => {
    const dir = fixtureDir({ 'vocabulary.yaml': FIXTURE_YAML, 'VENDORED.json': pinFor(FIXTURE_YAML) });
    const { artefact } = loadVendoredVocabulary(dir);
    const surface = fixtureSurface();
    const bindings = [...surface.bindings, { key: 'value_vocabularies.GONE.field', values: [], origin: 'fixture' }];
    expect(() => compareVocabulary(artefact, { ...surface, bindings })).toThrow(/does not define/);
  });
});

describe('the allowlist is time-boxed', () => {
  it('every entry carries an ISO review date and a reason', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.review_by, `${entry.key} has no ISO review_by date`).toMatch(ISO_DATE);
      expect(entry.reason.trim(), `${entry.key} has no reason`).not.toBe('');
    }
  });

  it('has no duplicate keys', () => {
    const keys = ALLOWLIST.map((e) => e.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it('has no entry whose review date has passed', () => {
    const today = new Date().toISOString().slice(0, 10);
    const expired = ALLOWLIST.filter((e) => e.review_by <= today);
    expect(
      expired.map((e) => `${e.key} (review_by ${e.review_by})`),
      'allowlist entries are past their review date — resolve the divergence or re-date the entry',
    ).toEqual([]);
  });
});

describe('this repo does not diverge from the vendored vocabulary', () => {
  const { artefact } = loadVendoredVocabulary();
  const divergences = compareVocabulary(artefact, repoSurface());
  const allowed = new Map(ALLOWLIST.map((e) => [e.key, e]));

  it('reports no divergence that is not allowlisted', () => {
    const unallowed = divergences.filter((d) => !allowed.has(divergenceKey(d)));
    expect(
      unallowed.map((d) => `${divergenceKey(d)} — ${describeDivergence(d)}`),
      'new vocabulary drift against the vendored artefact',
    ).toEqual([]);
  });

  it('carries no allowlist entry for a divergence that no longer occurs', () => {
    const live = new Set(divergences.map(divergenceKey));
    const stale = ALLOWLIST.filter((e) => !live.has(e.key)).map((e) => e.key);
    expect(stale, 'allowlist entries whose divergence is resolved — delete them').toEqual([]);
  });

  it('states the divergence it is standing over', () => {
    // Not an assertion about the number: it is the count made visible, so a run
    // of this check reports the gap rather than reading as a clean bill.
    console.log(
      `vocabulary drift vs ${artefact.methodologyVersion}: ${divergences.length} divergence(s), all allowlisted\n` +
        divergences.map((d) => `  - ${describeDivergence(d)}`).join('\n'),
    );
    expect(divergences.length).toBe(ALLOWLIST.length);
  });
});
