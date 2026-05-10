import type { GoalTree, Goal, MutationResult, ValidationError } from './types.js';
import { validateGoalTree } from './validate.js';

function cloneTree(tree: GoalTree): GoalTree {
  return {
    goal_types: tree.goal_types.map(gt => ({ ...gt })),
    goals: tree.goals.map(g => ({ ...g, factors: g.factors ? g.factors.map(f => ({ ...f })) : undefined })),
  };
}

function nextId(tree: GoalTree): number {
  return Math.max(0, ...tree.goals.map(g => g.id)) + 1;
}

function getLevel(tree: GoalTree, goalId: number): number {
  const goal = tree.goals.find(g => g.id === goalId);
  return goal?.level ?? 0;
}

function getTypeForLevel(tree: GoalTree, level: number): string {
  const gt = tree.goal_types.find(t => t.level === level);
  return gt?.name ?? '';
}

function updateDescendantLevels(goals: Goal[], id: number, levelDelta: number): void {
  for (const g of goals) {
    if (g.parent_id === id) {
      g.level += levelDelta;
      g.type = '';
      updateDescendantLevels(goals, g.id, levelDelta);
    }
  }
}

function hasPathTo(goals: Goal[], fromId: number, targetId: number): boolean {
  const visited = new Set<number>();
  const stack = [fromId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === targetId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const g of goals) {
      if (g.parent_id === cur) stack.push(g.id);
    }
  }
  return false;
}

function refusalError(message: string): MutationResult<GoalTree> {
  const err: ValidationError = { code: 'MUTATION_REFUSED', message };
  return { ok: false, error: err };
}

export function reparent(tree: GoalTree, sourceId: number, targetId: number): MutationResult<GoalTree> {
  const clone = cloneTree(tree);
  const source = clone.goals.find(g => g.id === sourceId);
  const target = clone.goals.find(g => g.id === targetId);

  if (!source) return refusalError(`Goal ${sourceId} not found`);
  if (!target) return refusalError(`Target goal ${targetId} not found`);
  if (sourceId === targetId) return refusalError('Cannot reparent to self');
  if (hasPathTo(clone.goals, sourceId, targetId)) return refusalError('Cannot reparent: would create cycle');

  const maxLevel = Math.max(...clone.goal_types.map(gt => gt.level), 0);
  const newLevel = target.level + 1;
  if (newLevel > maxLevel) return refusalError(`Reparent would exceed max level ${maxLevel}`);

  const levelDelta = newLevel - source.level;
  source.parent_id = targetId;
  source.level = newLevel;
  source.type = getTypeForLevel(clone, newLevel);
  if (levelDelta !== 0) updateDescendantLevels(clone.goals, sourceId, levelDelta);

  const v = validateGoalTree(clone);
  if (!v.valid) return refusalError(v.errors[0]?.message ?? 'Validation failed after reparent');
  return { ok: true, result: clone };
}

export function addChild(tree: GoalTree, parentId: number, newGoal: Omit<Goal, 'id'>): MutationResult<GoalTree> {
  const clone = cloneTree(tree);
  const parent = parentId === 0 ? null : clone.goals.find(g => g.id === parentId);

  if (parentId !== 0 && !parent) return refusalError(`Parent goal ${parentId} not found`);

  const maxLevel = Math.max(...clone.goal_types.map(gt => gt.level), 0);
  const expectedLevel = parent ? parent.level + 1 : 0;
  if (expectedLevel > maxLevel) return refusalError(`New child would exceed max level ${maxLevel}`);

  const id = nextId(clone);
  clone.goals.push({ ...newGoal, id, parent_id: parentId, level: expectedLevel, type: getTypeForLevel(clone, expectedLevel) || newGoal.type });

  return { ok: true, result: clone };
}

export function deleteWithDescendants(tree: GoalTree, id: number): MutationResult<GoalTree> {
  const clone = cloneTree(tree);
  if (!clone.goals.find(g => g.id === id)) return refusalError(`Goal ${id} not found`);

  const toDelete = new Set<number>();
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    toDelete.add(cur);
    for (const g of clone.goals) {
      if (g.parent_id === cur) stack.push(g.id);
    }
  }
  clone.goals = clone.goals.filter(g => !toDelete.has(g.id));
  return { ok: true, result: clone };
}

export function moveToBacklog(tree: GoalTree, id: number): MutationResult<GoalTree> {
  const clone = cloneTree(tree);
  const goal = clone.goals.find(g => g.id === id);
  if (!goal) return refusalError(`Goal ${id} not found`);
  goal.parent_id = 0;
  return { ok: true, result: clone };
}

export function restoreFromBacklog(tree: GoalTree, id: number, newParentId: number): MutationResult<GoalTree> {
  return reparent(tree, id, newParentId);
}
