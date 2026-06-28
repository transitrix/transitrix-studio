// TECHNOLOGY_SERVICE validator — methodology notations/elements/26-technology-services.md §5.
//
// Implements TSVC-001, TSVC-002, TSVC-003. The shared HDR-/LIFECYCLE- rules are
// cross-cutting concerns (CONTRACT.md §8) and out of scope for the
// single-artefact validator. TSVC-003 (node resolves to admitted NODE) is also
// enforced at repo scope in validate-repo.ts checkLayerSemantics.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { isCanonicalIdOfType } from '../typed-id.js';
import { TECHNOLOGY_SERVICE_TYPES } from './types.js';

const REQUIRED_STRING_FIELDS = [
  'name', 'admitted_at', 'admitted_by', 'valid_from',
] as const;

const TYPES: readonly string[] = TECHNOLOGY_SERVICE_TYPES;

export function validateTechnologyService(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'TSVC-001', message: 'Technology service must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const a = input as Record<string, unknown>;

  // TSVC-001 — id grammar + notation tag + envelope.
  if (!isCanonicalIdOfType(a.id, 'TECHNOLOGY_SERVICE')) {
    errors.push({ code: 'TSVC-001', message: `id "${String(a.id)}" must match TECHNOLOGY_SERVICE-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (a.notation !== 'technology-service') {
    errors.push({ code: 'TSVC-001', message: 'notation must be the fixed value "technology-service".', path: 'notation' });
  }
  if (a.zone !== undefined && a.zone !== 'canon') {
    errors.push({ code: 'TSVC-001', message: 'zone must be "canon" for a TECHNOLOGY_SERVICE.', path: 'zone' });
  } else if (a.zone === undefined) {
    errors.push({ code: 'TSVC-001', message: 'zone is required.', path: 'zone' });
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const v = a[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'TSVC-001', message: `${field} is required.`, path: field });
    }
  }
  if (a.gate_checks === null || typeof a.gate_checks !== 'object') {
    errors.push({ code: 'TSVC-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in a) || !(typeof a.valid_to === 'string' || a.valid_to === null)) {
    errors.push({ code: 'TSVC-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }
  if (typeof a.type !== 'string' || a.type.trim() === '') {
    errors.push({ code: 'TSVC-001', message: 'type is required.', path: 'type' });
  } else if (!TYPES.includes(a.type)) {
    // TSVC-002 — type enum.
    errors.push({ code: 'TSVC-002', message: `type "${a.type}" must be one of ${TYPES.join(', ')}.`, path: 'type' });
  }

  // TSVC-003 — node must be a NODE-… id when present.
  if ('node' in a && a.node !== undefined && a.node !== null) {
    if (typeof a.node !== 'string' || !isCanonicalIdOfType(a.node, 'NODE')) {
      errors.push({
        code: 'TSVC-003',
        message: `node "${String(a.node)}" must be a canonical NODE-… id.`,
        path: 'node',
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
