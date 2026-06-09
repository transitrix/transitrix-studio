import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { validateActivities } from '../validate.js';

const EXAMPLES_DIR = path.resolve(process.cwd(), '..', '..', 'examples', 'activities');

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

  // ── Project block + calendar (ACT-014, ACT-015) ───────────────────────────

  it('ACT-014 — rejects unknown weekday in working_days', () => {
    const r = validateActivities({
      ...minimalValid,
      project: { start_date: '2026-06-01', calendar: { working_days: ['mon', 'funday'] } },
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-014' && /funday/.test(e.message))).toBe(true);
  });

  it('ACT-014 — rejects duplicate weekday entries', () => {
    const r = validateActivities({
      ...minimalValid,
      project: { calendar: { working_days: ['mon', 'tue', 'mon'] } },
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-014' && /duplicate/i.test(e.message))).toBe(true);
  });

  it('ACT-014 — accepts mixed-case weekday names', () => {
    const r = validateActivities({
      ...minimalValid,
      project: { start_date: '2026-06-01', calendar: { working_days: ['MON', 'Tue', 'wed', 'thu', 'fri'] } },
    });
    expect(r.errors.some(e => e.code === 'ACT-014')).toBe(false);
  });

  it('ACT-015 — rejects non-ISO holiday date', () => {
    const r = validateActivities({
      ...minimalValid,
      project: { start_date: '2026-06-01', calendar: { holidays: ['2026-07-04', 'July 4 2026'] } },
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-015' && /July 4 2026/.test(e.message))).toBe(true);
  });

  it('ACT-015 — accepts an array of ISO dates', () => {
    const r = validateActivities({
      ...minimalValid,
      project: { start_date: '2026-06-01', calendar: { holidays: ['2026-07-04', '2026-12-25'] } },
    });
    expect(r.errors.some(e => e.code === 'ACT-015')).toBe(false);
  });

  // ── Milestone date equality (ACT-016) ─────────────────────────────────────

  it('ACT-016 — rejects milestone with mismatched start/end dates', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'M-1', name: 'Launch', duration: 0, start_date: '2026-06-01', end_date: '2026-06-02' },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ACT-016')).toBe(true);
  });

  it('ACT-016 — accepts milestone with equal start/end dates', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'M-1', name: 'Launch', duration: 0, start_date: '2026-06-01', end_date: '2026-06-01' },
      ],
    });
    expect(r.errors.some(e => e.code === 'ACT-016')).toBe(false);
  });

  // ── Phase warnings (ACT-017, ACT-018) ─────────────────────────────────────

  it('ACT-017 — warns when a referenced-as-parent activity carries its own duration', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'PHASE-1', name: 'Design', duration: 5 },
        { id: 'A-1', name: 'Child', duration: 3, parent: 'PHASE-1' },
      ],
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.code === 'ACT-017' && /PHASE-1/.test(w.message))).toBe(true);
  });

  it('ACT-017 — no warning when phase omits duration/dates and rolls up from children', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'PHASE-1', name: 'Design' },
        { id: 'A-1', name: 'Child', duration: 3, parent: 'PHASE-1' },
      ],
    });
    expect(r.warnings.some(w => w.code === 'ACT-017')).toBe(false);
  });

  it('ACT-018 — warns when an activity with no duration is not referenced as parent', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'A-1', name: 'Has duration', duration: 3 },
        { id: 'P-EMPTY', name: 'Looks like phase but no children' },
      ],
    });
    expect(r.warnings.some(w => w.code === 'ACT-018' && /P-EMPTY/.test(w.message))).toBe(true);
  });

  it('ACT-018 — no warning when the no-duration activity has at least one child', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'PHASE-1', name: 'Phase' },
        { id: 'A-1', name: 'Child', duration: 3, parent: 'PHASE-1' },
      ],
    });
    expect(r.warnings.some(w => w.code === 'ACT-018')).toBe(false);
  });

  // ── Gantt-renderability notice (ACT-019) ──────────────────────────────────

  it('ACT-019 — warns when neither project.start_date nor pinned dates exist', () => {
    const r = validateActivities(minimalValid);
    expect(r.warnings.some(w => w.code === 'ACT-019')).toBe(true);
  });

  it('ACT-019 — no warning when project.start_date is set', () => {
    const r = validateActivities({ ...minimalValid, project: { start_date: '2026-06-01' } });
    expect(r.warnings.some(w => w.code === 'ACT-019')).toBe(false);
  });

  it('ACT-019 — no warning when every activity has pinned dates', () => {
    const r = validateActivities({
      notation: 'activities',
      activities: [
        { id: 'A-1', name: 'A', duration: 3, start_date: '2026-06-01', end_date: '2026-06-04' },
      ],
    });
    expect(r.warnings.some(w => w.code === 'ACT-019')).toBe(false);
  });

  it('[blocker] tolerates a null element in activities[] without throwing', () => {
    const r = validateActivities({ ...minimalValid, activities: [null] });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });
});

describe('activities examples (regression)', () => {
  const files = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.yaml'));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    it(`validates examples/activities/${file}`, () => {
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
      const parsed = yaml.load(text);
      const r = validateActivities(parsed);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });
  }
});
