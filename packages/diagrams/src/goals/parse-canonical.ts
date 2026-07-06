/**
 * Canonical-form Goals parser + validator.
 *
 * Accepts the methodology's canonical Goals YAML shape (see
 * `transitrix/methodology` `notations/04-goals.md`):
 *
 * - Flat top-level: `notation`, `id`, `name`, `goal_types[]`, `goals[]`.
 *   No `goals_tree:` wrapper, no `root.goal_id` / `children:` nesting.
 * - Typed string IDs (`GOAL-…`); document id `GOALS-[<middle>-]<INTEGER>`.
 * - Hierarchy via `parent: GOAL-…` on each goal; omit for root.
 * - Per-notation validation codes `GOALS-001 … GOALS-011`.
 *
 * Returns the validation result plus, on success, an internal `GoalTree`
 * built from the canonical input — canonical typed-string IDs are
 * mapped to internal sequential numbers, `parent: GOAL-X` becomes
 * `parent_id: <numeric>`, `parent_id: 0` denotes a root.
 *
 * Strategy hub #63: this lives at the input boundary so the library's
 * internal types (numeric IDs) stay where they are. Convergence on
 * canonical typed-string IDs across all sister modules is a follow-up
 * task.
 */

import type { GoalTree, GoalType, Goal } from './types.js';
import type {
  ValidationError,
  ValidationWarning,
  ValidationResult,
} from '../validation-types.js';

export interface CanonicalGoalsResult extends ValidationResult {
  /** On success, the internal-form GoalTree derived from the canonical input. */
  parsed?: GoalTree;
}

