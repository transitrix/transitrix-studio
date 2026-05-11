import type { FactorItem, GoalItem, BdnChangeWithActivities, ActivityItem } from './types.js';

export interface FGCAValidationError {
  code: string;
  message: string;
  path?: string;
}

export interface FGCAValidationWarning {
  code: string;
  message: string;
  path?: string;
}

export interface FGCAValidationResult {
  valid: boolean;
  errors: FGCAValidationError[];
  warnings: FGCAValidationWarning[];
}

export interface FGCADoc {
  notation: string;
  spec_version?: string;
  factors: FactorItem[];
  goals: GoalItem[];
  changes: BdnChangeWithActivities[];
  activities: ActivityItem[];
}

export function validateFGCADoc(input: unknown): FGCAValidationResult {
  const errors: FGCAValidationError[] = [];
  const warnings: FGCAValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'SCHEMA_INVALID', message: 'Input must be an object' }], warnings: [] };
  }

  const raw = input as Record<string, unknown>;

  if (raw.notation === undefined) {
    errors.push({ code: 'MISSING_NOTATION', message: 'notation field is required' });
    return { valid: false, errors, warnings };
  }
  if (raw.notation !== 'fgca') {
    errors.push({ code: 'WRONG_NOTATION', message: `notation must be "fgca", got "${String(raw.notation)}"` });
    return { valid: false, errors, warnings };
  }

  if (!Array.isArray(raw.factors)) errors.push({ code: 'SCHEMA_INVALID', message: 'factors must be an array', path: 'factors' });
  if (!Array.isArray(raw.goals)) errors.push({ code: 'SCHEMA_INVALID', message: 'goals must be an array', path: 'goals' });
  if (!Array.isArray(raw.changes)) errors.push({ code: 'SCHEMA_INVALID', message: 'changes must be an array', path: 'changes' });
  if (!Array.isArray(raw.activities)) errors.push({ code: 'SCHEMA_INVALID', message: 'activities must be an array', path: 'activities' });
  if (errors.length > 0) return { valid: false, errors, warnings };

  const doc = raw as unknown as FGCADoc;
  const factorIds = new Set(doc.factors.map(f => f.id));
  const goalIds = new Set(doc.goals.map(g => g.id));
  const activityIds = new Set(doc.activities.map(a => a.id));

  for (let i = 0; i < doc.factors.length; i++) {
    const f = doc.factors[i];
    if (typeof f.id !== 'number') errors.push({ code: 'SCHEMA_INVALID', message: 'factor id must be a number', path: `factors[${i}]` });
    if (!f.name?.trim()) errors.push({ code: 'EMPTY_NAME', message: `Factor ${f.id} has empty name`, path: `factors[${i}]` });
  }

  for (let i = 0; i < doc.goals.length; i++) {
    const g = doc.goals[i];
    if (typeof g.id !== 'number') errors.push({ code: 'SCHEMA_INVALID', message: 'goal id must be a number', path: `goals[${i}]` });
    if (!g.name?.trim()) errors.push({ code: 'EMPTY_NAME', message: `Goal ${g.id} has empty name`, path: `goals[${i}]` });
    for (const f of (g.factor ?? [])) {
      if (!factorIds.has(f.id)) {
        warnings.push({ code: 'BROKEN_REF', message: `Goal ${g.id} references missing factor ${f.id}`, path: `goals[${i}].factor` });
      }
    }
  }

  for (let i = 0; i < doc.changes.length; i++) {
    const c = doc.changes[i];
    if (typeof c.id !== 'number') errors.push({ code: 'SCHEMA_INVALID', message: 'change id must be a number', path: `changes[${i}]` });
    if (!c.name?.trim()) errors.push({ code: 'EMPTY_NAME', message: `Change ${c.id} has empty name`, path: `changes[${i}]` });
    if (!goalIds.has(c.goal_id)) {
      warnings.push({ code: 'BROKEN_REF', message: `Change ${c.id} references missing goal ${c.goal_id}`, path: `changes[${i}].goal_id` });
    }
    for (const aid of (c.activity_ids ?? [])) {
      if (!activityIds.has(aid)) {
        warnings.push({ code: 'BROKEN_REF', message: `Change ${c.id} references missing activity ${aid}`, path: `changes[${i}].activity_ids` });
      }
    }
  }

  for (let i = 0; i < doc.activities.length; i++) {
    const a = doc.activities[i];
    if (typeof a.id !== 'number') errors.push({ code: 'SCHEMA_INVALID', message: 'activity id must be a number', path: `activities[${i}]` });
    if (!a.name?.trim()) errors.push({ code: 'EMPTY_NAME', message: `Activity ${a.id} has empty name`, path: `activities[${i}]` });
  }

  return { valid: errors.length === 0, errors, warnings };
}
