import { describe, it, expect } from 'vitest';
import { computeGanttLayout, isGanttUnavailable } from '../gantt.js';
import type { ActivityDoc, GanttLayout } from '../types.js';

function assertRenders(result: ReturnType<typeof computeGanttLayout>): GanttLayout {
  if (isGanttUnavailable(result)) {
    throw new Error(`Expected Gantt to render but got unavailable: ${result.reason}`);
  }
  return result;
}

describe('computeGanttLayout — mode detection', () => {
  it('returns unavailable when neither project.start_date nor pinned dates exist', () => {
    const doc: ActivityDoc = {
      notation: 'activities',
      activities: [
        { id: 'A', name: 'A', duration: 3 },
        { id: 'B', name: 'B', duration: 2, predecessors: ['A'] },
      ],
    };
    const r = computeGanttLayout(doc);
    expect(isGanttUnavailable(r)).toBe(true);
  });

  it('selects computed mode when project.start_date + every leaf has duration', () => {
    const doc: ActivityDoc = {
      notation: 'activities',
      project: { start_date: '2026-06-01' },
      activities: [
        { id: 'A', name: 'A', duration: 3 },
        { id: 'B', name: 'B', duration: 2, predecessors: ['A'] },
      ],
    };
    const r = assertRenders(computeGanttLayout(doc));
    expect(r.mode).toBe('computed');
  });

  it('selects pinned mode when every leaf has start_date + end_date', () => {
    const doc: ActivityDoc = {
      notation: 'activities',
      activities: [
        { id: 'A', name: 'A', start_date: '2026-06-01', end_date: '2026-06-03' },
        { id: 'B', name: 'B', start_date: '2026-06-04', end_date: '2026-06-06' },
      ],
    };
    const r = assertRenders(computeGanttLayout(doc));
    expect(r.mode).toBe('pinned');
  });

  it('unavailable when only some leaves have pinned dates and no project.start_date', () => {
    const doc: ActivityDoc = {
      notation: 'activities',
      activities: [
        { id: 'A', name: 'A', start_date: '2026-06-01', end_date: '2026-06-03' },
        { id: 'B', name: 'B', duration: 3 }, // no pinned dates, no project.start_date
      ],
    };
    const r = computeGanttLayout(doc);
    expect(isGanttUnavailable(r)).toBe(true);
  });

  it('unavailable when the document has no activities', () => {
    const r = computeGanttLayout({ notation: 'activities', activities: [] });
    expect(isGanttUnavailable(r)).toBe(true);
  });
});

describe('computeGanttLayout — computed mode (CPM + calendar projection)', () => {
  const doc: ActivityDoc = {
    notation: 'activities',
    project: { start_date: '2026-06-01' }, // Monday
    activities: [
      { id: 'A', name: 'A', duration: 3 },
      { id: 'B', name: 'B', duration: 2, predecessors: ['A'] },
    ],
  };

  it('places the first bar at project.start_date and spans its duration', () => {
    const r = assertRenders(computeGanttLayout(doc));
    const a = r.bars.find(b => b.id === 'A')!;
    expect(a.startDate).toBe('2026-06-01');
    // 7-day default calendar: day 0 = start_date, last day = 2026-06-03 (start + 2)
    expect(a.endDate).toBe('2026-06-03');
  });

  it('places successor bars after their predecessor finishes', () => {
    const r = assertRenders(computeGanttLayout(doc));
    const b = r.bars.find(b => b.id === 'B')!;
    // B has ES = EF(A) = 3 working days, so it starts at 2026-06-04
    expect(b.startDate).toBe('2026-06-04');
    expect(b.endDate).toBe('2026-06-05');
  });

  it('marks critical-path bars on a linear chain', () => {
    const r = assertRenders(computeGanttLayout(doc));
    const a = r.bars.find(b => b.id === 'A')!;
    const bbar = r.bars.find(b => b.id === 'B')!;
    expect(a.isCritical).toBe(true);
    expect(bbar.isCritical).toBe(true);
  });

  it('emits predecessor → successor links with critical flag carried over', () => {
    const r = assertRenders(computeGanttLayout(doc));
    expect(r.links).toHaveLength(1);
    expect(r.links[0]).toMatchObject({ sourceId: 'A', targetId: 'B', isCritical: true });
  });

  it('timeline bounds span min(start) to max(end)', () => {
    const r = assertRenders(computeGanttLayout(doc));
    expect(r.timelineStart).toBe('2026-06-01');
    expect(r.timelineEnd).toBe('2026-06-05');
  });
});

