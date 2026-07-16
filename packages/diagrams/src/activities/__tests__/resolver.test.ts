import { describe, it, expect } from 'vitest';
import { resolveAction, isActionViewDoc } from '../resolver.js';
import { validateActivities } from '../validate.js';

// ── Inline canon element store (WBS: Initiative → Programme → Project → Task) ─

const ELEMENTS = [
  {
    notation: 'action', id: 'ACTION-PLATFORM-LAUNCH-1', name: 'Platform Launch 2026',
    type: 'Initiative', goals: ['GOAL-CUST-001'], valid_from: '2026-01-01', valid_to: null,
  },
  {
    notation: 'action', id: 'ACTION-PLATFORM-REQ-1', name: 'Requirements analysis',
    type: 'Task', parent: 'ACTION-PLATFORM-LAUNCH-1', duration: 5, goals: ['GOAL-CUST-001'],
    valid_from: '2026-01-01', valid_to: null,
  },
  {
    notation: 'action', id: 'ACTION-PLATFORM-ARCH-1', name: 'Architecture design',
    type: 'Task', parent: 'ACTION-PLATFORM-LAUNCH-1', duration: 8,
    predecessors: ['ACTION-PLATFORM-REQ-1'], goals: ['GOAL-CUST-001'],
    valid_from: '2026-01-01', valid_to: null,
  },
  {
    // Deprecated alias — notation: activity, field: activity_type.
    notation: 'activity', id: 'ACTIVITY-LEGACY-1', name: 'Legacy migration step',
    activity_type: 'Task', parent: 'ACTION-PLATFORM-LAUNCH-1', duration: 3,
  },
  {
    notation: 'action', id: 'ACTION-GDPR-1', name: 'GDPR Remediation',
    type: 'Programme', goals: ['GOAL-COMPLIANCE-001'], valid_from: '2026-01-01', valid_to: null,
  },
  {
    notation: 'action', id: 'ACTION-GDPR-AUDIT-1', name: 'Data audit',
    type: 'Task', parent: 'ACTION-GDPR-1', duration: 10,
    valid_from: '2026-06-01', valid_to: '2026-06-30',
  },
];

const SOURCES = { elements: ELEMENTS };

const VIEW_DOC = {
  notation: 'action',
  id: 'ACTION_SCHED-PLATFORM-2026-1',
  name: 'Platform Launch 2026',
  spec_version: '0.1',
  view_config: {
    scope: { root_action: 'ACTION-PLATFORM-LAUNCH-1' },
    schedule: {
      start_date: '2026-06-01',
      calendar: { working_days: ['mon', 'tue', 'wed', 'thu', 'fri'], hours_per_day: 8 },
    },
  },
};

// ── isActionViewDoc ────────────────────────────────────────────────────────

describe('isActionViewDoc', () => {
  it('returns true for a view_config-based doc', () => {
    expect(isActionViewDoc(VIEW_DOC)).toBe(true);
  });

  it('returns false for an inline doc with an actions[] array', () => {
    expect(isActionViewDoc({ notation: 'action', actions: [] })).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isActionViewDoc(null)).toBe(false);
    expect(isActionViewDoc('string')).toBe(false);
    expect(isActionViewDoc(42)).toBe(false);
  });
});

// ── resolveAction — root_action scoping ───────────────────────────────────

