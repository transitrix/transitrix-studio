/**
 * Canonical-form FGCA parser + validator.
 *
 * Accepts the methodology's canonical FGCA YAML shape (see
 * `transitrix/methodology` `notations/02-fgca.md`):
 *
 * - Flat top-level arrays, no `fgca:` wrapper.
 * - Typed string IDs per `IDS_AND_REFERENCES.md` (`FACTOR-1`,
 *   `GOAL-RET-1`, `CHANGE-1`, `ACTIVITY-ONBOARD-1`).
 * - Plural canonical-direction cross-references: `goal.factors`,
 *   `change.goals`, `activity.changes`, `activity.goals`.
 * - Per-notation validation codes `FGCA-001 … FGCA-015`.
 *
 * Returns the validation result plus, on success, an internal `FGCADoc`
 * representation built from the canonical input — string IDs are kept
 * as strings; the existing `buildFGCALayout` consumes `id: number`
 * historically but the layout code only uses IDs as opaque keys, so
 * string IDs work fine.
 *
 * Strategy hub #63: this lives at the input boundary so the library's
 * internal types (currently using DSM-API form — numeric IDs and
 * singular cross-refs) can stay where they are. A follow-up task can
 * unify the internal types with the canonical form across all sister
 * modules.
 */

import type {
  ActivityItem,
  BdnChangeWithActivities,
  DriverItem,
  GoalItem,
} from './types.js';
import type { FGCADoc } from './validate.js';
import type {
  ValidationError,
  ValidationWarning,
  ValidationResult,
} from '../validation-types.js';

export interface CanonicalFGCAResult extends ValidationResult {
  /** On success, the internal-form FGCADoc derived from the canonical input. */
  parsed?: FGCADoc;
}

