// BUSINESS_SERVICE validator — methodology notations/elements/25-business-services.md §5.
//
// Implements BSV-001..004. The shared HDR-/LIFECYCLE- rules are
// cross-cutting concerns (CONTRACT.md §8) and out of scope for the
// single-artefact validator.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { isCanonicalIdOfType, typeOfId } from '../typed-id.js';
import { BUSINESS_SERVICE_TYPES } from './types.js';

const REQUIRED_STRING_FIELDS = [
  'name', 'admitted_at', 'admitted_by', 'valid_from',
] as const;

const TYPES: readonly string[] = BUSINESS_SERVICE_TYPES;

export function validateBusinessService(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'BSV-001', message: 'Business service must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const a = input as Record<string, unknown>;

  // BSV-001 — id grammar + notation tag + envelope.
  if (!isCanonicalIdOfType(a.id, 'BUSINESS_SERVICE')) {
    errors.push({ code: 'BSV-001', message: `id "${String(a.id)}" must match BUSINESS_SERVICE-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (a.notation !== 'business-service') {
    errors.push({ code: 'BSV-001', message: 'notation must be the fixed value "business-service".', path: 'notation' });
  }
  if (a.zone !== undefined && a.zone !== 'canon') {
    errors.push({ code: 'BSV-001', message: 'zone must be "canon" for a BUSINESS_SERVICE.', path: 'zone' });
  } else if (a.zone === undefined) {
    errors.push({ code: 'BSV-001', message: 'zone is required.', path: 'zone' });
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const v = a[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'BSV-001', message: `${field} is required.`, path: field });
    }
  }
  if (a.gate_checks === null || typeof a.gate_checks !== 'object') {
    errors.push({ code: 'BSV-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in a) || !(typeof a.valid_to === 'string' || a.valid_to === null)) {
    errors.push({ code: 'BSV-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }
  if (typeof a.type !== 'string' || a.type.trim() === '') {
    errors.push({ code: 'BSV-001', message: 'type is required.', path: 'type' });
  } else if (!TYPES.includes(a.type)) {
    // BSV-002 — type enum.
    errors.push({ code: 'BSV-002', message: `type "${a.type}" must be one of ${TYPES.join(', ')}.`, path: 'type' });
  }

  // BSV-003 — offering_unit must resolve to ACTOR(business_unit) or ROLE when present.
  if ('offering_unit' in a && a.offering_unit !== undefined && a.offering_unit !== null) {
    const t = typeOfId(a.offering_unit);
    if (t !== 'ACTOR' && t !== 'ROLE') {
      errors.push({
        code: 'BSV-003',
        message: `offering_unit "${String(a.offering_unit)}" must be an ACTOR-… or ROLE-… canonical id.`,
        path: 'offering_unit',
      });
    }
  }

  // BSV-004 — capability must resolve to CAPABILITY when present.
  if ('capability' in a && a.capability !== undefined && a.capability !== null) {
    if (typeOfId(a.capability) !== 'CAPABILITY') {
      errors.push({
        code: 'BSV-004',
        message: `capability "${String(a.capability)}" must be a CAPABILITY-… canonical id.`,
        path: 'capability',
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
