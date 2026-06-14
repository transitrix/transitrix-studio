// ACTOR validator — methodology notations/elements/19-actors.md §5.
//
// Implements ACTOR-001..003. The shared HDR-/LIFECYCLE- rules are
// cross-cutting concerns (CONTRACT.md §8) and out of scope for the
// single-artefact validator.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { isCanonicalIdOfType } from '../typed-id.js';
import { ACTOR_TYPES, ACTOR_FORBIDDEN_INLINE_FIELDS } from './types.js';

const REQUIRED_STRING_FIELDS = [
  'name', 'admitted_at', 'admitted_by', 'valid_from',
] as const;

const TYPES: readonly string[] = ACTOR_TYPES;

export function validateActor(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'ACTOR-001', message: 'Actor must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const a = input as Record<string, unknown>;

  // ACTOR-001 — id grammar + notation tag + envelope.
  if (!isCanonicalIdOfType(a.id, 'ACTOR')) {
    errors.push({ code: 'ACTOR-001', message: `id "${String(a.id)}" must match ACTOR-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (a.notation !== 'actor') {
    errors.push({ code: 'ACTOR-001', message: 'notation must be the fixed value "actor".', path: 'notation' });
  }
  if (a.zone !== undefined && a.zone !== 'canon') {
    errors.push({ code: 'ACTOR-001', message: 'zone must be "canon" for an ACTOR.', path: 'zone' });
  } else if (a.zone === undefined) {
    errors.push({ code: 'ACTOR-001', message: 'zone is required.', path: 'zone' });
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const v = a[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'ACTOR-001', message: `${field} is required.`, path: field });
    }
  }
  if (a.gate_checks === null || typeof a.gate_checks !== 'object') {
    errors.push({ code: 'ACTOR-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in a) || !(typeof a.valid_to === 'string' || a.valid_to === null)) {
    errors.push({ code: 'ACTOR-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }
  if (typeof a.type !== 'string' || a.type.trim() === '') {
    errors.push({ code: 'ACTOR-001', message: 'type is required.', path: 'type' });
  } else if (!TYPES.includes(a.type)) {
    // ACTOR-002 — type enum.
    errors.push({ code: 'ACTOR-002', message: `type "${a.type}" must be one of ${TYPES.join(', ')}.`, path: 'type' });
  }

  // ACTOR-003 — engagement / hierarchy fields belong on REL records, not here.
  for (const field of ACTOR_FORBIDDEN_INLINE_FIELDS) {
    if (field in a) {
      errors.push({
        code: 'ACTOR-003',
        message: `${field} is engagement/hierarchy data — it must live in a REL-… record, not inline on the actor.`,
        path: field,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
