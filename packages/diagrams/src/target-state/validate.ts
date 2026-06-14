// TARGET_STATE validator — methodology notations/ELEMENT_PRIMITIVES.md §7.18.
//
// Codes:
//   TSTATE-001 — shape / id grammar / required envelope fields.
//   TSTATE-002 — composition list entry malformed or wrong TYPE.
//   TSTATE-003 — forbidden inline `goals` field — TARGET_STATE → GOAL
//                satisfaction is a `target_state_satisfies_goal` REL
//                (elements/17-relations.md §3), never inline here.
//
// CAPABILITY ids use the V/H sub-grammar (IDS_AND_REFERENCES.md §2): the
// integer-terminal isCanonicalId would reject them. So the composition entry
// check accepts any id whose TYPE prefix matches; existence is enforced only
// when a `CanonCatalog` is supplied.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { typeOfId, isCanonicalIdOfType, type CanonCatalog } from '../typed-id.js';
import { TARGET_STATE_COMPOSITION_FIELDS } from './types.js';

export interface TargetStateValidateOptions {
  /** When provided, TSTATE-002 enforces that each composition id is admitted. */
  catalog?: CanonCatalog;
}

const REQUIRED_STRING_FIELDS = [
  'name', 'admitted_at', 'admitted_by', 'valid_from',
] as const;

export function validateTargetState(input: unknown, options: TargetStateValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'TSTATE-001', message: 'TargetState must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const t = input as Record<string, unknown>;

  // TSTATE-001 — id grammar + notation tag + envelope.
  if (!isCanonicalIdOfType(t.id, 'TARGET_STATE')) {
    errors.push({ code: 'TSTATE-001', message: `id "${String(t.id)}" must match TARGET_STATE-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (t.notation !== 'target-state') {
    errors.push({ code: 'TSTATE-001', message: 'notation must be the fixed value "target-state".', path: 'notation' });
  }
  if (t.zone !== undefined && t.zone !== 'canon') {
    errors.push({ code: 'TSTATE-001', message: 'zone must be "canon" for a TARGET_STATE.', path: 'zone' });
  } else if (t.zone === undefined) {
    errors.push({ code: 'TSTATE-001', message: 'zone is required.', path: 'zone' });
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const v = t[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'TSTATE-001', message: `${field} is required.`, path: field });
    }
  }
  if (t.gate_checks === null || typeof t.gate_checks !== 'object') {
    errors.push({ code: 'TSTATE-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in t) || !(typeof t.valid_to === 'string' || t.valid_to === null)) {
    errors.push({ code: 'TSTATE-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }

  // TSTATE-002 — composition list TYPE checks.
  for (const [field, expectedType] of Object.entries(TARGET_STATE_COMPOSITION_FIELDS)) {
    const list = t[field];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      errors.push({ code: 'TSTATE-001', message: `${field} must be a list of typed IDs.`, path: field });
      continue;
    }
    list.forEach((ref, i) => {
      const refType = typeOfId(ref);
      if (!refType) {
        errors.push({ code: 'TSTATE-002', message: `${field}[${i}] "${String(ref)}" is not a resolvable typed ID.`, path: `${field}[${i}]` });
        return;
      }
      if (refType !== expectedType) {
        errors.push({ code: 'TSTATE-002', message: `${field}[${i}] TYPE "${refType}" must be ${expectedType}.`, path: `${field}[${i}]` });
        return;
      }
      if (options.catalog && options.catalog.typeOf(ref as string) === undefined) {
        errors.push({ code: 'TSTATE-002', message: `${field}[${i}] "${String(ref)}" does not resolve to an admitted ${expectedType}.`, path: `${field}[${i}]` });
      }
    });
  }

  // TSTATE-003 — `goals` is not an inline field on TARGET_STATE.
  if ('goals' in t) {
    errors.push({
      code: 'TSTATE-003',
      message: 'goals must not be inline on a TARGET_STATE — TARGET_STATE → GOAL satisfaction is a target_state_satisfies_goal REL.',
      path: 'goals',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}
