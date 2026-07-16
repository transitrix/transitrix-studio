import { describe, it, expect } from 'vitest';
import { resolveGoals, isGoalsViewDoc } from '../resolver.js';
import { parseCanonicalGoals } from '../parse-canonical.js';

// ── Inline canon element store ────────────────────────────────────────────

const ELEMENTS = [
  { notation: 'goal', id: 'GOAL-REVENUE-1', name: 'Triple revenue in 3 years', type: 'Strategy', level: 0 },
  {
    notation: 'goal', id: 'GOAL-EU-1', name: 'Launch in 3 EU markets',
    type: 'Strategic Goal', level: 1, parent: 'GOAL-REVENUE-1', valid_from: '2026-01-01', valid_to: null,
  },
  {
    notation: 'goal', id: 'GOAL-EU-DE-1', name: 'Launch in Germany',
    type: 'Project Goal', level: 2, parent: 'GOAL-EU-1', valid_from: '2026-06-01', valid_to: '2026-12-31',
  },
  {
    notation: 'goal', id: 'GOAL-COST-1', name: 'Reduce operational costs',
    type: 'Strategic Goal', level: 1, period: 'H2-2026',
  },
];

const SOURCES = { elements: ELEMENTS };

const VIEW_DOC = {
  notation: 'goals',
  id: 'GOALS-STRAT-2026-1',
  name: 'Strategy 2026 — Goals Tree',
  spec_version: '0.1',
  view_config: {
    scope: { root_goal: 'GOAL-REVENUE-1' },
    goal_types: [
      { name: 'Strategy', level: 0 },
      { name: 'Strategic Goal', level: 1 },
      { name: 'Project Goal', level: 2 },
    ],
  },
};

// ── isGoalsViewDoc ─────────────────────────────────────────────────────────

describe('isGoalsViewDoc', () => {
  it('returns true for a view_config-based doc', () => {
    expect(isGoalsViewDoc(VIEW_DOC)).toBe(true);
  });

  it('returns false for an inline doc with a goals[] array', () => {
    expect(isGoalsViewDoc({ notation: 'goals', goals: [] })).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isGoalsViewDoc(null)).toBe(false);
    expect(isGoalsViewDoc('string')).toBe(false);
    expect(isGoalsViewDoc(42)).toBe(false);
  });
});

// ── resolveGoals — root_goal scoping ──────────────────────────────────────

describe('resolveGoals — scope.root_goal', () => {
  it('includes the root goal and its transitive descendants only', () => {
    const doc = resolveGoals(VIEW_DOC, SOURCES);
    const ids = (doc['goals'] as Array<{ id: string }>).map((g) => g.id).sort();
    expect(ids).toEqual(['GOAL-EU-1', 'GOAL-EU-DE-1', 'GOAL-REVENUE-1']);
    expect(ids).not.toContain('GOAL-COST-1');
  });

  it('drops the admission/lifecycle envelope fields not used by parseCanonicalGoals', () => {
    const doc = resolveGoals(VIEW_DOC, SOURCES);
    const eu = (doc['goals'] as Array<Record<string, unknown>>).find((g) => g.id === 'GOAL-EU-1');
    expect(eu?.['valid_from']).toBeUndefined();
    expect(eu?.['valid_to']).toBeUndefined();
    expect(eu?.['notation']).toBeUndefined();
  });

  it('returns an empty goals[] when root_goal does not resolve', () => {
    const viewDoc = { ...VIEW_DOC, view_config: { scope: { root_goal: 'GOAL-NONEXISTENT-1' } } };
    const doc = resolveGoals(viewDoc, SOURCES);
    expect((doc['goals'] as unknown[]).length).toBe(0);
  });

  it('carries view doc metadata (id, name, spec_version) and the explicit goal_types', () => {
    const doc = resolveGoals(VIEW_DOC, SOURCES);
    expect(doc['notation']).toBe('goals');
    expect(doc['id']).toBe('GOALS-STRAT-2026-1');
    expect(doc['name']).toBe('Strategy 2026 — Goals Tree');
    expect(doc['spec_version']).toBe('0.1');
    expect(doc['goal_types']).toEqual([
      { name: 'Strategy', level: 0 },
      { name: 'Strategic Goal', level: 1 },
      { name: 'Project Goal', level: 2 },
    ]);
  });

  it('produces a document that passes parseCanonicalGoals', () => {
    const doc = resolveGoals(VIEW_DOC, SOURCES);
    const r = parseCanonicalGoals(doc);
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.parsed?.goals).toHaveLength(3);
  });
});

