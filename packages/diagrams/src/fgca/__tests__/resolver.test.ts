import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { resolveFGCA, isFGCAViewDoc } from '../resolver.js';
import { parseCanonicalFGCA } from '../parse-canonical.js';

// ── Inline canon element store (mirrors strategy-2026 data split into per-element form) ─

const ELEMENTS = [
  { notation: 'driver', id: 'FACTOR-1', name: 'Competitive market pressure', type: 'external' },
  { notation: 'driver', id: 'FACTOR-2', name: 'Digital adoption acceleration', type: 'external' },
  { notation: 'goal', id: 'GOAL-1', name: 'Grow revenue by 20%', factors: ['FACTOR-1', 'FACTOR-2'] },
  { notation: 'goal', id: 'GOAL-2', name: 'Reduce operational costs', factors: ['FACTOR-2'] },
  { notation: 'goal', id: 'GOAL-3', name: 'Improve customer retention', factors: ['FACTOR-1'] },
  { notation: 'change', id: 'CHANGE-1', name: 'Launch new product line', goals: ['GOAL-1'] },
  { notation: 'change', id: 'CHANGE-2', name: 'Automate manual processes', goals: ['GOAL-2'] },
  { notation: 'change', id: 'CHANGE-3', name: 'Enhance support platform', goals: ['GOAL-3'] },
  { notation: 'activity', id: 'ACTIVITY-1', name: 'Market research', changes: ['CHANGE-1'] },
  { notation: 'activity', id: 'ACTIVITY-2', name: 'MVP development', changes: ['CHANGE-1'] },
  { notation: 'activity', id: 'ACTIVITY-3', name: 'Process audit', changes: ['CHANGE-2'] },
  { notation: 'activity', id: 'ACTIVITY-4', name: 'RPA tooling rollout', changes: ['CHANGE-2'] },
  { notation: 'activity', id: 'ACTIVITY-5', name: 'CRM implementation', changes: ['CHANGE-3'] },
];

const SOURCES = { elements: ELEMENTS, relations: [] };

const VIEW_DOC = {
  notation: 'dgca',
  id: 'FGCA-STRAT-1',
  name: 'Strategy 2026 — FGCA chain',
  spec_version: '0.1',
  view_config: {
    goals: { filter: 'all' },
    factors: { surface: 'derived' },
    changes: { surface: 'derived' },
    activities: { surface: 'derived' },
  },
};

// ── isFGCAViewDoc ─────────────────────────────────────────────────────────────

describe('isFGCAViewDoc', () => {
  it('returns true for a view_config-based doc', () => {
    expect(isFGCAViewDoc(VIEW_DOC)).toBe(true);
  });

  it('returns false for an inline doc with factors/goals arrays', () => {
    expect(isFGCAViewDoc({
      notation: 'dgca', id: 'FGCA-1', name: 'x',
      factors: [], goals: [], changes: [], activities: [],
    })).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isFGCAViewDoc(null)).toBe(false);
    expect(isFGCAViewDoc('string')).toBe(false);
    expect(isFGCAViewDoc(42)).toBe(false);
  });
});

// ── resolveFGCA — goals.filter=all (default) ──────────────────────────────────

describe('resolveFGCA — goals.filter=all', () => {
  it('includes all goals, changes, and activities', () => {
    const doc = resolveFGCA(VIEW_DOC, SOURCES);
    expect((doc['goals'] as unknown[]).length).toBe(3);
    expect((doc['changes'] as unknown[]).length).toBe(3);
    expect((doc['actions'] as unknown[]).length).toBe(5);
  });

  it('derives factors from all goal.factors[] refs', () => {
    const doc = resolveFGCA(VIEW_DOC, SOURCES);
    const factorIds = (doc['factors'] as Array<{ id: string }>).map((f) => f.id);
    expect(factorIds).toContain('FACTOR-1');
    expect(factorIds).toContain('FACTOR-2');
    expect(factorIds.length).toBe(2);
  });

  it('passes parseCanonicalFGCA and produces a fully valid internal doc', () => {
    const doc = resolveFGCA(VIEW_DOC, SOURCES);
    const r = parseCanonicalFGCA(doc);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.parsed?.goals).toHaveLength(3);
    expect(r.parsed?.factors).toHaveLength(2);
    expect(r.parsed?.changes).toHaveLength(3);
    expect(r.parsed?.activities).toHaveLength(5);
  });

  it('carries view doc metadata (id, name, spec_version)', () => {
    const doc = resolveFGCA(VIEW_DOC, SOURCES);
    expect(doc['notation']).toBe('dgca');
    expect(doc['id']).toBe('FGCA-STRAT-1');
    expect(doc['name']).toBe('Strategy 2026 — FGCA chain');
    expect(doc['spec_version']).toBe('0.1');
  });
});

// ── resolveFGCA — goals.filter=ids ────────────────────────────────────────────

