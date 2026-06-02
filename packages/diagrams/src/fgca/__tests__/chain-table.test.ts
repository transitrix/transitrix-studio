import { describe, it, expect } from 'vitest';
import { buildChainTable, type ChainTable, type ChainColumn } from '../chain-table.js';
import type { FGCAPreviewDoc } from '../preview-layout.js';

// Renders a ChainTable to a compact text grid for readable assertions. Each
// cell shows "label×rowSpan" (×1 omitted); a position covered by a span above
// shows "·".
function asGrid(t: ChainTable): string[][] {
  return t.rows.map(row =>
    row.map(c => {
      if (c === null) return '·';
      const label = c.cell ? c.cell.label : '∅';
      return c.rowSpan > 1 ? `${label}×${c.rowSpan}` : label;
    }),
  );
}

describe('buildChainTable — worked example (FGCA)', () => {
  // F1 → G1, G2 ; G1 → C1 → A1 ; G2 → C2 → A2, A3
  const doc: FGCAPreviewDoc = {
    factors: [{ id: 1, name: 'F1' }],
    goals: [
      { id: 10, name: 'G1', factor: [{ id: 1 }] },
      { id: 11, name: 'G2', factor: [{ id: 1 }] },
    ],
    changes: [
      { id: 20, name: 'C1', goal_id: 10, activity_ids: [30] },
      { id: 21, name: 'C2', goal_id: 11, activity_ids: [31, 32] },
    ],
    activities: [
      { id: 30, name: 'A1', goal_id: 10 },
      { id: 31, name: 'A2', goal_id: 11 },
      { id: 32, name: 'A3', goal_id: 11 },
    ],
  };

  it('produces the spec grid with F1 spanning 3 and G2/C2 spanning 2', () => {
    const t = buildChainTable(doc);
    expect(t.columns).toEqual<ChainColumn[]>(['factor', 'goal', 'change', 'activity']);
    expect(asGrid(t)).toEqual([
      ['F1×3', 'G1', 'C1', 'A1'],
      ['·', 'G2×2', 'C2×2', 'A2'],
      ['·', '·', '·', 'A3'],
    ]);
  });

  it('orders the merged cells with correct rowSpans on the model', () => {
    const t = buildChainTable(doc);
    // Factor cell spans all three rows.
    expect(t.rows[0][0]).toMatchObject({ rowSpan: 3, cell: { label: 'F1' } });
    // Covered positions are null (no <td> emitted).
    expect(t.rows[1][0]).toBeNull();
    expect(t.rows[2][1]).toBeNull();
  });
});

describe('buildChainTable — FGA (no Change column)', () => {
  // FGA links Goal → Activity directly via activity.goal_id; no changes.
  const doc: FGCAPreviewDoc = {
    factors: [{ id: 1, name: 'F1' }],
    goals: [{ id: 10, name: 'G1', factor: [{ id: 1 }] }],
    activities: [
      { id: 30, name: 'A1', goal_id: 10 },
      { id: 31, name: 'A2', goal_id: 10 },
    ],
  };

  it('emits three columns and merges Factor/Goal across the two activities', () => {
    const t = buildChainTable(doc, { hideChanges: true });
    expect(t.columns).toEqual<ChainColumn[]>(['factor', 'goal', 'activity']);
    expect(asGrid(t)).toEqual([
      ['F1×2', 'G1×2', 'A1'],
      ['·', '·', 'A2'],
    ]);
  });
});

describe('buildChainTable — missing downstream links (gaps stay visible)', () => {
  it('shows a factor with no goal, a goal with no change, and a change with no activity', () => {
    const doc: FGCAPreviewDoc = {
      factors: [
        { id: 1, name: 'F1' },
        { id: 2, name: 'F2' }, // no goals
      ],
      goals: [
        { id: 10, name: 'G1', factor: [{ id: 1 }] }, // no change, no activity
        { id: 11, name: 'G2', factor: [{ id: 1 }] }, // has a change with no activity
      ],
      changes: [{ id: 20, name: 'C1', goal_id: 11, activity_ids: [] }],
      activities: [],
    };
    const t = buildChainTable(doc);
    expect(asGrid(t)).toEqual([
      ['F1×2', 'G1', '∅', '∅'],
      ['·', 'G2', 'C1', '∅'],
      ['F2', '∅', '∅', '∅'],
    ]);
  });

  it('renders a change-less direct goal→activity path with an empty Change cell', () => {
    const doc: FGCAPreviewDoc = {
      factors: [{ id: 1, name: 'F1' }],
      goals: [{ id: 10, name: 'G1', factor: [{ id: 1 }] }],
      // activity bound straight to the goal, not covered by any change
      changes: [],
      activities: [{ id: 30, name: 'A1', goal_id: 10 }],
    };
    const t = buildChainTable(doc);
    expect(asGrid(t)).toEqual([['F1', 'G1', '∅', 'A1']]);
  });
});

describe('buildChainTable — orphans (broken refs are warnings, not errors)', () => {
  it('places a goal with a missing factor in a trailing empty-Factor row', () => {
    const doc: FGCAPreviewDoc = {
      factors: [{ id: 1, name: 'F1' }],
      goals: [
        { id: 10, name: 'G1', factor: [{ id: 1 }] },
        { id: 11, name: 'Gx', factor: [{ id: 99 }] }, // factor 99 does not exist
        { id: 12, name: 'Gy' }, // no factor at all
      ],
      changes: [{ id: 20, name: 'C1', goal_id: 10, activity_ids: [30] }],
      activities: [{ id: 30, name: 'A1', goal_id: 10 }],
    };
    const t = buildChainTable(doc);
    expect(asGrid(t)).toEqual([
      ['F1', 'G1', 'C1', 'A1'],
      ['∅×2', 'Gx', '∅', '∅'],
      ['·', 'Gy', '∅', '∅'],
    ]);
  });

  it('surfaces an unlinked activity as a trailing row with empty cells to its left', () => {
    const doc: FGCAPreviewDoc = {
      factors: [{ id: 1, name: 'F1' }],
      goals: [{ id: 10, name: 'G1', factor: [{ id: 1 }] }],
      changes: [{ id: 20, name: 'C1', goal_id: 10, activity_ids: [30] }],
      activities: [
        { id: 30, name: 'A1', goal_id: 10 },
        { id: 99, name: 'Aorphan' }, // no goal, no change
      ],
    };
    const t = buildChainTable(doc);
    expect(asGrid(t)).toEqual([
      ['F1', 'G1', 'C1', 'A1'],
      ['∅', '∅', '∅', 'Aorphan'],
    ]);
  });

  it('surfaces a change whose goal is missing as an empty Factor+Goal row', () => {
    const doc: FGCAPreviewDoc = {
      factors: [],
      goals: [],
      changes: [{ id: 20, name: 'Cx', goal_id: 999, activity_ids: [30] }],
      activities: [{ id: 30, name: 'A1' }],
    };
    const t = buildChainTable(doc);
    expect(asGrid(t)).toEqual([['∅', '∅', 'Cx', 'A1']]);
  });
});

describe('buildChainTable — name fallback', () => {
  it('falls back to the id when an element has an empty name', () => {
    const doc: FGCAPreviewDoc = {
      factors: [{ id: 7, name: '' }],
      goals: [],
      activities: [],
    };
    const t = buildChainTable(doc);
    expect(t.rows[0][0]?.cell?.label).toBe('7');
  });
});