describe('computeGanttLayout — calendar (working_days, holidays)', () => {
  it('skips weekend days when working_days excludes them', () => {
    // 2026-06-01 is a Monday. Duration 7 days, only Mon–Fri working.
    // Day 0 = Mon 06-01, days 1..4 = Tue-Fri, day 5 = next Mon 06-08, day 6 = Tue 06-09.
    const doc: ActivityDoc = {
      notation: 'activities',
      project: {
        start_date: '2026-06-01',
        calendar: { working_days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      },
      activities: [{ id: 'A', name: 'A', duration: 7 }],
    };
    const r = assertRenders(computeGanttLayout(doc));
    const a = r.bars.find(b => b.id === 'A')!;
    expect(a.startDate).toBe('2026-06-01');
    expect(a.endDate).toBe('2026-06-09');
  });

  it('skips dates listed under holidays', () => {
    // 7-day week, but 2026-06-02 is a holiday → 3-day activity ends on 2026-06-04.
    const doc: ActivityDoc = {
      notation: 'activities',
      project: {
        start_date: '2026-06-01',
        calendar: { holidays: ['2026-06-02'] },
      },
      activities: [{ id: 'A', name: 'A', duration: 3 }],
    };
    const r = assertRenders(computeGanttLayout(doc));
    const a = r.bars.find(b => b.id === 'A')!;
    expect(a.startDate).toBe('2026-06-01');
    expect(a.endDate).toBe('2026-06-04');
  });
});

describe('computeGanttLayout — milestones', () => {
  it('renders zero-duration leaves as milestones with start == end', () => {
    const doc: ActivityDoc = {
      notation: 'activities',
      project: { start_date: '2026-06-01' },
      activities: [
        { id: 'A', name: 'A', duration: 3 },
        { id: 'M', name: 'Launch', duration: 0, predecessors: ['A'] },
      ],
    };
    const r = assertRenders(computeGanttLayout(doc));
    const m = r.bars.find(b => b.id === 'M')!;
    expect(m.kind).toBe('milestone');
    expect(m.startDate).toBe(m.endDate);
    // M lives at the working day immediately after A finishes (ES = 3).
    expect(m.startDate).toBe('2026-06-04');
  });

  it('pinned mode treats start==end activities as milestones', () => {
    const doc: ActivityDoc = {
      notation: 'activities',
      activities: [
        { id: 'M', name: 'Launch', duration: 0, start_date: '2026-06-15', end_date: '2026-06-15' },
      ],
    };
    const r = assertRenders(computeGanttLayout(doc));
    const m = r.bars.find(b => b.id === 'M')!;
    expect(m.kind).toBe('milestone');
  });
});

describe('computeGanttLayout — phases (parent activities)', () => {
  it('rolls up phase span from children', () => {
    const doc: ActivityDoc = {
      notation: 'activities',
      project: { start_date: '2026-06-01' },
      activities: [
        { id: 'PHASE-1', name: 'Design' },
        { id: 'A', name: 'A', duration: 3, parent: 'PHASE-1' },
        { id: 'B', name: 'B', duration: 5, parent: 'PHASE-1', predecessors: ['A'] },
      ],
    };
    const r = assertRenders(computeGanttLayout(doc));
    const phase = r.bars.find(b => b.id === 'PHASE-1')!;
    expect(phase.kind).toBe('phase');
    expect(phase.startDate).toBe('2026-06-01'); // earliest child = A start
    expect(phase.endDate).toBe('2026-06-08');   // latest child = B end (ES=3 + 5 days)
  });

  it('marks the phase critical if any child is on the critical path', () => {
    const doc: ActivityDoc = {
      notation: 'activities',
      project: { start_date: '2026-06-01' },
      activities: [
        { id: 'PHASE-1', name: 'Design' },
        { id: 'A', name: 'A', duration: 3, parent: 'PHASE-1' },
      ],
    };
    const r = assertRenders(computeGanttLayout(doc));
    const phase = r.bars.find(b => b.id === 'PHASE-1')!;
    expect(phase.isCritical).toBe(true);
  });
});

describe('computeGanttLayout — pinned mode', () => {
  it('places bars at pinned dates without computing CPM', () => {
    const doc: ActivityDoc = {
      notation: 'activities',
      activities: [
        { id: 'A', name: 'A', start_date: '2026-08-01', end_date: '2026-08-10' },
        { id: 'B', name: 'B', start_date: '2026-08-12', end_date: '2026-08-20', predecessors: ['A'] },
      ],
    };
    const r = assertRenders(computeGanttLayout(doc));
    expect(r.mode).toBe('pinned');
    expect(r.bars.find(b => b.id === 'A')?.startDate).toBe('2026-08-01');
    expect(r.bars.find(b => b.id === 'A')?.endDate).toBe('2026-08-10');
    expect(r.bars.find(b => b.id === 'B')?.startDate).toBe('2026-08-12');
    // Pinned mode does not compute CPM → critical flag is false.
    expect(r.bars.find(b => b.id === 'A')?.isCritical).toBe(false);
  });

  it('still emits links between pinned leaves', () => {
    const doc: ActivityDoc = {
      notation: 'activities',
      activities: [
        { id: 'A', name: 'A', start_date: '2026-08-01', end_date: '2026-08-10' },
        { id: 'B', name: 'B', start_date: '2026-08-12', end_date: '2026-08-20', predecessors: ['A'] },
      ],
    };
    const r = assertRenders(computeGanttLayout(doc));
    expect(r.links).toHaveLength(1);
    expect(r.links[0].sourceId).toBe('A');
    expect(r.links[0].targetId).toBe('B');
  });
});
