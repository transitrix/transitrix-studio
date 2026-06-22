// FACTOR validator — methodology notations/ELEMENT_PRIMITIVES.md §7.1.
//
// Codes:
//   FACTOR-001 — shape / id grammar / required envelope fields.
//   FACTOR-002 — `type` outside {external, internal}.
//   FACTOR-003 — `category` outside PESTLE vocabulary, or PESTLE applied to a
//                non-external factor (PESTLE applies only to external drivers).
//   FACTOR-004 — `references_constraint` entry malformed or wrong TYPE.
//
// `references_constraint` existence (resolves to an admitted artefact) runs
// only when a `CanonCatalog` is supplied; the prefix-TYPE check runs either way.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { typeOfId, isCanonicalIdOfType, type CanonCatalog } from '../typed-id.js';
import { FACTOR_PESTLE_CATEGORIES } from './types.js';

export interface FactorValidateOptions {
  /** When provided, enforces that each `references_constraint` id is admitted. */
  catalog?: CanonCatalog;
}

const REQUIRED_STRING_FIELDS = [
  'name', 'admitted_at', 'admitted_by', 'valid_from',
] as const;

const PESTLE: readonly string[] = FACTOR_PESTLE_CATEGORIES;

export function validateFactor(input: unknown, options: FactorValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'FACTOR-001', message: 'Factor must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const f = input as Record<string, unknown>;

  // FACTOR-001 — id grammar + notation tag + envelope.
  if (!isCanonicalIdOfType(f.id, 'FACTOR')) {
    errors.push({ code: 'FACTOR-001', message: `id "${String(f.id)}" must match FACTOR-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (f.notation !== 'driver') {
    errors.push({ code: 'FACTOR-001', message: 'notation must be the fixed value "driver".', path: 'notation' });
  }
  if (f.zone !== undefined && f.zone !== 'canon') {
    errors.push({ code: 'FACTOR-001', message: 'zone must be "canon" for a FACTOR.', path: 'zone' });
  } else if (f.zone === undefined) {
    errors.push({ code: 'FACTOR-001', message: 'zone is required.', path: 'zone' });
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const v = f[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'FACTOR-001', message: `${field} is required.`, path: field });
    }
  }
  if (f.gate_checks === null || typeof f.gate_checks !== 'object') {
    errors.push({ code: 'FACTOR-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in f) || !(typeof f.valid_to === 'string' || f.valid_to === null)) {
    errors.push({ code: 'FACTOR-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }

  // FACTOR-002 — type enum (optional field; only check when present).
  if (f.type !== undefined && f.type !== 'external' && f.type !== 'internal') {
    errors.push({ code: 'FACTOR-002', message: `type "${String(f.type)}" must be one of external, internal.`, path: 'type' });
  }

  // FACTOR-003 — category PESTLE vocabulary + external-only constraint.
  if (f.category !== undefined) {
    if (typeof f.category !== 'string' || !PESTLE.includes(f.category)) {
      errors.push({ code: 'FACTOR-003', message: `category "${String(f.category)}" must be one of ${PESTLE.join(', ')}.`, path: 'category' });
    } else if (f.type === 'internal') {
      errors.push({ code: 'FACTOR-003', message: 'category is PESTLE — applies only to external factors; omit on internal factors.', path: 'category' });
    }
  }

  // FACTOR-004 — references_constraint refs.
  if (f.references_constraint !== undefined) {
    if (!Array.isArray(f.references_constraint)) {
      errors.push({ code: 'FACTOR-001', message: 'references_constraint must be a list of typed IDs.', path: 'references_constraint' });
    } else {
      f.references_constraint.forEach((ref, i) => {
        const type = typeOfId(ref);
        if (!type) {
          errors.push({ code: 'FACTOR-004', message: `references_constraint[${i}] "${String(ref)}" is not a resolvable typed ID.`, path: `references_constraint[${i}]` });
          return;
        }
        if (type !== 'CONSTRAINT') {
          errors.push({ code: 'FACTOR-004', message: `references_constraint[${i}] TYPE "${type}" must be CONSTRAINT.`, path: `references_constraint[${i}]` });
          return;
        }
        if (options.catalog && options.catalog.typeOf(ref as string) === undefined) {
          errors.push({ code: 'FACTOR-004', message: `references_constraint[${i}] "${String(ref)}" does not resolve to an admitted artefact.`, path: `references_constraint[${i}]` });
        }
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
