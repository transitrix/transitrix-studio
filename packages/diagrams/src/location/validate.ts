// LOCATION validator — methodology notations/elements/21-locations.md §6.
//
// Implements LOC-001..003. The shared HDR-/LIFECYCLE- rules are
// cross-cutting concerns (CONTRACT.md §8) and out of scope for the
// single-artefact validator.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { isCanonicalIdOfType, typeOfId } from '../typed-id.js';
import { LOCATION_TYPES } from './types.js';

const REQUIRED_STRING_FIELDS = [
  'name', 'admitted_at', 'admitted_by', 'valid_from',
] as const;

const TYPES: readonly string[] = LOCATION_TYPES;

export function validateLocation(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'LOC-001', message: 'Location must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const a = input as Record<string, unknown>;

  // LOC-001 — id grammar + notation tag + envelope.
  if (!isCanonicalIdOfType(a.id, 'LOCATION')) {
    errors.push({ code: 'LOC-001', message: `id "${String(a.id)}" must match LOCATION-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (a.notation !== 'location') {
    errors.push({ code: 'LOC-001', message: 'notation must be the fixed value "location".', path: 'notation' });
  }
  if (a.zone !== undefined && a.zone !== 'canon') {
    errors.push({ code: 'LOC-001', message: 'zone must be "canon" for a LOCATION.', path: 'zone' });
  } else if (a.zone === undefined) {
    errors.push({ code: 'LOC-001', message: 'zone is required.', path: 'zone' });
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const v = a[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'LOC-001', message: `${field} is required.`, path: field });
    }
  }
  if (a.gate_checks === null || typeof a.gate_checks !== 'object') {
    errors.push({ code: 'LOC-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in a) || !(typeof a.valid_to === 'string' || a.valid_to === null)) {
    errors.push({ code: 'LOC-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }
  if (typeof a.type !== 'string' || a.type.trim() === '') {
    errors.push({ code: 'LOC-001', message: 'type is required.', path: 'type' });
  } else if (!TYPES.includes(a.type)) {
    // LOC-002 — type enum.
    errors.push({ code: 'LOC-002', message: `type "${a.type}" must be one of ${TYPES.join(', ')}.`, path: 'type' });
  }

  // LOC-003 — parent must resolve to a LOCATION when present.
  if ('parent' in a && a.parent !== undefined && a.parent !== null) {
    if (typeof a.parent !== 'string' || !isCanonicalIdOfType(a.parent, 'LOCATION')) {
      errors.push({
        code: 'LOC-003',
        message: `parent "${String(a.parent)}" must be a canonical LOCATION-… id.`,
        path: 'parent',
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