// ── resolveGoals — scope.type_filter ──────────────────────────────────────

describe('resolveGoals — scope.type_filter', () => {
  it('narrows the full catalogue to goals of a listed type', () => {
    const viewDoc = { ...VIEW_DOC, view_config: { scope: { type_filter: ['Strategy'] } } };
    const doc = resolveGoals(viewDoc, SOURCES);
    const ids = (doc['goals'] as Array<{ id: string }>).map((g) => g.id);
    expect(ids).toEqual(['GOAL-REVENUE-1']);
  });

  it('composes with root_goal — intersection, not union', () => {
    const viewDoc = {
      ...VIEW_DOC,
      view_config: { scope: { root_goal: 'GOAL-REVENUE-1', type_filter: ['Project Goal'] } },
    };
    const doc = resolveGoals(viewDoc, SOURCES);
    const ids = (doc['goals'] as Array<{ id: string }>).map((g) => g.id);
    expect(ids).toEqual(['GOAL-EU-DE-1']);
  });
});

// ── resolveGoals — scope.period ───────────────────────────────────────────

describe('resolveGoals — scope.period', () => {
  it('narrows to goals tagged with the matching period field', () => {
    const viewDoc = { ...VIEW_DOC, view_config: { scope: { period: 'H2-2026' } } };
    const doc = resolveGoals(viewDoc, SOURCES);
    const ids = (doc['goals'] as Array<{ id: string }>).map((g) => g.id);
    expect(ids).toEqual(['GOAL-COST-1']);
  });
});

// ── resolveGoals — scope.valid_at ─────────────────────────────────────────

describe('resolveGoals — scope.valid_at', () => {
  it('excludes goals outside their [valid_from, valid_to] window', () => {
    const viewDoc = {
      ...VIEW_DOC,
      view_config: { scope: { root_goal: 'GOAL-REVENUE-1', valid_at: '2027-01-15' } },
    };
    const doc = resolveGoals(viewDoc, SOURCES);
    const ids = (doc['goals'] as Array<{ id: string }>).map((g) => g.id).sort();
    // GOAL-EU-DE-1's window (2026-06-01..2026-12-31) has already closed by 2027-01-15.
    expect(ids).toEqual(['GOAL-EU-1', 'GOAL-REVENUE-1']);
  });

  it('keeps goals with no valid_from tracked (permissive default)', () => {
    const viewDoc = {
      notation: 'goals', id: 'X', name: 'X',
      view_config: { scope: { valid_at: '2026-07-15' } },
    };
    const doc = resolveGoals(viewDoc, SOURCES);
    const ids = (doc['goals'] as Array<{ id: string }>).map((g) => g.id);
    expect(ids).toContain('GOAL-COST-1'); // no valid_from on this fixture
  });
});

// ── resolveGoals — goal_types synthesis when view_config.goal_types is absent ─

describe('resolveGoals — goal_types synthesis', () => {
  it('derives one entry per distinct type name from the selected elements, first-seen level wins', () => {
    const viewDoc = {
      notation: 'goals', id: 'GOALS-X-1', name: 'X',
      view_config: { scope: { root_goal: 'GOAL-REVENUE-1' } },
    };
    const doc = resolveGoals(viewDoc, SOURCES);
    expect(doc['goal_types']).toEqual([
      { name: 'Strategy', level: 0 },
      { name: 'Strategic Goal', level: 1 },
      { name: 'Project Goal', level: 2 },
    ]);
    const r = parseCanonicalGoals(doc);
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });
});

// ── resolveGoals — empty / degenerate inputs ──────────────────────────────

describe('resolveGoals — empty sources', () => {
  it('returns empty goals[] when canon has no elements', () => {
    const doc = resolveGoals(VIEW_DOC, { elements: [] });
    expect((doc['goals'] as unknown[]).length).toBe(0);
  });

  it('returns an empty inline document for a non-object viewDoc', () => {
    const doc = resolveGoals(null, SOURCES);
    expect(doc).toEqual({ notation: 'goals', goal_types: [], goals: [] });
  });

  it('includes the full catalogue when scope is entirely omitted', () => {
    const viewDoc = { notation: 'goals', id: 'X', name: 'X', view_config: {} };
    const doc = resolveGoals(viewDoc, SOURCES);
    expect((doc['goals'] as unknown[]).length).toBe(ELEMENTS.length);
  });
});
