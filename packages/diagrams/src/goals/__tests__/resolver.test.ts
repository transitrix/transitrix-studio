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

  it('derives level from parent-chain depth, ignoring a stale/wrong stored level field', () => {
    // GOAL-EU-1 is authored with a wrong stored level (5, should be 1 given
    // its parent chain) — the synthesized table and the goal's own resolved
    // level must both come from structural depth, not the stored value, so
    // the result is deterministic regardless of element enumeration order.
    const elements = [
      { notation: 'goal', id: 'GOAL-ROOT-1', name: 'Root', type: 'Strategy', level: 0 },
      { notation: 'goal', id: 'GOAL-EU-1', name: 'EU', type: 'Strategic Goal', level: 5, parent: 'GOAL-ROOT-1' },
    ];
    const viewDoc = {
      notation: 'goals', id: 'GOALS-TEST-1', name: 'X',
      view_config: { scope: { root_goal: 'GOAL-ROOT-1' } },
    };
    const doc = resolveGoals(viewDoc, { elements });
    const eu = (doc['goals'] as Array<Record<string, unknown>>).find((g) => g.id === 'GOAL-EU-1');
    expect(eu?.['level']).toBe(1); // structural depth, not the stored 5
    expect(doc['goal_types']).toEqual([
      { name: 'Strategy', level: 0 },
      { name: 'Strategic Goal', level: 1 },
    ]);
    const r = parseCanonicalGoals(doc);
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('does not synthesize a type label for a goal missing type — GOALS-006 still fires', () => {
    const elements = [
      { notation: 'goal', id: 'GOAL-TYPED-1', name: 'Typed', type: 'Strategy', level: 0 },
      { notation: 'goal', id: 'GOAL-NO-TYPE-1', name: 'Untyped', level: 0 },
    ];
    const viewDoc = { notation: 'goals', id: 'GOALS-TEST-2', name: 'X', view_config: {} };
    const doc = resolveGoals(viewDoc, { elements });
    const r = parseCanonicalGoals(doc);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'GOALS-006')).toBe(true);
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

// Canonical hierarchy survives promotion out of an inline goals view.
describe('resolveGoals — canonical goal_parent relations', () => {
  const elements = ELEMENTS.slice(0, 3).map(({ parent: _parent, ...g }) => g);
  const relations = [
    { notation: 'relation', id: 'REL-GOAL-EU-PARENT-1', type: 'goal_parent', from: 'GOAL-EU-1', to: 'GOAL-REVENUE-1', valid_from: '2026-01-01', valid_to: null },
    { notation: 'relation', id: 'REL-GOAL-DE-PARENT-1', type: 'goal_parent', from: 'GOAL-EU-DE-1', to: 'GOAL-EU-1', valid_from: '2026-06-01', valid_to: null },
  ];
  const viewAt = (valid_at?: string) => ({ ...VIEW_DOC, view_config: { ...VIEW_DOC.view_config, scope: { valid_at } } });

  it('renders a connected hierarchy without mutating source elements or relations', () => {
    const before = JSON.stringify({ elements, relations });
    const doc = resolveGoals(VIEW_DOC, { elements, relations });
    const result = parseCanonicalGoals(doc);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.parsed?.goals).toHaveLength(3);
    expect((doc.goals as Record<string, unknown>[]).find(g => g.id === 'GOAL-EU-DE-1')?.parent).toBe('GOAL-EU-1');
    expect(JSON.stringify({ elements, relations })).toBe(before);
  });

  it('uses canonical parents before computing descendant scope', () => {
    const view = { ...VIEW_DOC, view_config: { ...VIEW_DOC.view_config, scope: { root_goal: 'GOAL-EU-1' } } };
    expect((resolveGoals(view, { elements, relations }).goals as Record<string, unknown>[]).map(g => g.id)).toEqual(['GOAL-EU-1', 'GOAL-EU-DE-1']);
  });

  it('honors inclusive relation boundaries and temporal reparenting', () => {
    const old = { ...relations[1], valid_to: '2026-07-01' };
    const next = { ...relations[1], id: 'REL-GOAL-DE-PARENT-2', to: 'GOAL-REVENUE-1', valid_from: '2026-07-02' };
    for (const [date, parent] of [['2026-07-01', 'GOAL-EU-1'], ['2026-07-02', 'GOAL-REVENUE-1']]) {
      const doc = resolveGoals(viewAt(date), { elements, relations: [relations[0], old, next] });
      expect((doc.goals as Record<string, unknown>[]).find(g => g.id === 'GOAL-EU-DE-1')?.parent).toBe(parent);
    }
    expect(() => resolveGoals(viewAt(), { elements, relations: [old, next] })).toThrow(/multiple parents/);
  });

  it('does not resurrect an inline parent when its canonical link is inactive', () => {
    const doc = resolveGoals(viewAt('2026-03-01'), { elements: ELEMENTS.slice(0, 3), relations });
    expect((doc.goals as Record<string, unknown>[]).find(g => g.id === 'GOAL-EU-DE-1')?.parent).toBeUndefined();
  });

  it('refuses conflicting inline and canonical parents', () => {
    expect(() => resolveGoals(VIEW_DOC, { elements: ELEMENTS, relations: [{ ...relations[0], to: 'GOAL-EU-DE-1' }] })).toThrow(/conflicts/);
  });

  it.each(['from', 'to'])('refuses dangling %s references', (field) => {
    expect(() => resolveGoals(VIEW_DOC, { elements, relations: [{ ...relations[0], [field]: 'GOAL-MISSING-1' }] })).toThrow(/existing goals/);
  });

  it('refuses multiple parents regardless of file enumeration order', () => {
    const extra = { ...relations[1], to: 'GOAL-REVENUE-1' };
    for (const refs of [[...relations, extra], [extra, ...relations]]) {
      expect(() => resolveGoals(VIEW_DOC, { elements, relations: refs })).toThrow(/multiple parents/);
    }
  });

  it('ignores other relation kinds and tolerates duplicate same-parent links', () => {
    const doc = resolveGoals(VIEW_DOC, { elements, relations: [...relations, relations[0], { notation: 'relation', type: 'parent', from: 'CAPABILITY-V1.1', to: 'CAPABILITY-V1' }] });
    expect(parseCanonicalGoals(doc).warnings).toEqual([]);
  });
});
