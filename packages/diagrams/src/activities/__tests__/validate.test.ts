import { describe, it, expect } from 'vitest';
import { validateActivities } from '../validate.js';

const minimalValid = {
  notation: 'activities',
  activities: [
    { id: 'A-001', name: 'Start', duration: 3 },
    { id: 'A-002', name: 'End', duration: 2, predecessors: ['A-001'] },
  ],
};

describe('validateActivities', () => {
  it('ACT-001 — accepts valid notation field', () => {
    const r = validateActivities(minimalValid);
    expect(r.valid).toBe(true);
  });

  it('ACT-001 — rejects missing notation', () => {
    const r = validateActivities({ activities: [] });
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('ACT-001');
  });

  it('ACT-001 — rejects wrong notation value', () => {
    const r = validateActivities({ notation: 'bpmn', activities: [] });
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('ACT-001');
    expect(r.errors[0].message).toContain('"bpmn"');
  });

  it('ACT-002 — rejects activity with missing id', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [{ name: 'No ID', duration: 1 }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-002')).toBe(true);
  });

  it('ACT-002 — rejects activity with empty id', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [{ id: '  ', name: 'Empty ID', duration: 1 }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-002')).toBe(true);
  });

  it('ACT-003 — rejects activity with missing name', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [{ id: 'A-001', duration: 1 }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-003')).toBe(true);
  });

  it('ACT-004 — rejects duplicate ids', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'A-001', name: 'First', duration: 1 },
        { id: 'A-001', name: 'Duplicate', duration: 2 },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-004')).toBe(true);
  });

  it('ACT-005 — rejects unknown predecessor reference', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [{ id: 'A-001', name: 'Task', duration: 1, predecessors: ['MISSING'] }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-005')).toBe(true);
  });

  it('ACT-005 — passes when predecessor exists', () => {
    const r = validateActivities(minimalValid);
    expect(r.valid).toBe(true);
    expect(r.errors.some(e => e.code === 'ACT-005')).toBe(false);
  });

  it('ACT-006 — rejects cyclic dependency', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'A-001', name: 'Task A', duration: 1, predecessors: ['A-002'] },
        { id: 'A-002', name: 'Task B', duration: 1, predecessors: ['A-001'] },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-006')).toBe(true);
  });

  it('ACT-007 — rejects self-loop', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [{ id: 'A-001', name: 'Task', duration: 1, predecessors: ['A-001'] }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-007')).toBe(true);
  });

  it('ACT-008 — rejects end_date before start_date', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'A-001', name: 'Task', duration: 5, start_date: '2026-06-10', end_date: '2026-06-01' },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-008')).toBe(true);
  });

  it('ACT-008 — accepts end_date equal to start_date', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'A-001', name: 'Task', duration: 0, start_date: '2026-06-01', end_date: '2026-06-01' },
      ],
    });
    expect(r.errors.some(e => e.code === 'ACT-008')).toBe(false);
  });

  it('ACT-008 — rejects non-ISO start_date format', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'A-001', name: 'Task', duration: 5, start_date: 'June 1 2026' },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-008' && /start_date/.test(e.message))).toBe(true);
  });

  it('ACT-008 — rejects non-ISO end_date format', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'A-001', name: 'Task', duration: 5, end_date: '2026/06/30' },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-008' && /end_date/.test(e.message))).toBe(true);
  });

  it('ACT-008 — does not raise the order-compare error when dates are malformed', () => {
    // If start_date and end_date are both wrongly formatted, the file already
    // has two ACT-008 format errors — adding a third "end < start" complaint
    // on top would be misleading because the lexicographic compare is
    // meaningless on non-ISO strings.
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'A-001', name: 'Task', duration: 5, start_date: 'tomorrow', end_date: 'yesterday' },
      ],
    });
    expect(r.errors.filter(e => e.code === 'ACT-008').length).toBe(2);
    expect(r.errors.every(e => /must be ISO 8601 YYYY-MM-DD/.test(e.message))).toBe(true);
  });

  it('ACT-009 — rejects negative duration', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [{ id: 'A-001', name: 'Task', duration: -1 }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-009')).toBe(true);
  });

  it('ACT-009 — accepts zero duration', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [{ id: 'A-001', name: 'Milestone', duration: 0 }],
    });
    expect(r.errors.some(e => e.code === 'ACT-009')).toBe(false);
  });

  it('ACT-010 — rejects singular "goal:" field', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [{ id: 'A-001', name: 'Task', duration: 1, goal: 'GOAL-001' } as any],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-010')).toBe(true);
  });

  it('ACT-010 — rejects singular "predecessor:" field', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'A-001', name: 'First', duration: 1 },
        { id: 'A-002', name: 'Task', duration: 1, predecessor: 'A-001' } as any,
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-010')).toBe(true);
  });

  it('ACT-010 — rejects singular "tag:" field', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [{ id: 'A-001', name: 'Task', duration: 1, tag: 'q3' } as any],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-010')).toBe(true);
  });

  it('ACT-011 — warns when duration is absent', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [{ id: 'A-001', name: 'No duration' }],
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.code === 'ACT-011')).toBe(true);
  });

  it('ACT-013 — warns on structurally orphan activity', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'A-001', name: 'Connected', duration: 1 },
        { id: 'A-002', name: 'Orphan', duration: 1 },
        { id: 'A-003', name: 'End', duration: 1, predecessors: ['A-001'] },
      ],
    });
    expect(r.valid).toBe(true);
    const orphanWarnings = r.warnings.filter(w => w.code === 'ACT-013');
    expect(orphanWarnings.some(w => w.message.includes('A-002'))).toBe(true);
  });

  it('full valid example passes with no errors', () => {
    const r = validateActivities({
      notation: 'activities',
      title: 'Test Project',
      activities: [
        { id: 'A', name: 'Start', duration: 3 },
        { id: 'B', name: 'Middle', duration: 5, predecessors: ['A'] },
        { id: 'C', name: 'End', duration: 2, predecessors: ['B'] },
      ],
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});
