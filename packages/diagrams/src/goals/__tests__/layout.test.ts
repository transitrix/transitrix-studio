import { describe, it, expect } from 'vitest';
import { layoutGoalTree } from '../layout.js';
import type { GoalTree } from '../types.js';

const TREE: GoalTree = {
  goal_types: [
    { name: 'Strategy', level: 0 },
    { name: 'Business Goal', level: 1 },
    { name: 'Project', level: 2 },
  ],
  goals: [
    { id: 1, name: 'North Star', type: 'Strategy', level: 0, parent_id: 0 },
    { id: 2, name: 'EU Expansion', type: 'Business Goal', level: 1, parent_id: 1 },
    { id: 3, name: 'Berlin Office', type: 'Project', level: 2, parent_id: 2 },
    { id: 4, name: 'London Office', type: 'Project', level: 2, parent_id: 2 },
  ],
};

describe('layoutGoalTree', () => {
  it('returns nodes for all goals', () => {
    const layout = layoutGoalTree(TREE);
    expect(layout.nodes).toHaveLength(4);
  });

  it('returns edges for parent-child pairs', () => {
    const layout = layoutGoalTree(TREE);
    expect(layout.edges).toHaveLength(3); // 1→2, 2→3, 2→4
  });

  it('levels map to increasing x positions', () => {
    const layout = layoutGoalTree(TREE);
    const byId = new Map(layout.nodes.map(n => [n.id, n]));
    expect(byId.get(1)!.x).toBeLessThan(byId.get(2)!.x);
    expect(byId.get(2)!.x).toBeLessThan(byId.get(3)!.x);
  });

  it('siblings at same level have different y positions', () => {
    const layout = layoutGoalTree(TREE);
    const byId = new Map(layout.nodes.map(n => [n.id, n]));
    expect(byId.get(3)!.y).not.toBe(byId.get(4)!.y);
  });

  it('returns non-zero bounds for non-empty tree', () => {
    const layout = layoutGoalTree(TREE);
    expect(layout.bounds.width).toBeGreaterThan(0);
    expect(layout.bounds.height).toBeGreaterThan(0);
  });

  it('returns empty layout for empty goals', () => {
    const layout = layoutGoalTree({ goal_types: [], goals: [] });
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
  });

  it('nodes have default 250×80 size', () => {
    const layout = layoutGoalTree(TREE);
    expect(layout.nodes[0].width).toBe(250);
    expect(layout.nodes[0].height).toBe(80);
  });

  it('respects custom nodeWidth/nodeHeight', () => {
    const layout = layoutGoalTree(TREE, { nodeWidth: 200, nodeHeight: 60 });
    expect(layout.nodes[0].width).toBe(200);
    expect(layout.nodes[0].height).toBe(60);
  });

  it('each node carries original goal data', () => {
    const layout = layoutGoalTree(TREE);
    const node1 = layout.nodes.find(n => n.id === 1)!;
    expect(node1.data.name).toBe('North Star');
  });

  it('viewDepth hides nodes beyond depth', () => {
    const layout = layoutGoalTree(TREE, { viewDepth: 1 });
    // Level 2 nodes (id 3, 4) should be hidden
    expect(layout.nodes.every(n => n.data.level <= 1)).toBe(true);
  });

  it('compresses non-contiguous levels into adjacent columns (no phantom empty columns)', () => {
    // Legacy / non-canonical input: goal_types skip levels 1 and 3, so
    // goals sit at levels 0, 2, 4. Column x must advance by exactly one
    // step per used level, not per absolute level value — otherwise the
    // skipped levels open empty columns and double the horizontal spacing.
    const gapped: GoalTree = {
      goal_types: [
        { name: 'Strategy', level: 0 },
        { name: 'Strategic Goal', level: 2 },
        { name: 'Project Goal', level: 4 },
      ],
      goals: [
        { id: 1, name: 'Root', type: 'Strategy', level: 0, parent_id: 0 },
        { id: 2, name: 'Mid', type: 'Strategic Goal', level: 2, parent_id: 1 },
        { id: 3, name: 'Leaf', type: 'Project Goal', level: 4, parent_id: 2 },
      ],
    };
    const layout = layoutGoalTree(gapped);
    const byId = new Map(layout.nodes.map(n => [n.id, n]));
    const step = byId.get(2)!.x - byId.get(1)!.x;
    // Root→Mid and Mid→Leaf must use the same single-column step despite
    // the level numbers jumping by 2 each time.
    expect(byId.get(3)!.x - byId.get(2)!.x).toBe(step);
    // And that step is one node width + one rank separator (250 + 80).
    expect(step).toBe(250 + 80);
  });

  // Pre-release blocker regression (orchestrator review 2026-05-21).
  it('[blocker] does not stack-overflow on a self-parent cycle', () => {
    const cyclic: GoalTree = {
      goal_types: [{ name: 'X', level: 0 }],
      goals: [{ id: 1, name: 'self-parent', type: 'X', level: 0, parent_id: 1 }],
    };
    // Without a visited-set inside placeSubtree, this recurses forever.
    expect(() => layoutGoalTree(cyclic)).not.toThrow();
  });

  it('[blocker] does not stack-overflow on a 2-node mutual cycle', () => {
    const cyclic: GoalTree = {
      goal_types: [{ name: 'X', level: 0 }, { name: 'Y', level: 1 }],
      goals: [
        { id: 1, name: 'A', type: 'X', level: 0, parent_id: 2 },
        { id: 2, name: 'B', type: 'Y', level: 1, parent_id: 1 },
      ],
    };
    expect(() => layoutGoalTree(cyclic)).not.toThrow();
  });
});