const GOAL_ID_RE = /^GOAL(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const GOALS_DOC_ID_RE = /^GOALS(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;

/** Display id for previews — canonical `GOAL-…` when present, else internal numeric id. */
export function displayGoalId(goal: { id: number; canonical_id?: string }): string {
  return goal.canonical_id ?? String(goal.id);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function parseCanonicalGoals(input: unknown): CanonicalGoalsResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'GOALS-001', message: 'document root is not an object' }],
      warnings,
    };
  }

  const raw = input as Record<string, unknown>;

  if ('notation' in raw && raw['notation'] !== 'goals') {
    return {
      valid: false,
      errors: [
        {
          code: 'GOALS-001',
          message: `notation must be "goals", got "${String(raw['notation'])}"`,
        },
      ],
      warnings,
    };
  }

  // GOALS-002 — document id.
  if (raw['id'] !== undefined) {
    if (!isNonEmptyString(raw['id']) || !GOALS_DOC_ID_RE.test(raw['id'])) {
      errors.push({
        code: 'GOALS-002',
        message: `id "${String(raw['id'])}" must match GOALS-[<middle>-]<INTEGER>`,
      });
    }
  } else {
    errors.push({ code: 'GOALS-002', message: 'document id is required' });
  }

  if (!isNonEmptyString(raw['name'])) {
    errors.push({ code: 'GOALS-003', message: 'name is required' });
  }

  const goalTypesRaw = raw['goal_types'];
  const goalsRaw = raw['goals'];

  if (!Array.isArray(goalTypesRaw) || goalTypesRaw.length === 0) {
    errors.push({ code: 'GOALS-004', message: 'goal_types must be a non-empty array', path: 'goal_types' });
  }
  if (!Array.isArray(goalsRaw) || goalsRaw.length === 0) {
    errors.push({ code: 'GOALS-004', message: 'goals must be a non-empty array', path: 'goals' });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  const gtArr = goalTypesRaw as unknown[];
  const gArr = goalsRaw as unknown[];

  // GOALS-005 — goal_types entries.
  const typeByName = new Map<string, number>();
  const internalGoalTypes: GoalType[] = [];
  for (let i = 0; i < gtArr.length; i++) {
    const el = gtArr[i];
    const path = `goal_types[${i}]`;
    if (!el || typeof el !== 'object') {
      errors.push({ code: 'GOALS-005', message: `${path} must be an object`, path });
      continue;
    }
    const o = el as Record<string, unknown>;
    if (!isNonEmptyString(o['name'])) {
      errors.push({ code: 'GOALS-005', message: `${path}.name is required`, path });
      continue;
    }
    const lvl = o['level'];
    if (typeof lvl !== 'number' || !Number.isInteger(lvl) || lvl < 0) {
      errors.push({ code: 'GOALS-005', message: `${path}.level must be a non-negative integer`, path });
      continue;
    }
    if (typeByName.has(o['name'])) {
      errors.push({ code: 'GOALS-005', message: `${path}: duplicate goal_types name "${o['name']}"`, path });
      continue;
    }
    typeByName.set(o['name'], lvl);
    internalGoalTypes.push({ name: o['name'], level: lvl });
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // GOALS-006 / 007 — goals entries.
  const seenIds = new Set<string>();
  const goalById = new Map<string, Record<string, unknown>>();
  const checkedGoals: Array<{ raw: Record<string, unknown>; path: string }> = [];
  for (let i = 0; i < gArr.length; i++) {
    const el = gArr[i];
    const path = `goals[${i}]`;
    if (!el || typeof el !== 'object') {
      errors.push({ code: 'GOALS-006', message: `${path} must be an object`, path });
      continue;
    }
    const o = el as Record<string, unknown>;
    if (!isNonEmptyString(o['id'])) {
      errors.push({ code: 'GOALS-006', message: `${path}.id is required`, path });
      continue;
    }
    if (!isNonEmptyString(o['name'])) {
      errors.push({ code: 'GOALS-006', message: `${path}.name is required`, path });
    }
    if (!isNonEmptyString(o['type'])) {
      errors.push({ code: 'GOALS-006', message: `${path}.type is required`, path });
    }
    const lvl = o['level'];
    if (typeof lvl !== 'number' || !Number.isInteger(lvl) || lvl < 0) {
      errors.push({ code: 'GOALS-006', message: `${path}.level must be a non-negative integer`, path });
    }
    if (!GOAL_ID_RE.test(o['id'])) {
      errors.push({
        code: 'GOALS-007',
        message: `${path}.id "${o['id']}" must match GOAL-[<middle>-]<INTEGER>`,
        path,
      });
      continue;
    }
    if (seenIds.has(o['id'])) {
      errors.push({ code: 'GOALS-007', message: `${path}: duplicate goal id "${o['id']}"`, path });
      continue;
    }
    seenIds.add(o['id']);
    goalById.set(o['id'], o);
    checkedGoals.push({ raw: o, path });
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // GOALS-008 — type / level consistency.
  for (const { raw: o, path } of checkedGoals) {
    const t = o['type'] as string;
    const lvl = o['level'] as number;
    const expectedLvl = typeByName.get(t);
    if (expectedLvl === undefined) {
      errors.push({
        code: 'GOALS-008',
        message: `${path}.type "${t}" is not defined in goal_types[]`,
        path,
      });
      continue;
    }
    if (expectedLvl !== lvl) {
      errors.push({
        code: 'GOALS-008',
        message: `${path}.level ${lvl} does not match the level (${expectedLvl}) of goal_types entry "${t}"`,
        path,
      });
    }
  }

  // GOALS-009 / 010 — parent references + cycle detection.
  // Assign internal numeric ids (canonical → sequential).
  const idToInternal = new Map<string, number>();
  let counter = 0;
  for (const { raw: o } of checkedGoals) {
    counter += 1;
    idToInternal.set(o['id'] as string, counter);
  }

  // GOALS-009: broken parent ref → warn (per spec, "treated as backlog").
  // GOALS-011: non-root goal without parent → warn.
  for (const { raw: o, path } of checkedGoals) {
    const parent = o['parent'];
    const lvl = o['level'] as number;
    if (parent === undefined || parent === null) {
      if (lvl >= 1) {
        warnings.push({
          code: 'GOALS-011',
          message: `${path}: non-root goal (level ${lvl}) has no parent — orphan / backlog`,
          path,
        });
      }
      continue;
    }
    if (!isNonEmptyString(parent) || !GOAL_ID_RE.test(parent)) {
      errors.push({
        code: 'GOALS-007',
        message: `${path}.parent "${String(parent)}" must match GOAL-[<middle>-]<INTEGER>`,
        path,
      });
      continue;
    }
    if (!goalById.has(parent)) {
      warnings.push({
        code: 'GOALS-009',
        message: `${path}.parent "${parent}" references an undefined goal — treated as orphan / backlog`,
        path,
      });
    }
  }

  // GOALS-010 — cycle detection. Follow each goal's parent chain to a root
  // (parent missing or undefined). If we revisit, that's a cycle.
  for (const { raw: o } of checkedGoals) {
    const startId = o['id'] as string;
    let curId: string | undefined = startId;
    const visited = new Set<string>();
    while (curId) {
      if (visited.has(curId)) {
        errors.push({
          code: 'GOALS-010',
          message: `Cycle detected in parent chain involving goal "${startId}"`,
        });
        break;
      }
      visited.add(curId);
      const cur = goalById.get(curId);
      const p = cur?.['parent'];
      if (!isNonEmptyString(p)) break;
      if (!goalById.has(p)) break;
      curId = p;
    }
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // Build internal GoalTree.
  const internalGoals: Goal[] = checkedGoals.map(({ raw: o }) => {
    const parent = o['parent'];
    const parentId =
      isNonEmptyString(parent) && idToInternal.has(parent) ? idToInternal.get(parent)! : 0;
    return {
      id: idToInternal.get(o['id'] as string)!,
      canonical_id: o['id'] as string,
      name: o['name'] as string,
      type: o['type'] as string,
      level: o['level'] as number,
      parent_id: parentId,
      description: typeof o['description'] === 'string' ? (o['description'] as string) : undefined,
      link: typeof o['link'] === 'string' ? (o['link'] as string) : undefined,
      tag: typeof o['tag'] === 'string' ? (o['tag'] as string) : undefined,
    };
  });

  const parsed: GoalTree = {
    goal_types: internalGoalTypes,
    goals: internalGoals,
  };

  return { valid: true, errors, warnings, parsed };
}
