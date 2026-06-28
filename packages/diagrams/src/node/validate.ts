// NODE validator — methodology notations/elements/25-nodes.md §5.
//
// Implements NOD-001, NOD-002. The shared HDR-/LIFECYCLE- rules are
// cross-cutting concerns (CONTRACT.md §8) and out of scope for the
// single-artefact validator.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { isCanonicalIdOfType } from '../typed-id.js';
import { NODE_TYPES } from './types.js';

const REQUIRED_STRING_FIELDS = [
  'name', 'admitted_at', 'admitted_by', 'valid_from',
] as const;

const TYPES: readonly string[] = NODE_TYPES;

export function validateNode(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'NOD-001', message: 'Node must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const a = input as Record<string, unknown>;

  // NOD-001 — id grammar + notation tag + envelope.
  if (!isCanonicalIdOfType(a.id, 'NODE')) {
    errors.push({ code: 'NOD-001', message: `id "${String(a.id)}" must match NODE-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (a.notation !== 'node') {
    errors.push({ code: 'NOD-001', message: 'notation must be the fixed value "node".', path: 'notation' });
  }
  if (a.zone !== undefined && a.zone !== 'canon') {
    errors.push({ code: 'NOD-001', message: 'zone must be "canon" for a NODE.', path: 'zone' });
  } else if (a.zone === undefined) {
    errors.push({ code: 'NOD-001', message: 'zone is required.', path: 'zone' });
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const v = a[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'NOD-001', message: `${field} is required.`, path: field });
    }
  }
  if (a.gate_checks === null || typeof a.gate_checks !== 'object') {
    errors.push({ code: 'NOD-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in a) || !(typeof a.valid_to === 'string' || a.valid_to === null)) {
    errors.push({ code: 'NOD-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }
  if (typeof a.type !== 'string' || a.type.trim() === '') {
    errors.push({ code: 'NOD-001', message: 'type is required.', path: 'type' });
  } else if (!TYPES.includes(a.type)) {
    // NOD-002 — type enum.
    errors.push({ code: 'NOD-002', message: `type "${a.type}" must be one of ${TYPES.join(', ')}.`, path: 'type' });
  }

  return { valid: errors.length === 0, errors, warnings };
}