// Canonical ID grammars per IDS_AND_REFERENCES.md §1. The TYPE prefix
// is fixed per layer; middle segments are optional; the terminal is a
// positive integer with no leading zeros.
const FACTOR_ID_RE = /^FACTOR(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const DRIVER_ID_RE = /^DRIVER(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const FACTOR_OR_DRIVER_ID_RE = /^(FACTOR|DRIVER)(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const GOAL_ID_RE = /^GOAL(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const CHANGE_ID_RE = /^CHANGE(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const ACTIVITY_ID_RE = /^ACTIVITY(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const FGCA_DOC_ID_RE = /^(FGCA|DGCA)(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const CONSTRAINT_ID_RE = /^CONSTRAINT(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function asObjectArray(v: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(v)) return null;
  return v.map((el) => (el && typeof el === 'object' ? (el as Record<string, unknown>) : null) as Record<string, unknown>);
}

interface InternalIdMap {
  /** Canonical typed-string ID → internal numeric ID for layout consumption. */
  toInternal: Map<string, number>;
}

/**
 * Validate canonical FGCA YAML and, on success, return an internal-form
 * `FGCADoc` ready for `buildFGCALayout`.
 */
export function parseCanonicalFGCA(input: unknown): CanonicalFGCAResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'FGCA-001', message: 'document root is not an object' }],
      warnings,
    };
  }

  const raw = input as Record<string, unknown>;

  if ('notation' in raw && raw['notation'] !== 'fgca' && raw['notation'] !== 'dgca') {
    return {
      valid: false,
      errors: [
        {
          code: 'FGCA-001',
          message: `notation must be "dgca" (or legacy "fgca"), got "${String(raw['notation'])}"`,
        },
      ],
      warnings,
    };
  }
  if ('notation' in raw && raw['notation'] === 'fgca') {
    warnings.push({ code: 'FGCA-001', message: 'notation "fgca" is deprecated — rename to "dgca"' });
  }

  // FGCA-002 — document id (optional in v1.4 per the canonical spec? — spec
  // says required; absence is FGCA-002).
  if (raw['id'] !== undefined) {
    if (!isNonEmptyString(raw['id']) || !FGCA_DOC_ID_RE.test(raw['id'])) {
      errors.push({
        code: 'FGCA-002',
        message: `id "${String(raw['id'])}" must match FGCA-[<middle>-]<INTEGER>`,
      });
    }
  } else {
    errors.push({ code: 'FGCA-002', message: 'document id is required' });
  }

  if (!isNonEmptyString(raw['name'])) {
    errors.push({ code: 'FGCA-003', message: 'name is required' });
  }

  const factorsRaw = asObjectArray(raw['factors']);
  const goalsRaw = asObjectArray(raw['goals']);
  const changesRaw = asObjectArray(raw['changes']);
  const activitiesRaw = asObjectArray(raw['activities']);

  if (factorsRaw === null) errors.push({ code: 'FGCA-004', message: 'factors must be an array', path: 'factors' });
  if (goalsRaw === null) errors.push({ code: 'FGCA-004', message: 'goals must be an array', path: 'goals' });
  if (changesRaw === null) errors.push({ code: 'FGCA-004', message: 'changes must be an array', path: 'changes' });
  if (activitiesRaw === null) errors.push({ code: 'FGCA-004', message: 'activities must be an array', path: 'activities' });

  if (errors.length > 0) return { valid: false, errors, warnings };

  // From here we know all four arrays exist.
  const factors = factorsRaw!;
  const goals = goalsRaw!;
  const changes = changesRaw!;
  const activities = activitiesRaw!;

  // Per-layer ID maps + duplicate detection. (FGCA-006: unique within a layer.)
  const factorIds = new Set<string>();
  const goalIds = new Set<string>();
  const changeIds = new Set<string>();
  const activityIds = new Set<string>();

  function checkLayerElement(
    el: Record<string, unknown> | null,
    path: string,
    idRe: RegExp,
    seen: Set<string>,
  ): { id: string; name: string } | null {
    if (!el) {
      errors.push({ code: 'FGCA-005', message: `${path} must be an object`, path });
      return null;
    }
    const id = el['id'];
    const name = el['name'];
    if (!isNonEmptyString(id)) {
      errors.push({ code: 'FGCA-005', message: `${path}.id is required`, path });
      return null;
    }
    if (!isNonEmptyString(name)) {
      errors.push({ code: 'FGCA-005', message: `${path}.name is required`, path });
    }
    if (!idRe.test(id)) {
      errors.push({
        code: 'FGCA-007',
        message: `${path}.id "${id}" does not match the canonical grammar for its layer`,
        path,
      });
      return null;
    }
    if (seen.has(id)) {
      errors.push({ code: 'FGCA-006', message: `Duplicate id "${id}"`, path });
    } else {
      seen.add(id);
    }
    return { id, name: isNonEmptyString(name) ? name : '' };
  }

  factors.forEach((el, i) => checkLayerElement(el, `factors[${i}]`, FACTOR_OR_DRIVER_ID_RE, factorIds));
  goals.forEach((el, i) => checkLayerElement(el, `goals[${i}]`, GOAL_ID_RE, goalIds));
  changes.forEach((el, i) => checkLayerElement(el, `changes[${i}]`, CHANGE_ID_RE, changeIds));
  activities.forEach((el, i) => checkLayerElement(el, `activities[${i}]`, ACTIVITY_ID_RE, activityIds));

  if (errors.length > 0) return { valid: false, errors, warnings };

  // Cross-refs.
  function checkRefArray(
    el: Record<string, unknown>,
    field: string,
    targets: Set<string>,
    refRe: RegExp,
    code: string,
    path: string,
  ): string[] {
    const ref = el[field];
    if (ref === undefined || ref === null) return [];
    if (!Array.isArray(ref)) {
      errors.push({ code: 'FGCA-007', message: `${path}.${field} must be an array of IDs`, path });
      return [];
    }
    const out: string[] = [];
    for (const r of ref) {
      if (!isNonEmptyString(r)) {
        errors.push({ code: 'FGCA-007', message: `${path}.${field}[] entries must be non-empty strings`, path });
        continue;
      }
      if (!refRe.test(r)) {
        errors.push({ code: 'FGCA-007', message: `${path}.${field}[] entry "${r}" does not match the expected grammar`, path });
        continue;
      }
      if (!targets.has(r)) {
        errors.push({ code, message: `${path}.${field}[] references undeclared element "${r}"`, path });
        continue;
      }
      out.push(r);
    }
    return out;
  }

  // Build internal id-maps (canonical string ID → internal sequential number).
  const idMap: InternalIdMap = { toInternal: new Map() };
  const allCanonicalIds = [...factorIds, ...goalIds, ...changeIds, ...activityIds];
  allCanonicalIds.forEach((id, i) => idMap.toInternal.set(id, i + 1));

  function intId(canonical: string): number {
    const n = idMap.toInternal.get(canonical);
    if (n === undefined) {
      // Shouldn't happen — we built the map from the same sets.
      throw new Error(`internal: canonical id "${canonical}" not mapped`);
    }
    return n;
  }

  // Layer entries (internal form).
  const internalFactors: DriverItem[] = factors.map((el) => ({
    id: intId(String(el!['id'])),
    name: String(el!['name'] ?? ''),
  }));

  const internalGoals: GoalItem[] = goals.map((el, i) => {
    const refIds = checkRefArray(el!, 'factors', factorIds, FACTOR_OR_DRIVER_ID_RE, 'FGCA-008', `goals[${i}]`);
    return {
      id: intId(String(el!['id'])),
      name: String(el!['name'] ?? ''),
      factor: refIds.map((r) => ({ id: intId(r) })),
    };
  });

  // Build a reverse mapping: which changes does each activity reference (via
  // canonical activity.changes)? Used to populate the internal `change.activity_ids`.
  const activityChangesByCanonicalActivityId = new Map<string, string[]>();
  activities.forEach((el, i) => {
    const refIds = checkRefArray(el!, 'changes', changeIds, CHANGE_ID_RE, 'FGCA-010', `activities[${i}]`);
    activityChangesByCanonicalActivityId.set(String(el!['id']), refIds);
  });

  // For each change, find the activities that reference it.
  const activitiesForChange = new Map<string, string[]>();
  for (const [actId, changeIdsForAct] of activityChangesByCanonicalActivityId.entries()) {
    for (const cid of changeIdsForAct) {
      const arr = activitiesForChange.get(cid) ?? [];
      arr.push(actId);
      activitiesForChange.set(cid, arr);
    }
  }

  const internalChanges: BdnChangeWithActivities[] = changes.map((el, i) => {
    const goalRefs = checkRefArray(el!, 'goals', goalIds, GOAL_ID_RE, 'FGCA-009', `changes[${i}]`);
    // Internal `change.goal_id` is singular; canonical `change.goals` is plural.
    // First goal wins for the singular field; warn (not error) if multiple.
    if (goalRefs.length > 1) {
      warnings.push({
        code: 'FGCA-009',
        message: `changes[${i}].goals lists ${goalRefs.length} goals; the internal layout uses the first one (${goalRefs[0]}). Multi-goal changes are not lossy for the canonical spec — only the layout linearises them.`,
        path: `changes[${i}].goals`,
      });
    }
    const canonicalChangeId = String(el!['id']);
    const linkedActivityIds = activitiesForChange.get(canonicalChangeId) ?? [];
    return {
      id: intId(canonicalChangeId),
      name: String(el!['name'] ?? ''),
      goal_id: goalRefs.length > 0 ? intId(goalRefs[0]) : 0,
      activity_ids: linkedActivityIds.map((aid) => intId(aid)),
    };
  });

  const internalActivities: ActivityItem[] = activities.map((el, i) => {
    const goalRefs = checkRefArray(el!, 'goals', goalIds, GOAL_ID_RE, 'FGCA-011', `activities[${i}]`);
    return {
      id: intId(String(el!['id'])),
      name: String(el!['name'] ?? ''),
      goal_id: goalRefs.length > 0 ? intId(goalRefs[0]) : null,
    };
  });

  // FACTOR.references_constraint grammar check (FGCA-015).
  factors.forEach((el, i) => {
    const rc = el!['references_constraint'];
    if (rc === undefined || rc === null) return;
    if (!Array.isArray(rc)) {
      errors.push({ code: 'FGCA-015', message: `factors[${i}].references_constraint must be an array of IDs`, path: `factors[${i}].references_constraint` });
      return;
    }
    for (const r of rc) {
      if (typeof r !== 'string' || !CONSTRAINT_ID_RE.test(r)) {
        errors.push({
          code: 'FGCA-015',
          message: `factors[${i}].references_constraint[] entry "${String(r)}" must match CONSTRAINT-[<middle>-]<INTEGER>`,
          path: `factors[${i}].references_constraint`,
        });
      }
    }
  });

  if (errors.length > 0) return { valid: false, errors, warnings };

  const parsed: FGCADoc = {
    notation: (raw['notation'] as string) ?? 'dgca',
    spec_version: typeof raw['spec_version'] === 'string' ? (raw['spec_version'] as string) : undefined,
    factors: internalFactors,
    goals: internalGoals,
    changes: internalChanges,
    activities: internalActivities,
  };

  return { valid: true, errors, warnings, parsed };
}

const FGA_DOC_ID_RE = /^(FGA|DGA)(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;

/** On success, the internal-form FGCADoc derived from canonical FGA input. */
export interface CanonicalFGAResult extends ValidationResult {
  parsed?: FGCADoc;
}

/**
 * Canonical-form FGA parser + validator.
 *
 * FGA is the canonical FGCA chain minus the `changes[]` layer — flat
 * top-level `factors[]` + `goals[]` + `activities[]`, with `activity.goals[]`
 * linking activities straight to goals (no intermediate change). It reuses
 * `parseCanonicalFGCA` by injecting an empty `changes` array and remapping
 * the FGCA-NNN codes to the FGA-NNN registry (`notations/03-fga.md`,
 * FGA-001..011). The resulting internal `FGCADoc` carries `activity.goal_id`,
 * which is exactly what the renderer needs to draw goal → activity edges —
 * the field whose absence produced the "FGA nodes render, no edges" bug
 * (transitrix/methodology#65 / vkgeorgia/strategy#65).
 *
 * Lives beside `parseCanonicalFGCA` (rather than inline in the extension) so
 * the canonical FGA path is unit-testable and the library owns the single
 * canon shape — flat form only, no `fga:` wrapper.
 */
export function parseCanonicalFGA(input: unknown): CanonicalFGAResult {
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'FGA-001', message: 'document root is not an object' }], warnings: [] };
  }
  const raw = input as Record<string, unknown>;
  if ('notation' in raw && raw['notation'] !== 'fga' && raw['notation'] !== 'dga') {
    return {
      valid: false,
      errors: [{ code: 'FGA-001', message: `notation must be "dga" (or legacy "fga"), got "${String(raw['notation'])}"` }],
      warnings: [],
    };
  }
  if (raw['id'] === undefined) {
    return { valid: false, errors: [{ code: 'FGA-002', message: 'document id is required' }], warnings: [] };
  }
  if (typeof raw['id'] !== 'string' || !FGA_DOC_ID_RE.test(raw['id'])) {
    return {
      valid: false,
      errors: [{ code: 'FGA-002', message: `id "${String(raw['id'])}" must match FGA-[<middle>-]<INTEGER>` }],
      warnings: [],
    };
  }

  // Forward to the FGCA parser with synthetic FGCA notation + doc id + empty
  // changes. Per-layer / per-ref checks all reuse the FGCA implementation;
  // codes are remapped on the way out. FGCA-009 / 010 / 014 (changes-related)
  // are unreachable here because `changes` is empty.
  const synth = { ...raw, notation: 'dgca', id: 'DGCA-FROM-DGA-1', changes: [] };
  const r = parseCanonicalFGCA(synth);
  const remap: Record<string, string> = {
    'FGCA-001': 'FGA-001',
    'FGCA-002': 'FGA-002',
    'FGCA-003': 'FGA-003',
    'FGCA-004': 'FGA-004',
    'FGCA-005': 'FGA-005',
    'FGCA-006': 'FGA-006',
    'FGCA-007': 'FGA-007',
    'FGCA-008': 'FGA-008',
    'FGCA-011': 'FGA-009',
    'FGCA-012': 'FGA-010',
    'FGCA-015': 'FGA-007',
  };
  const remapCode = (c: string): string => remap[c] ?? c;
  return {
    valid: r.valid,
    errors: r.errors.map((e) => ({ ...e, code: remapCode(e.code) })),
    warnings: r.warnings.map((w) => ({ ...w, code: remapCode(w.code) })),
    parsed: r.parsed,
  };
}
