import type { GoalTree, ValidationResult, ValidationError, ValidationWarning } from './types.js';

export function validateGoalTree(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'SCHEMA_INVALID', message: 'Input must be an object' }], warnings: [] };
  }

  const raw = input as Record<string, unknown>;

  if (!Array.isArray(raw.goals)) {
    errors.push({ code: 'SCHEMA_INVALID', message: 'goals must be an array', path: 'goals' });
  }
  if (!Array.isArray(raw.goal_types)) {
    errors.push({ code: 'SCHEMA_INVALID', message: 'goal_types must be an array', path: 'goal_types' });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  const tree = raw as unknown as GoalTree;

  // GOALS-013 — goal_types[].level values must be contiguous starting from 0.
  // Per the N+1 rule (decision in vkgeorgia/strategy#66), the level set must
  // be exactly {0, 1, …, N}; a gap breaks the parent→child level invariant
  // and means GOALS-012 cannot be enforced consistently.
  const levels = tree.goal_types
    .map(gt => gt.level)
    .filter(l => typeof l === 'number' && Number.isFinite(l));
  if (levels.length > 0) {
    const unique = Array.from(new Set(levels)).sort((a, b) => a - b);
    const expected = Array.from({ length: unique.length }, (_, i) => i);
    const contiguous = unique.length === expected.length && unique.every((v, i) => v === expected[i]);
    if (!contiguous) {
      errors.push({
        code: 'GOALS-013',
        message: `goal_types[].level values must be contiguous starting from 0; got [${unique.join(', ')}]`,
        path: 'goal_types',
      });
    }
  }

  const maxLevel = Math.max(...tree.goal_types.map(gt => gt.level), 0);
  const typeMap = new Map(tree.goal_types.map(gt => [gt.name, gt.level]));
  const idSet = new Set<number>();
  const levelById = new Map<number, number>();

  for (let i = 0; i < tree.goals.length; i++) {
    const g = tree.goals[i] as unknown;
    const path = `goals[${i}]`;

    if (!g || typeof g !== 'object') {
      errors.push({ code: 'SCHEMA_INVALID', message: 'goal entry must be an object', path });
      continue;
    }
    const goal = g as { id?: unknown; name?: unknown; level?: unknown; type?: unknown };

    if (typeof goal.id !== 'number') {
      errors.push({ code: 'SCHEMA_INVALID', message: 'goal id must be a number', path });
      continue;
    }
    if (!goal.name || typeof goal.name !== 'string' || goal.name.trim() === '') {
      errors.push({ code: 'EMPTY_NAME', message: `Goal ${goal.id} has empty name`, path });
    }

    if (idSet.has(goal.id)) {
      errors.push({ code: 'DUPLICATE_ID', message: `Duplicate goal id: ${goal.id}`, path });
    } else {
      idSet.add(goal.id);
    }

    if (typeof goal.level !== 'number' || !Number.isFinite(goal.level)) {
      errors.push({ code: 'SCHEMA_INVALID', message: `Goal ${goal.id} level must be a finite number`, path });
      continue;
    }
    if (goal.level > maxLevel) {
      errors.push({ code: 'MAX_LEVEL_EXCEEDED', message: `Goal ${goal.id} level ${goal.level} exceeds max ${maxLevel}`, path });
    }
    levelById.set(goal.id, goal.level);

    const expectedLevel = typeof goal.type === 'string' ? typeMap.get(goal.type) : undefined;
    if (expectedLevel !== undefined && expectedLevel !== goal.level) {
      warnings.push({ code: 'TYPE_LEVEL_MISMATCH', message: `Goal ${goal.id} type "${String(goal.type)}" expects level ${expectedLevel}, got ${goal.level}`, path });
    }
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // Check broken parent refs and cycles after all ids are collected
  for (let i = 0; i < tree.goals.length; i++) {
    const g = tree.goals[i];
    const path = `goals[${i}]`;
    if (!g || typeof g !== 'object') continue;
    if (g.parent_id !== 0 && !idSet.has(g.parent_id)) {
      warnings.push({ code: 'BROKEN_PARENT_REF', message: `Goal ${g.id} references missing parent ${g.parent_id} — moved to backlog`, path });
      continue;
    }
    // GOALS-012 — parent must be exactly one level above the child (N+1
    // hierarchy, decision in vkgeorgia/strategy#66). Only enforced when the
    // parent is resolvable; a missing parent is covered by BROKEN_PARENT_REF.
    if (g.parent_id !== 0) {
      const parentLevel = levelById.get(g.parent_id);
      if (parentLevel !== undefined && g.level !== parentLevel + 1) {
        errors.push({
          code: 'GOALS-012',
          message: `Goal ${g.id} (level ${g.level}) must have a parent at level ${g.level - 1}; parent ${g.parent_id} is at level ${parentLevel}`,
          path,
        });
      }
    }
  }

  const cycleError = detectCycle(tree.goals);
  if (cycleError) errors.push(cycleError);

  return { valid: errors.length === 0, errors, warnings };
}

function detectCycle(goals: GoalTree['goals']): ValidationError | null {
  const parentOf = new Map(goals.map(g => [g.id, g.parent_id]));

  for (const g of goals) {
    const visited = new Set<number>();
    let cur: number = g.id;
    while (cur !== 0) {
      if (visited.has(cur)) {
        return { code: 'CYCLE_DETECTED', message: `Cycle detected involving goal ${g.id}` };
      }
      visited.add(cur);
      const parent = parentOf.get(cur);
      if (parent === undefined) break;
      cur = parent;
    }
  }
  return null;
}