describe('resolveFGCA — goals.filter=ids', () => {
  it('narrows to the specified goal and its derived changes + activities', () => {
    const viewDoc = {
      ...VIEW_DOC,
      view_config: { goals: { filter: 'ids', ids: ['GOAL-1'] }, factors: { surface: 'derived' }, changes: { surface: 'derived' }, activities: { surface: 'derived' } },
    };
    const doc = resolveFGCA(viewDoc, SOURCES);
    const goalIds = (doc['goals'] as Array<{ id: string }>).map((g) => g.id);
    expect(goalIds).toEqual(['GOAL-1']);
    const changeIds = (doc['changes'] as Array<{ id: string }>).map((c) => c.id);
    expect(changeIds).toEqual(['CHANGE-1']);
    const actIds = (doc['actions'] as Array<{ id: string }>).map((a) => a.id).sort();
    expect(actIds).toEqual(['ACTIVITY-1', 'ACTIVITY-2']);
    const r = parseCanonicalFGCA(doc);
    expect(r.valid).toBe(true);
  });

  it('returns empty arrays when none of the requested ids exist in canon', () => {
    const viewDoc = {
      ...VIEW_DOC,
      view_config: { goals: { filter: 'ids', ids: ['GOAL-NONEXISTENT-1'] }, factors: { surface: 'derived' }, changes: { surface: 'derived' }, activities: { surface: 'derived' } },
    };
    const doc = resolveFGCA(viewDoc, SOURCES);
    expect((doc['goals'] as unknown[]).length).toBe(0);
    expect((doc['changes'] as unknown[]).length).toBe(0);
    expect((doc['factors'] as unknown[]).length).toBe(0);
  });
});

// ── resolveFGCA — surface=all ─────────────────────────────────────────────────

describe('resolveFGCA — surface=all', () => {
  it('factors.surface=all includes every factor even when only some are referenced', () => {
    const viewDoc = {
      ...VIEW_DOC,
      view_config: { goals: { filter: 'ids', ids: ['GOAL-3'] }, factors: { surface: 'all' }, changes: { surface: 'derived' }, activities: { surface: 'derived' } },
    };
    const doc = resolveFGCA(viewDoc, SOURCES);
    // GOAL-3 only references FACTOR-1, but surface=all → both factors
    expect((doc['factors'] as unknown[]).length).toBe(2);
  });

  it('changes.surface=all includes every change', () => {
    const viewDoc = {
      ...VIEW_DOC,
      view_config: { goals: { filter: 'ids', ids: ['GOAL-1'] }, factors: { surface: 'derived' }, changes: { surface: 'all' }, activities: { surface: 'derived' } },
    };
    const doc = resolveFGCA(viewDoc, SOURCES);
    expect((doc['changes'] as unknown[]).length).toBe(3);
  });
});

// ── resolveFGCA — empty / degenerate inputs ───────────────────────────────────

describe('resolveFGCA — empty sources', () => {
  it('returns empty arrays when canon has no elements', () => {
    const doc = resolveFGCA(VIEW_DOC, { elements: [], relations: [] });
    expect((doc['goals'] as unknown[]).length).toBe(0);
    expect((doc['factors'] as unknown[]).length).toBe(0);
    expect((doc['changes'] as unknown[]).length).toBe(0);
    expect((doc['actions'] as unknown[]).length).toBe(0);
  });

  it('returns empty arrays for a non-object viewDoc', () => {
    const doc = resolveFGCA(null, SOURCES);
    expect((doc['goals'] as unknown[]).length).toBe(0);
  });
});

// ── File-based regression — resolver + canon fixture + parseCanonicalFGCA ─────

describe('resolveFGCA — file-based regression against canon fixture', () => {
  const CANON_ROOT = path.resolve(
    process.cwd(), '..', '..', 'tests', 'fixtures', 'notation-corpus', 'dgca', 'canon',
  );
  const VIEW_DIR = path.join(CANON_ROOT, 'views');
  const ELEM_DIR = path.join(CANON_ROOT, 'elements');

  function loadYamlsUnder(dir: string): unknown[] {
    if (!fs.existsSync(dir)) return [];
    const out: unknown[] = [];
    function walk(d: string) {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) { walk(full); }
        else if (entry.name.endsWith('.yaml')) { out.push(yaml.load(fs.readFileSync(full, 'utf8'))); }
      }
    }
    walk(dir);
    return out;
  }

  const viewFiles = fs.existsSync(VIEW_DIR)
    ? fs.readdirSync(VIEW_DIR).filter((f) => f.endsWith('.transitrix.yaml'))
    : [];

  for (const file of viewFiles) {
    it(`resolves ${file} against canon fixtures and passes parseCanonicalFGCA`, () => {
      const viewDoc = yaml.load(fs.readFileSync(path.join(VIEW_DIR, file), 'utf8'));
      expect(isFGCAViewDoc(viewDoc)).toBe(true);
      const elements = loadYamlsUnder(ELEM_DIR);
      const doc = resolveFGCA(viewDoc, { elements, relations: [] });
      const r = parseCanonicalFGCA(doc);
      expect(r.valid).toBe(true);
      expect(r.errors).toEqual([]);
    });
  }
});
