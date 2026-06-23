import type { DriverItem, GoalItem, BdnChangeWithActivities, ActivityItem } from './types.js';
import type {
  ValidationError,
  ValidationWarning,
  ValidationResult,
} from '../validation-types.js';

// FGCA historically exposed PREFIXED validation type names. Keep them as
// aliases of the shared shape so external consumers (preview, tests) keep
// working without churn.
export type FGCAValidationError = ValidationError;
export type FGCAValidationWarning = ValidationWarning;
export type FGCAValidationResult = ValidationResult;

export interface FGCADoc {
  notation: string;
  spec_version?: string;
  factors: DriverItem[];
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
  if (raw.notation !== 'fgca' && raw.notation !== 'dgca') {
    errors.push({ code: 'WRONG_NOTATION', message: `notation must be "dgca" (or legacy "fgca"), got "${String(raw.notation)}"` });
    return { valid: false, errors, warnings };
  }
  if (raw.notation === 'fgca') {
    warnings.push({ code: 'DEPRECATED_NOTATION', message: 'notation "fgca" is deprecated — rename to "dgca"' });
  }

  if (!Array.isArray(raw.factors)) errors.push({ code: 'SCHEMA_INVALID', message: 'factors must be an array', path: 'factors' });
  if (!Array.isArray(raw.goals)) errors.push({ code: 'SCHEMA_INVALID', message: 'goals must be an array', path: 'goals' });
  if (!Array.isArray(raw.changes)) errors.push({ code: 'SCHEMA_INVALID', message: 'changes must be an array', path: 'changes' });
  if (!Array.isArray(raw.activities)) errors.push({ code: 'SCHEMA_INVALID', message: 'activities must be an array', path: 'activities' });
  if (errors.length > 0) return { valid: false, errors, warnings };

  const doc = raw as unknown as FGCADoc;
  const collectIds = (arr: unknown[]): Set<number | string> => {
    const out = new Set<number | string>();
    for (const el of arr) {
      if (el && typeof el === 'object') {
        const id = (el as { id?: unknown }).id;
        if (typeof id === 'number' || typeof id === 'string') out.add(id);
      }
    }
    return out;
  };
  const factorIds = collectIds(doc.factors as unknown as unknown[]);
  const goalIds = collectIds(doc.goals as unknown as unknown[]);
  const activityIds = collectIds(doc.activities as unknown as unknown[]);

  for (let i = 0; i < doc.factors.length; i++) {
    const f = doc.factors[i] as unknown;
    if (!f || typeof f !== 'object') {
      errors.push({ code: 'SCHEMA_INVALID', message: 'factor entry must be an object', path: `factors[${i}]` });
      continue;
    }
    const factor = f as { id?: unknown; name?: unknown };
    if (typeof factor.id !== 'number' && typeof factor.id !== 'string') errors.push({ code: 'SCHEMA_INVALID', message: 'factor id must be a number or string', path: `factors[${i}]` });
    if (typeof factor.name !== 'string' || !factor.name.trim()) errors.push({ code: 'EMPTY_NAME', message: `Factor ${String(factor.id)} has empty name`, path: `factors[${i}]` });
  }

  for (let i = 0; i < doc.goals.length; i++) {
    const g = doc.goals[i] as unknown;
    if (!g || typeof g !== 'object') {
      errors.push({ code: 'SCHEMA_INVALID', message: 'goal entry must be an object', path: `goals[${i}]` });
      continue;
    }
    const goal = g as { id?: unknown; name?: unknown; factor?: unknown };
    if (typeof goal.id !== 'number' && typeof goal.id !== 'string') errors.push({ code: 'SCHEMA_INVALID', message: 'goal id must be a number or string', path: `goals[${i}]` });
    if (typeof goal.name !== 'string' || !goal.name.trim()) errors.push({ code: 'EMPTY_NAME', message: `Goal ${String(goal.id)} has empty name`, path: `goals[${i}]` });
    const factorRefs = Array.isArray(goal.factor) ? (goal.factor as unknown[]) : [];
    for (const fr of factorRefs) {
      if (!fr || typeof fr !== 'object') continue;
      const fid = (fr as { id?: unknown }).id;
      if ((typeof fid === 'number' || typeof fid === 'string') && !factorIds.has(fid)) {
        warnings.push({ code: 'BROKEN_REF', message: `Goal ${String(goal.id)} references missing factor ${fid}`, path: `goals[${i}].factor` });
      }
    }
  }

  for (let i = 0; i < doc.changes.length; i++) {
    const c = doc.changes[i] as unknown;
    if (!c || typeof c !== 'object') {
      errors.push({ code: 'SCHEMA_INVALID', message: 'change entry must be an object', path: `changes[${i}]` });
      continue;
    }
    const change = c as { id?: unknown; name?: unknown; goal_id?: unknown; activity_ids?: unknown };
    if (typeof change.id !== 'number' && typeof change.id !== 'string') errors.push({ code: 'SCHEMA_INVALID', message: 'change id must be a number or string', path: `changes[${i}]` });
    if (typeof change.name !== 'string' || !change.name.trim()) errors.push({ code: 'EMPTY_NAME', message: `Change ${String(change.id)} has empty name`, path: `changes[${i}]` });
    if ((typeof change.goal_id === 'number' || typeof change.goal_id === 'string') && !goalIds.has(change.goal_id)) {
      warnings.push({ code: 'BROKEN_REF', message: `Change ${String(change.id)} references missing goal ${change.goal_id}`, path: `changes[${i}].goal_id` });
    }
    const aids = Array.isArray(change.activity_ids) ? (change.activity_ids as unknown[]) : [];
    for (const aid of aids) {
      if ((typeof aid === 'number' || typeof aid === 'string') && !activityIds.has(aid)) {
        warnings.push({ code: 'BROKEN_REF', message: `Change ${String(change.id)} references missing activity ${aid}`, path: `changes[${i}].activity_ids` });
      }
    }
  }

  for (let i = 0; i < doc.activities.length; i++) {
    const a = doc.activities[i] as unknown;
    if (!a || typeof a !== 'object') {
      errors.push({ code: 'SCHEMA_INVALID', message: 'activity entry must be an object', path: `activities[${i}]` });
      continue;
    }
    const activity = a as { id?: unknown; name?: unknown };
    if (typeof activity.id !== 'number' && typeof activity.id !== 'string') errors.push({ code: 'SCHEMA_INVALID', message: 'activity id must be a number or string', path: `activities[${i}]` });
    if (typeof activity.name !== 'string' || !activity.name.trim()) errors.push({ code: 'EMPTY_NAME', message: `Activity ${String(activity.id)} has empty name`, path: `activities[${i}]` });
  }

  return { valid: errors.length === 0, errors, warnings };
}
