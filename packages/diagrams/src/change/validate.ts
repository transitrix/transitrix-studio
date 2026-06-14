// CHANGE validator — methodology notations/ELEMENT_PRIMITIVES.md §7.3.
//
// Codes:
//   CHANGE-001 — shape / id grammar / required envelope fields.
//   CHANGE-002 — `goals` entry malformed or wrong TYPE (must be GOAL-…).
//   CHANGE-003 — `parent` malformed, wrong TYPE (must be CHANGE-…), or equals self.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { typeOfId, isCanonicalIdOfType, type CanonCatalog } from '../typed-id.js';

export interface ChangeValidateOptions {
  /** When provided, enforces that each `goals` / `parent` id is admitted. */
  catalog?: CanonCatalog;
}

const REQUIRED_STRING_FIELDS = [
  'name', 'admitted_at', 'admitted_by', 'valid_from',
] as const;

export function validateChange(input: unknown, options: ChangeValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'CHANGE-001', message: 'Change must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const c = input as Record<string, unknown>;

  // CHANGE-001 — id grammar + notation tag + envelope.
  if (!isCanonicalIdOfType(c.id, 'CHANGE')) {
    errors.push({ code: 'CHANGE-001', message: `id "${String(c.id)}" must match CHANGE-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (c.notation !== 'change') {
    errors.push({ code: 'CHANGE-001', message: 'notation must be the fixed value "change".', path: 'notation' });
  }
  if (c.zone !== undefined && c.zone !== 'canon') {
    errors.push({ code: 'CHANGE-001', message: 'zone must be "canon" for a CHANGE.', path: 'zone' });
  } else if (c.zone === undefined) {
    errors.push({ code: 'CHANGE-001', message: 'zone is required.', path: 'zone' });
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const v = c[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'CHANGE-001', message: `${field} is required.`, path: field });
    }
  }
  if (c.gate_checks === null || typeof c.gate_checks !== 'object') {
    errors.push({ code: 'CHANGE-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in c) || !(typeof c.valid_to === 'string' || c.valid_to === null)) {
    errors.push({ code: 'CHANGE-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }

  // CHANGE-002 — `goals` references.
  if (c.goals !== undefined) {
    if (!Array.isArray(c.goals)) {
      errors.push({ code: 'CHANGE-001', message: 'goals must be a list of typed IDs.', path: 'goals' });
    } else {
      c.goals.forEach((ref, i) => {
        const type = typeOfId(ref);
        if (!type) {
          errors.push({ code: 'CHANGE-002', message: `goals[${i}] "${String(ref)}" is not a resolvable typed ID.`, path: `goals[${i}]` });
          return;
        }
        if (type !== 'GOAL') {
          errors.push({ code: 'CHANGE-002', message: `goals[${i}] TYPE "${type}" must be GOAL.`, path: `goals[${i}]` });
          return;
        }
        if (options.catalog && options.catalog.typeOf(ref as string) === undefined) {
          errors.push({ code: 'CHANGE-002', message: `goals[${i}] "${String(ref)}" does not resolve to an admitted artefact.`, path: `goals[${i}]` });
        }
      });
    }
  }

  // CHANGE-003 — `parent` (CHANGE-…; not self).
  if (c.parent !== undefined) {
    const p = c.parent;
    const type = typeOfId(p);
    if (typeof p !== 'string' || !type) {
      errors.push({ code: 'CHANGE-003', message: `parent "${String(p)}" is not a resolvable typed ID.`, path: 'parent' });
    } else if (type !== 'CHANGE') {
      errors.push({ code: 'CHANGE-003', message: `parent TYPE "${type}" must be CHANGE.`, path: 'parent' });
    } else if (typeof c.id === 'string' && p === c.id) {
      errors.push({ code: 'CHANGE-003', message: `parent "${p}" must not equal the element's own id.`, path: 'parent' });
    } else if (options.catalog && options.catalog.typeOf(p) === undefined) {
      errors.push({ code: 'CHANGE-003', message: `parent "${p}" does not resolve to an admitted CHANGE.`, path: 'parent' });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
