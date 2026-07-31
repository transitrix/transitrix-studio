// VALIDATION validator — methodology notations/elements/28-validation.md §5.
//
// Implements VALID-001..006. The shared HDR-/LIFECYCLE- rules and the
// cross-cutting NEED-VALIDATION-COVERAGE-001/002 reverse-trace rules are
// owned elsewhere (CONTRACT.md §8) and are out of scope for this
// single-artefact validator — same posture as `validateVerification`
// (../verification/validate.ts), which VALIDATION mirrors one layer upstream
// (anchored on NEED instead of REQUIREMENT).
//
// Resolution rules (VALID-002/005) that need artefact *existence* run only
// when a `CanonCatalog` is supplied; the TYPE check VALID-002 also carries is
// derivable from the id prefix and runs either way.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { typeOfId, isCanonicalIdOfType, type CanonCatalog } from '../typed-id.js';
import { VALIDATION_METHODS, VALIDATION_OUTCOMES } from './types.js';

export interface ValidationValidateOptions {
  /** When provided, the resolution rules enforce artefact existence. */
  catalog?: CanonCatalog;
}

export function validateValidation(input: unknown, options: ValidationValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const { catalog } = options;

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'VALID-001', message: 'Validation must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const v = input as Record<string, unknown>;

  // ── VALID-001 — id grammar + plain required fields ───────────────────────
  if (!isCanonicalIdOfType(v.id, 'VALIDATION')) {
    errors.push({ code: 'VALID-001', message: `id "${String(v.id)}" must match VALIDATION-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (v.notation !== 'validation') {
    errors.push({ code: 'VALID-001', message: 'notation must be the fixed value "validation".', path: 'notation' });
  }
  if (v.zone !== 'canon') {
    errors.push({ code: 'VALID-001', message: 'zone is required and must be "canon".', path: 'zone' });
  }
  for (const f of ['admitted_at', 'admitted_by', 'valid_from', 'protocol'] as const) {
    if (typeof v[f] !== 'string' || (v[f] as string).trim() === '') {
      errors.push({ code: 'VALID-001', message: `${f} is required.`, path: f });
    }
  }
  if (v.gate_checks === null || typeof v.gate_checks !== 'object') {
    errors.push({ code: 'VALID-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in v) || !(typeof v.valid_to === 'string' || v.valid_to === null)) {
    errors.push({ code: 'VALID-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }

  // ── VALID-002 — validates → NEED ─────────────────────────────────────────
  const validates = v.validates;
  if (typeof validates !== 'string' || validates.trim() === '') {
    errors.push({ code: 'VALID-002', message: 'validates is required and must be a typed NEED id.', path: 'validates' });
  } else if (catalog) {
    const t = catalog.typeOf(validates);
    if (t === undefined) {
      errors.push({ code: 'VALID-002', message: `validates "${validates}" does not resolve to an admitted artefact.`, path: 'validates' });
    } else if (t !== 'NEED') {
      errors.push({ code: 'VALID-002', message: `validates "${validates}" resolves to a ${t}, not a NEED.`, path: 'validates' });
    }
  } else if (typeOfId(validates) !== 'NEED') {
    errors.push({ code: 'VALID-002', message: `validates "${validates}" must be a NEED typed id.`, path: 'validates' });
  }

  // ── VALID-003 — method enum ───────────────────────────────────────────────
  const method = v.method;
  if (method === undefined || method === null) {
    errors.push({ code: 'VALID-001', message: 'method is required.', path: 'method' });
  } else if (!VALIDATION_METHODS.includes(method as never)) {
    errors.push({ code: 'VALID-003', message: `method "${String(method)}" must be one of ${VALIDATION_METHODS.join(', ')}.`, path: 'method' });
  }

  // ── VALID-004 — outcome enum ──────────────────────────────────────────────
  const outcome = v.outcome;
  if (outcome === undefined || outcome === null) {
    errors.push({ code: 'VALID-001', message: 'outcome is required.', path: 'outcome' });
  } else if (!VALIDATION_OUTCOMES.includes(outcome as never)) {
    errors.push({ code: 'VALID-004', message: `outcome "${String(outcome)}" must be one of ${VALIDATION_OUTCOMES.join(', ')}.`, path: 'outcome' });
  }

  // ── VALID-005 — canonical_ref evidence resolves ──────────────────────────
  if (v.evidence !== undefined) {
    if (!Array.isArray(v.evidence)) {
      errors.push({ code: 'VALID-001', message: 'evidence must be a list.', path: 'evidence' });
    } else {
      v.evidence.forEach((e, i) => {
        if (e === null || typeof e !== 'object') return;
        const entry = e as Record<string, unknown>;
        if (entry.kind !== 'canonical_ref') return;
        const ref = entry.ref;
        if (!typeOfId(ref)) {
          errors.push({ code: 'VALID-005', message: `evidence[${i}] canonical_ref "${String(ref)}" is not a resolvable typed ID.`, path: `evidence[${i}].ref` });
        } else if (catalog && catalog.typeOf(ref as string) === undefined) {
          errors.push({ code: 'VALID-005', message: `evidence[${i}] canonical_ref "${String(ref)}" does not resolve.`, path: `evidence[${i}].ref` });
        }
      });
    }
  }

  // ── VALID-006 (warning) — pass outcome with no evidence ──────────────────
  const evidenceEmpty = !Array.isArray(v.evidence) || v.evidence.length === 0;
  if (evidenceEmpty && outcome === 'pass') {
    warnings.push({ code: 'VALID-006', message: 'outcome "pass" has no evidence — an undefended positive claim.', path: 'evidence' });
  }

  return { valid: errors.length === 0, errors, warnings };
}