describe('resolveAction — scope.root_action', () => {
  it('includes the root action and its transitive descendants only', () => {
    const doc = resolveAction(VIEW_DOC, SOURCES);
    const ids = (doc['actions'] as Array<{ id: string }>).map((a) => a.id).sort();
    expect(ids).toEqual([
      'ACTION-PLATFORM-ARCH-1',
      'ACTION-PLATFORM-LAUNCH-1',
      'ACTION-PLATFORM-REQ-1',
      'ACTIVITY-LEGACY-1',
    ]);
    expect(ids).not.toContain('ACTION-GDPR-1');
    expect(ids).not.toContain('ACTION-GDPR-AUDIT-1');
  });

  it('accepts legacy notation: activity elements as ACTION descendants', () => {
    const doc = resolveAction(VIEW_DOC, SOURCES);
    const legacy = (doc['actions'] as Array<Record<string, unknown>>).find((a) => a.id === 'ACTIVITY-LEGACY-1');
    expect(legacy).toBeDefined();
    expect(legacy?.['activity_type']).toBe('Task');
  });

  it('maps the canonical element `type` field to the internal `activity_type` field', () => {
    const doc = resolveAction(VIEW_DOC, SOURCES);
    const root = (doc['actions'] as Array<Record<string, unknown>>).find((a) => a.id === 'ACTION-PLATFORM-LAUNCH-1');
    expect(root?.['activity_type']).toBe('Initiative');
    expect(root?.['type']).toBeUndefined();
  });

  it('drops the admission/lifecycle envelope fields not used by validateActivities', () => {
    const doc = resolveAction(VIEW_DOC, SOURCES);
    const root = (doc['actions'] as Array<Record<string, unknown>>).find((a) => a.id === 'ACTION-PLATFORM-LAUNCH-1');
    expect(root?.['zone']).toBeUndefined();
    expect(root?.['valid_from']).toBeUndefined();
    expect(root?.['valid_to']).toBeUndefined();
  });

  it('returns an empty actions[] when root_action does not resolve', () => {
    const viewDoc = { ...VIEW_DOC, view_config: { scope: { root_action: 'ACTION-NONEXISTENT-1' } } };
    const doc = resolveAction(viewDoc, SOURCES);
    expect((doc['actions'] as unknown[]).length).toBe(0);
  });

  it('carries schedule.start_date and calendar onto the resolved project block', () => {
    const doc = resolveAction(VIEW_DOC, SOURCES);
    expect(doc['project']).toEqual({
      start_date: '2026-06-01',
      calendar: { working_days: ['mon', 'tue', 'wed', 'thu', 'fri'], hours_per_day: 8 },
    });
  });

  it('carries view doc metadata (id, title from name, spec_version)', () => {
    const doc = resolveAction(VIEW_DOC, SOURCES);
    expect(doc['notation']).toBe('action');
    expect(doc['id']).toBe('ACTION_SCHED-PLATFORM-2026-1');
    expect(doc['title']).toBe('Platform Launch 2026');
    expect(doc['spec_version']).toBe('0.1');
  });

  it('produces a document that passes validateActivities', () => {
    const doc = resolveAction(VIEW_DOC, SOURCES);
    const v = validateActivities(doc);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});

// ── resolveAction — scope.goals ───────────────────────────────────────────

describe('resolveAction — scope.goals', () => {
  it('narrows to actions linked to at least one listed goal, ignoring hierarchy', () => {
    const viewDoc = { ...VIEW_DOC, view_config: { scope: { goals: ['GOAL-COMPLIANCE-001'] } } };
    const doc = resolveAction(viewDoc, SOURCES);
    const ids = (doc['actions'] as Array<{ id: string }>).map((a) => a.id);
    expect(ids).toEqual(['ACTION-GDPR-1']);
  });
});

// ── resolveAction — scope.type_filter ─────────────────────────────────────

describe('resolveAction — scope.type_filter', () => {
  it('narrows the full catalogue to actions of a listed type', () => {
    const viewDoc = { ...VIEW_DOC, view_config: { scope: { type_filter: ['Programme'] } } };
    const doc = resolveAction(viewDoc, SOURCES);
    const ids = (doc['actions'] as Array<{ id: string }>).map((a) => a.id);
    expect(ids).toEqual(['ACTION-GDPR-1']);
  });

  it('composes with root_action — intersection, not union', () => {
    const viewDoc = {
      ...VIEW_DOC,
      view_config: { scope: { root_action: 'ACTION-PLATFORM-LAUNCH-1', type_filter: ['Task'] } },
    };
    const doc = resolveAction(viewDoc, SOURCES);
    const ids = (doc['actions'] as Array<{ id: string }>).map((a) => a.id).sort();
    expect(ids).toEqual(['ACTION-PLATFORM-ARCH-1', 'ACTION-PLATFORM-REQ-1', 'ACTIVITY-LEGACY-1']);
  });
});

// ── resolveAction — scope.valid_at ────────────────────────────────────────

describe('resolveAction — scope.valid_at', () => {
  it('excludes actions outside their [valid_from, valid_to] window', () => {
    const viewDoc = {
      ...VIEW_DOC,
      view_config: { scope: { root_action: 'ACTION-GDPR-1', valid_at: '2026-07-15' } },
    };
    const doc = resolveAction(viewDoc, SOURCES);
    const ids = (doc['actions'] as Array<{ id: string }>).map((a) => a.id).sort();
    // ACTION-GDPR-AUDIT-1's window (2026-06-01..2026-06-30) has already closed by 2026-07-15.
    expect(ids).toEqual(['ACTION-GDPR-1']);
  });

  it('keeps actions with no valid_from tracked (permissive default)', () => {
    const viewDoc = {
      notation: 'action', id: 'X', name: 'X',
      view_config: { scope: { valid_at: '2026-07-15' } },
    };
    const untracked = { notation: 'action', id: 'ACTION-UNTRACKED-1', name: 'Untracked' };
    const doc = resolveAction(viewDoc, { elements: [...ELEMENTS, untracked] });
    const ids = (doc['actions'] as Array<{ id: string }>).map((a) => a.id);
    expect(ids).toContain('ACTION-UNTRACKED-1');
  });
});

// ── resolveAction — empty / degenerate inputs ─────────────────────────────

describe('resolveAction — empty sources', () => {
  it('returns empty actions[] when canon has no elements', () => {
    const doc = resolveAction(VIEW_DOC, { elements: [] });
    expect((doc['actions'] as unknown[]).length).toBe(0);
  });

  it('returns an empty inline document for a non-object viewDoc', () => {
    const doc = resolveAction(null, SOURCES);
    expect(doc).toEqual({ notation: 'action', actions: [] });
  });

  it('includes the full catalogue when scope is entirely omitted', () => {
    const viewDoc = { notation: 'action', id: 'X', name: 'X', view_config: {} };
    const doc = resolveAction(viewDoc, SOURCES);
    expect((doc['actions'] as unknown[]).length).toBe(ELEMENTS.length);
  });
});
