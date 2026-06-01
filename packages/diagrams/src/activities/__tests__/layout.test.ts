import { describe, it, expect } from 'vitest';
import { layoutActivities } from '../layout.js';
import type { ActivityDoc } from '../types.js';

const diamondDoc: ActivityDoc = {
  notation: 'activities',
  activities: [
    { id: 'A', name: 'Start', duration: 3 },
    { id: 'B', name: 'Left', duration: 5, predecessors: ['A'] },
    { id: 'C', name: 'Right', duration: 2, predecessors: ['A'] },
    { id: 'D', name: 'Merge', duration: 4, predecessors: ['B', 'C'] },
  ],
};

describe('layoutActivities', () => {
  it('returns empty layout for empty activities', () => {
    const layout = layoutActivities({ notation: 'activities', activities: [] });
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
  });

  it('assigns each node a unique position', () => {
    const layout = layoutActivities(diamondDoc);
    const positions = layout.nodes.map(n => `${n.x},${n.y}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(layout.nodes.length);
  });

  it('assigns predecessors to strictly lower column indices than successors', () => {
    const layout = layoutActivities(diamondDoc);
    const colOf = new Map(layout.nodes.map(n => [n.id, Math.round(n.x / 280)]));
    // A is in col 0; B and C are in col 1; D is in col 2
    expect(colOf.get('A')).toBeLessThan(colOf.get('B')!);
    expect(colOf.get('A')).toBeLessThan(colOf.get('C')!);
    expect(colOf.get('B')).toBeLessThan(colOf.get('D')!);
    expect(colOf.get('C')).toBeLessThan(colOf.get('D')!);
  });

  it('produces edges connecting predecessors to successors', () => {
    const layout = layoutActivities(diamondDoc);
    const edgePairs = layout.edges.map(e => `${e.sourceId}->${e.targetId}`);
    expect(edgePairs).toContain('A->B');
    expect(edgePairs).toContain('A->C');
    expect(edgePairs).toContain('B->D');
    expect(edgePairs).toContain('C->D');
  });

  it('marks critical edges correctly', () => {
    // A(3)→B(5)→D(4): critical path = 3+5+4=12; C(2) has slack
    const layout = layoutActivities(diamondDoc);
    const edgeMap = new Map(layout.edges.map(e => [`${e.sourceId}->${e.targetId}`, e.isCritical]));
    expect(edgeMap.get('A->B')).toBe(true);
    expect(edgeMap.get('B->D')).toBe(true);
    expect(edgeMap.get('A->C')).toBe(false);
    expect(edgeMap.get('C->D')).toBe(false);
  });

  it('attaches CPM values to nodes', () => {
    const layout = layoutActivities(diamondDoc);
    const nodeA = layout.nodes.find(n => n.id === 'A')!;
    expect(nodeA.cpm).toBeDefined();
    expect(nodeA.cpm!.es).toBe(0);
    expect(nodeA.cpm!.ef).toBe(3);
    expect(nodeA.cpm!.isCritical).toBe(true);
  });

  it('respects sort field for ordering within a column', () => {
    const doc: ActivityDoc = {
      notation: 'activities',
      activities: [
        { id: 'A', name: 'Root', duration: 1 },
        { id: 'B', name: 'Second', duration: 1, predecessors: ['A'], sort: 20 },
        { id: 'C', name: 'First', duration: 1, predecessors: ['A'], sort: 10 },
      ],
    };
    const layout = layoutActivities(doc);
    const col1Nodes = layout.nodes.filter(n => n.id === 'B' || n.id === 'C').sort((a, b) => a.y - b.y);
    // C (sort=10) should appear above B (sort=20)
    expect(col1Nodes[0].id).toBe('C');
    expect(col1Nodes[1].id).toBe('B');
  });

  it('computes non-empty bounds for non-empty activities', () => {
    const layout = layoutActivities(diamondDoc);
    expect(layout.bounds.width).toBeGreaterThan(0);
    expect(layout.bounds.height).toBeGreaterThan(0);
  });

  // vkgeorgia/strategy#75 — configurable spacing.
  it('empty options reproduce the default no-arg layout', () => {
    const a = layoutActivities(diamondDoc);
    const b = layoutActivities(diamondDoc, {});
    expect(b.nodes.map(n => `${n.id}:${n.x},${n.y}`)).toEqual(a.nodes.map(n => `${n.id}:${n.x},${n.y}`));
  });

  it('larger horizontalGap pushes downstream columns further right', () => {
    const xOfD = (h: number) =>
      layoutActivities(diamondDoc, { horizontalGap: h }).nodes.find(n => n.id === 'D')!.x;
    expect(xOfD(200)).toBeGreaterThan(xOfD(80));
  });

  it('larger verticalGap increases the gap between stacked column nodes', () => {
    const gapOf = (v: number) => {
      const ys = layoutActivities(diamondDoc, { verticalGap: v })
        .nodes.filter(n => n.id === 'B' || n.id === 'C')
        .map(n => n.y)
        .sort((a, b) => a - b);
      return ys[1] - ys[0];
    };
    expect(gapOf(100)).toBeGreaterThan(gapOf(24));
  });
});
