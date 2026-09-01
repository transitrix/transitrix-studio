import { describe, it, expect } from 'vitest';
import {
  layoutFGCAPreview,
  FGCA_PAD,
  FGCA_NODE_W,
  chainColumnOptions,
  sanitizeChainScope,
  type FGCAPreviewDoc,
} from '../preview-layout.js';

const doc: FGCAPreviewDoc = {
  factors: [
    { id: 1, name: 'F1' },
    { id: 2, name: 'F2' },
  ],
  goals: [
    { id: 10, name: 'G1', factor: [{ id: 1 }] },
    { id: 11, name: 'G2', factor: [{ id: 2 }] },
  ],
  changes: [{ id: 20, name: 'C1', goal_id: 10, activity_ids: [30] }],
  activities: [
    { id: 30, name: 'A1', goal_id: 10 },
    { id: 31, name: 'A2', goal_id: 11 },
  ],
};

describe('layoutFGCAPreview', () => {
  it('lays out all four columns in order (FGCA)', () => {
    const layout = layoutFGCAPreview(doc);
    expect(layout.columns.map(c => c.col)).toEqual(['driver', 'goal', 'change', 'activity']);
    // 2 factors + 2 goals + 1 change + 2 activities
    expect(layout.nodes).toHaveLength(7);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('produces the expected FGCA edge set', () => {
    // F1→G1, F2→G2 (2), G1→C1 (1), C1→A1 (1), G2→A2 direct (1) = 5
    const layout = layoutFGCAPreview(doc);
    expect(layout.edges).toHaveLength(5);
  });

  it('hideChanges (FGA) drops the Changes column and links goals to activities', () => {
    const layout = layoutFGCAPreview(doc, { hideChanges: true });
    expect(layout.columns.map(c => c.col)).toEqual(['driver', 'goal', 'activity']);
    // 2 factors + 2 goals + 2 activities
    expect(layout.nodes).toHaveLength(6);
    // F1→G1, F2→G2 (2), G1→A1, G2→A2 (2) = 4
    expect(layout.edges).toHaveLength(4);
  });

  it('first column sits at the pad origin', () => {
    const layout = layoutFGCAPreview(doc);
    expect(layout.columns[0].x).toBe(FGCA_PAD);
  });

  it('empty options reproduce the default layout', () => {
    const a = layoutFGCAPreview(doc);
    const b = layoutFGCAPreview(doc, {});
    expect(b.nodes.map(n => `${n.id}:${n.x},${n.y}`)).toEqual(a.nodes.map(n => `${n.id}:${n.x},${n.y}`));
  });

  it('larger colGap widens the column step', () => {
    const stepOf = (colGap: number) => {
      const cols = layoutFGCAPreview(doc, { colGap }).columns;
      return cols[1].x - cols[0].x;
    };
    expect(stepOf(80)).toBe(FGCA_NODE_W + 80);
    expect(stepOf(240)).toBe(FGCA_NODE_W + 240);
    expect(stepOf(240)).toBeGreaterThan(stepOf(80));
  });

  it('larger rowGap increases the gap between stacked nodes', () => {
    const gapOf = (rowGap: number) => {
      const factors = layoutFGCAPreview(doc, { rowGap }).nodes.filter(n => n.col === 'driver');
      return factors[1].y - factors[0].y;
    };
    expect(gapOf(120)).toBeGreaterThan(gapOf(20));
  });

  // Scope filtering. FGCA goals are flat, so 'root'
  // selects the single matching goal plus the factors/changes/activities that
  // touch it.
  describe('scope', () => {
    const idsOf = (layout: ReturnType<typeof layoutFGCAPreview>) => new Set(layout.nodes.map(n => n.id));

    it("mode 'root' keeps only the root goal and what connects to it", () => {
      // root 10 → factor 1 (referenced by G10), change 20 (goal_id 10),
      // activity 30 (via change 20). G11/F2/A31 are dropped.
      const layout = layoutFGCAPreview(doc, { scope: { mode: 'root', rootGoalId: '10' } });
      expect(idsOf(layout)).toEqual(new Set(['driver_1', 'goal_10', 'change_20', 'activity_30']));
    });

    it("mode 'root' filters factors and activities to those touching the visible goal", () => {
      // root 11 → factor 2, activity 31 (direct goal link); no change touches G11.
      const layout = layoutFGCAPreview(doc, { scope: { mode: 'root', rootGoalId: '11' } });
      expect(idsOf(layout)).toEqual(new Set(['driver_2', 'goal_11', 'activity_31']));
      // F1, A30, C20 (which only touch the hidden G10) are excluded.
      expect(layout.nodes.some(n => n.id === 'driver_1')).toBe(false);
      expect(layout.nodes.some(n => n.id === 'activity_30')).toBe(false);
    });

    it("mode 'level' trims goals above the cap and their connections", () => {
      const leveled: FGCAPreviewDoc = {
        factors: [{ id: 1, name: 'F1' }, { id: 2, name: 'F2' }],
        goals: [
          { id: 10, name: 'G1', level: 0, factor: [{ id: 1 }] },
          { id: 11, name: 'G2', level: 1, factor: [{ id: 2 }] },
        ],
        changes: [],
        activities: [
          { id: 30, name: 'A1', goal_id: 10 },
          { id: 31, name: 'A2', goal_id: 11 },
        ],
      };
      const layout = layoutFGCAPreview(leveled, { scope: { mode: 'level', maxLevel: 0 } });
      expect(idsOf(layout)).toEqual(new Set(['driver_1', 'goal_10', 'activity_30']));
    });

    it("mode 'chain' ANDs column filters and keeps the connecting thread", () => {
      const layout = layoutFGCAPreview(doc, { scope: { mode: 'chain', driverId: '1', goalId: '10' } });
      expect(idsOf(layout)).toEqual(new Set(['driver_1', 'goal_10', 'change_20', 'activity_30']));
    });

    it("mode 'chain' with a single action keeps its upstream thread", () => {
      const layout = layoutFGCAPreview(doc, { scope: { mode: 'chain', activityId: '31' } });
      expect(idsOf(layout)).toEqual(new Set(['driver_2', 'goal_11', 'activity_31']));
    });

    it("mode 'chain' returns empty when selected columns are not on one thread", () => {
      const layout = layoutFGCAPreview(doc, { scope: { mode: 'chain', driverId: '1', goalId: '11' } });
      expect(layout.nodes).toHaveLength(0);
    });

    it("mode 'chain' ignores changeId when hideChanges is set (DGA)", () => {
      const layout = layoutFGCAPreview(doc, {
        hideChanges: true,
        scope: { mode: 'chain', changeId: '20', goalId: '11' },
      });
      expect(idsOf(layout)).toEqual(new Set(['driver_2', 'goal_11', 'activity_31']));
    });

    it("mode 'root' returns an empty layout when the root is absent", () => {
      const layout = layoutFGCAPreview(doc, { scope: { mode: 'root', rootGoalId: '999' } });
      expect(layout.nodes).toHaveLength(0);
      expect(layout.edges).toHaveLength(0);
    });
  });
});

describe('chainColumnOptions', () => {
  it('lists every entity when no other column is filtered', () => {
    const scope = { mode: 'chain' as const };
    expect(chainColumnOptions(doc, scope, 'goalId').map(o => o.id)).toEqual(['10', '11']);
    expect(chainColumnOptions(doc, scope, 'driverId').map(o => o.id)).toEqual(['1', '2']);
  });

  it('narrows neighbouring columns to the selected thread', () => {
    const scope = { mode: 'chain' as const, driverId: '1' };
    expect(chainColumnOptions(doc, scope, 'goalId').map(o => o.id)).toEqual(['10']);
    expect(chainColumnOptions(doc, scope, 'activityId').map(o => o.id)).toEqual(['30']);
    // Own column stays full so the user can switch the driver.
    expect(chainColumnOptions(doc, scope, 'driverId').map(o => o.id)).toEqual(['1', '2']);
  });

  it('omits the change column when hideChanges is set', () => {
    expect(chainColumnOptions(doc, { mode: 'chain' }, 'changeId', true)).toEqual([]);
  });
});

describe('sanitizeChainScope', () => {
  it('clears a neighbour that the last pick made unreachable', () => {
    const cleaned = sanitizeChainScope(
      doc,
      { mode: 'chain', driverId: '2', goalId: '10' },
      { justChanged: 'driverId' },
    );
    expect(cleaned.driverId).toBe('2');
    expect(cleaned.goalId).toBeUndefined();
  });

  it('keeps the last pick when neighbours would otherwise clear it', () => {
    const cleaned = sanitizeChainScope(
      doc,
      { mode: 'chain', driverId: '1', goalId: '11' },
      { justChanged: 'goalId' },
    );
    expect(cleaned.goalId).toBe('11');
    expect(cleaned.driverId).toBeUndefined();
  });
});
