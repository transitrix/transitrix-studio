// NEED validator — methodology ELEMENT_PRIMITIVES.md §7.28 / §9.
//
// Codes:
//   NEED-001 — shape / id grammar / required envelope fields, including the
//              required per-type `stakeholder` field.
//   NEED-002 — stakeholder does not resolve to an admitted STAKEHOLDER in canon.
//
// The cross-cutting NEED-COVERAGE-001 / NEED-VALIDATION-COVERAGE-001..002
// reverse-trace rules are owned elsewhere (CONTRACT.md §8, the compliance
// reverse-index) and are out of scope for this single-artefact validator —
// same posture as `validateRequirement` / `validateVerification`.
//
// Resolution (NEED-002 existence) runs only when a `CanonCatalog` is
// supplied; the TYPE check is derivable from the id prefix and runs either way.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { isCanonicalIdOfType, type CanonCatalog } from '../typed-id.js';

export interface NeedValidateOptions {
  /** When provided, NEED-002 enforces artefact existence for `stakeholder`. */
  catalog?: CanonCatalog;
}

export function validateNeed(input: unknown, options: NeedValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'NEED-001', message: 'Need must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const n = input as Record<string, unknown>;

  // NEED-001 — id grammar + notation tag + envelope.
  if (!isCanonicalIdOfType(n.id, 'NEED')) {
    errors.push({ code: 'NEED-001', message: `id "${String(n.id)}" must match NEED-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (n.notation !== 'need') {
    errors.push({ code: 'NEED-001', message: 'notation must be the fixed value "need".', path: 'notation' });
  }
  if (n.zone !== 'canon') {
    errors.push({ code: 'NEED-001', message: 'zone is required and must be "canon".', path: 'zone' });
  }
  for (const f of ['name', 'admitted_at', 'admitted_by', 'valid_from'] as const) {
    if (typeof n[f] !== 'string' || (n[f] as string).trim() === '') {
      errors.push({ code: 'NEED-001', message: `${f} is required.`, path: f });
    }
  }
  if (n.gate_checks === null || typeof n.gate_checks !== 'object') {
    errors.push({ code: 'NEED-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in n) || !(typeof n.valid_to === 'string' || n.valid_to === null)) {
    errors.push({ code: 'NEED-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }

  // stakeholder — required (NEED-001) + resolves to STAKEHOLDER (NEED-002).
  const stakeholder = n.stakeholder;
  if (typeof stakeholder !== 'string' || stakeholder.trim() === '') {
    errors.push({ code: 'NEED-001', message: 'stakeholder is required.', path: 'stakeholder' });
  } else if (!isCanonicalIdOfType(stakeholder, 'STAKEHOLDER')) {
    errors.push({ code: 'NEED-002', message: `stakeholder "${stakeholder}" must be a typed STAKEHOLDER id.`, path: 'stakeholder' });
  } else if (options.catalog && options.catalog.typeOf(stakeholder) === undefined) {
    errors.push({ code: 'NEED-002', message: `stakeholder "${stakeholder}" does not resolve to an admitted artefact.`, path: 'stakeholder' });
  }

  return { valid: errors.length === 0, errors, warnings };
}
