// VERIFICATION validator — methodology notations/elements/27-verification.md §5.
//
// Implements VERIF-001..006. The shared HDR-/LIFECYCLE- rules and the
// cross-cutting REQ-VERIF-COVERAGE-001/002 reverse-trace rules are owned
// elsewhere (CONTRACT.md §8) and are out of scope for this single-artefact
// validator — same posture as `validateAssertion` (../assertion/validate.ts).
//
// Resolution rules (VERIF-002/005) that need artefact *existence* run only
// when a `CanonCatalog` is supplied; the TYPE check VERIF-002 also carries is
// derivable from the id prefix and runs either way.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { typeOfId, isCanonicalIdOfType, type CanonCatalog } from '../typed-id.js';
import { VERIFICATION_METHODS, VERIFICATION_OUTCOMES } from './types.js';

export interface VerificationValidateOptions {
  /** When provided, the resolution rules enforce artefact existence. */
  catalog?: CanonCatalog;
}

export function validateVerification(input: unknown, options: VerificationValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const { catalog } = options;

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'VERIF-001', message: 'Verification must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const v = input as Record<string, unknown>;

  // ── VERIF-001 — id grammar + plain required fields ───────────────────────
  if (!isCanonicalIdOfType(v.id, 'VERIFICATION')) {
    errors.push({ code: 'VERIF-001', message: `id "${String(v.id)}" must match VERIFICATION-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (v.notation !== 'verification') {
    errors.push({ code: 'VERIF-001', message: 'notation must be the fixed value "verification".', path: 'notation' });
  }
  if (v.zone !== 'canon') {
    errors.push({ code: 'VERIF-001', message: 'zone is required and must be "canon".', path: 'zone' });
  }
  for (const f of ['admitted_at', 'admitted_by', 'valid_from', 'protocol'] as const) {
    if (typeof v[f] !== 'string' || (v[f] as string).trim() === '') {
      errors.push({ code: 'VERIF-001', message: `${f} is required.`, path: f });
    }
  }
  if (v.gate_checks === null || typeof v.gate_checks !== 'object') {
    errors.push({ code: 'VERIF-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in v) || !(typeof v.valid_to === 'string' || v.valid_to === null)) {
    errors.push({ code: 'VERIF-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }

  // ── VERIF-002 — verifies → REQUIREMENT ───────────────────────────────────
  const verifies = v.verifies;
  if (typeof verifies !== 'string' || verifies.trim() === '') {
    errors.push({ code: 'VERIF-002', message: 'verifies is required and must be a typed REQUIREMENT id.', path: 'verifies' });
  } else if (catalog) {
    const t = catalog.typeOf(verifies);
    if (t === undefined) {
      errors.push({ code: 'VERIF-002', message: `verifies "${verifies}" does not resolve to an admitted artefact.`, path: 'verifies' });
    } else if (t !== 'REQUIREMENT') {
      errors.push({ code: 'VERIF-002', message: `verifies "${verifies}" resolves to a ${t}, not a REQUIREMENT.`, path: 'verifies' });
    }
  } else if (typeOfId(verifies) !== 'REQUIREMENT') {
    errors.push({ code: 'VERIF-002', message: `verifies "${verifies}" must be a REQUIREMENT typed id.`, path: 'verifies' });
  }

  // ── VERIF-003 — method enum ───────────────────────────────────────────────
  const method = v.method;
  if (method === undefined || method === null) {
    errors.push({ code: 'VERIF-001', message: 'method is required.', path: 'method' });
  } else if (!VERIFICATION_METHODS.includes(method as never)) {
    errors.push({ code: 'VERIF-003', message: `method "${String(method)}" must be one of ${VERIFICATION_METHODS.join(', ')}.`, path: 'method' });
  }

  // ── VERIF-004 — outcome enum ──────────────────────────────────────────────
  const outcome = v.outcome;
  if (outcome === undefined || outcome === null) {
    errors.push({ code: 'VERIF-001', message: 'outcome is required.', path: 'outcome' });
  } else if (!VERIFICATION_OUTCOMES.includes(outcome as never)) {
    errors.push({ code: 'VERIF-004', message: `outcome "${String(outcome)}" must be one of ${VERIFICATION_OUTCOMES.join(', ')}.`, path: 'outcome' });
  }

  // ── VERIF-005 — canonical_ref evidence resolves ──────────────────────────
  if (v.evidence !== undefined) {
    if (!Array.isArray(v.evidence)) {
      errors.push({ code: 'VERIF-001', message: 'evidence must be a list.', path: 'evidence' });
    } else {
      v.evidence.forEach((e, i) => {
        if (e === null || typeof e !== 'object') return;
        const entry = e as Record<string, unknown>;
        if (entry.kind !== 'canonical_ref') return;
        const ref = entry.ref;
        if (!typeOfId(ref)) {
          errors.push({ code: 'VERIF-005', message: `evidence[${i}] canonical_ref "${String(ref)}" is not a resolvable typed ID.`, path: `evidence[${i}].ref` });
        } else if (catalog && catalog.typeOf(ref as string) === undefined) {
          errors.push({ code: 'VERIF-005', message: `evidence[${i}] canonical_ref "${String(ref)}" does not resolve.`, path: `evidence[${i}].ref` });
        }
      });
    }
  }

  // ── VERIF-006 (warning) — pass outcome with no evidence ──────────────────
  const evidenceEmpty = !Array.isArray(v.evidence) || v.evidence.length === 0;
  if (evidenceEmpty && outcome === 'pass') {
    warnings.push({ code: 'VERIF-006', message: 'outcome "pass" has no evidence — an undefended positive claim.', path: 'evidence' });
  }

  return { valid: errors.length === 0, errors, warnings };
}
