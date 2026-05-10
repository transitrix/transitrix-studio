import { describe, it, expect } from 'vitest';
import { reparent, addChild, deleteWithDescendants, moveToBacklog, restoreFromBacklog } from '../mutations.js';
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
  ],
};

describe('reparent', () => {
  it('moves a goal to a new parent', () => {
    const r = reparent(TREE, 3, 1);
    expect(r.ok).toBe(true);
    const moved = r.result!.goals.find(g => g.id === 3)!;
    expect(moved.parent_id).toBe(1);
    expect(moved.level).toBe(1);
  });

  it('refuses to create a cycle', () => {
    const r = reparent(TREE, 1, 3);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('MUTATION_REFUSED');
  });

  it('refuses self-reparent', () => {
    expect(reparent(TREE, 1, 1).ok).toBe(false);
  });

  it('refuses reparent that would exceed max level', () => {
    const r = reparent(TREE, 1, 3); // would make level 3 which exceeds max 2
    expect(r.ok).toBe(false);
  });

  it('preserves immutability — original tree unchanged', () => {
    reparent(TREE, 3, 1);
    expect(TREE.goals.find(g => g.id === 3)!.parent_id).toBe(2);
  });
});

describe('addChild', () => {
  it('adds a child with auto-assigned id and level', () => {
    const r = addChild(TREE, 2, { name: 'Warsaw Office', type: 'Project', level: 2, parent_id: 2 });
    expect(r.ok).toBe(true);
    const newGoal = r.result!.goals.find(g => g.name === 'Warsaw Office')!;
    expect(newGoal.id).toBeGreaterThan(3);
    expect(newGoal.parent_id).toBe(2);
    expect(newGoal.level).toBe(2);
  });

  it('adds root-level child when parentId is 0', () => {
    const r = addChild(TREE, 0, { name: 'Second Strategy', type: 'Strategy', level: 0, parent_id: 0 });
    expect(r.ok).toBe(true);
    expect(r.result!.goals.find(g => g.name === 'Second Strategy')!.level).toBe(0);
  });

  it('refuses when parent not found', () => {
    const r = addChild(TREE, 99, { name: 'X', type: 'Project', level: 2, parent_id: 99 });
    expect(r.ok).toBe(false);
  });

  it('preserves immutability', () => {
    const before = TREE.goals.length;
    addChild(TREE, 1, { name: 'New', type: 'Business Goal', level: 1, parent_id: 1 });
    expect(TREE.goals.length).toBe(before);
  });
});

describe('deleteWithDescendants', () => {
  it('deletes goal and all descendants', () => {
    const r = deleteWithDescendants(TREE, 2);
    expect(r.ok).toBe(true);
    const ids = r.result!.goals.map(g => g.id);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(3);
    expect(ids).toContain(1);
  });

  it('refuses when goal not found', () => {
    expect(deleteWithDescendants(TREE, 99).ok).toBe(false);
  });

  it('preserves immutability', () => {
    deleteWithDescendants(TREE, 2);
    expect(TREE.goals.length).toBe(3);
  });
});

describe('moveToBacklog', () => {
  it('sets parent_id to 0', () => {
    const r = moveToBacklog(TREE, 3);
    expect(r.ok).toBe(true);
    expect(r.result!.goals.find(g => g.id === 3)!.parent_id).toBe(0);
  });
});

describe('restoreFromBacklog', () => {
  it('reparents the goal to the new parent', () => {
    const backlogged = moveToBacklog(TREE, 3).result!;
    const r = restoreFromBacklog(backlogged, 3, 1);
    expect(r.ok).toBe(true);
    expect(r.result!.goals.find(g => g.id === 3)!.parent_id).toBe(1);
  });
});
