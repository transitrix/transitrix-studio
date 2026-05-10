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
  const maxLevel = Math.max(...tree.goal_types.map(gt => gt.level), 0);
  const typeMap = new Map(tree.goal_types.map(gt => [gt.name, gt.level]));
  const idSet = new Set<number>();

  for (let i = 0; i < tree.goals.length; i++) {
    const g = tree.goals[i];
    const path = `goals[${i}]`;

    if (typeof g.id !== 'number') {
      errors.push({ code: 'SCHEMA_INVALID', message: 'goal id must be a number', path });
      continue;
    }
    if (!g.name || typeof g.name !== 'string' || g.name.trim() === '') {
      errors.push({ code: 'EMPTY_NAME', message: `Goal ${g.id} has empty name`, path });
    }

    if (idSet.has(g.id)) {
      errors.push({ code: 'DUPLICATE_ID', message: `Duplicate goal id: ${g.id}`, path });
    } else {
      idSet.add(g.id);
    }

    if (g.level > maxLevel) {
      errors.push({ code: 'MAX_LEVEL_EXCEEDED', message: `Goal ${g.id} level ${g.level} exceeds max ${maxLevel}`, path });
    }

    const expectedLevel = typeMap.get(g.type);
    if (expectedLevel !== undefined && expectedLevel !== g.level) {
      warnings.push({ code: 'TYPE_LEVEL_MISMATCH', message: `Goal ${g.id} type "${g.type}" expects level ${expectedLevel}, got ${g.level}`, path });
    }
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // Check broken parent refs and cycles after all ids are collected
  for (let i = 0; i < tree.goals.length; i++) {
    const g = tree.goals[i];
    const path = `goals[${i}]`;
    if (g.parent_id !== 0 && !idSet.has(g.parent_id)) {
      warnings.push({ code: 'BROKEN_PARENT_REF', message: `Goal ${g.id} references missing parent ${g.parent_id} — moved to backlog`, path });
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
