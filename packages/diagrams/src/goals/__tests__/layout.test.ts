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
