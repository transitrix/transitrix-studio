// ASSERTION validator — methodology notations/elements/16-assertion.md §5.
//
// Implements ASSERT-001..008. The shared HDR-/LIFECYCLE- rules and the
// cross-cutting ASSERT-DEAD-LINK-001 are owned elsewhere (CONTRACT.md §8) and
// are out of scope for this single-artefact validator.
//
// Resolution rules (ASSERT-002/003/004/005) that need artefact *existence*
// run only when a `CanonCatalog` is supplied; the TYPE checks they also carry
// are derivable from the id prefix and run either way. ASSERT-008 (staleness)
// runs only when `today` is supplied, keeping the validator clock-free.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { typeOfId, isCanonicalIdOfType, type CanonCatalog } from '../typed-id.js';
import { ASSERTION_STATUSES, ASSERTION_SUBJECT_TYPES } from './types.js';

export interface AssertionValidateOptions {
  /** When provided, the resolution rules enforce artefact existence. */
  catalog?: CanonCatalog;
  /** Today as an ISO `YYYY-MM-DD` string; enables the ASSERT-008 staleness check. */
  today?: string;
}

const SUBJECT_TYPES: readonly string[] = ASSERTION_SUBJECT_TYPES;

export function validateAssertion(input: unknown, options: AssertionValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const { catalog, today } = options;

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'ASSERT-001', message: 'Assertion must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const a = input as Record<string, unknown>;

  // ── ASSERT-001 — id grammar + plain required fields ──────────────────────
  if (!isCanonicalIdOfType(a.id, 'ASSERTION')) {
    errors.push({ code: 'ASSERT-001', message: `id "${String(a.id)}" must match ASSERTION-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (a.notation !== 'assertion') {
    errors.push({ code: 'ASSERT-001', message: 'notation must be the fixed value "assertion".', path: 'notation' });
  }
  if (a.zone !== 'canon') {
    errors.push({ code: 'ASSERT-001', message: 'zone is required and must be "canon".', path: 'zone' });
  }
  for (const f of ['admitted_at', 'admitted_by', 'valid_from'] as const) {
    if (typeof a[f] !== 'string' || (a[f] as string).trim() === '') {
      errors.push({ code: 'ASSERT-001', message: `${f} is required.`, path: f });
    }
  }
  if (a.gate_checks === null || typeof a.gate_checks !== 'object') {
    errors.push({ code: 'ASSERT-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in a) || !(typeof a.valid_to === 'string' || a.valid_to === null)) {
    errors.push({ code: 'ASSERT-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }

  // ── ASSERT-002 — about → REQUIREMENT ─────────────────────────────────────
  const about = a.about;
  if (typeof about !== 'string' || about.trim() === '') {
    errors.push({ code: 'ASSERT-002', message: 'about is required and must be a typed REQUIREMENT id.', path: 'about' });
  } else if (catalog) {
    const t = catalog.typeOf(about);
    if (t === undefined) {
      errors.push({ code: 'ASSERT-002', message: `about "${about}" does not resolve to an admitted artefact.`, path: 'about' });
    } else if (t !== 'REQUIREMENT') {
      errors.push({ code: 'ASSERT-002', message: `about "${about}" resolves to a ${t}, not a REQUIREMENT.`, path: 'about' });
    }
  } else if (typeOfId(about) !== 'REQUIREMENT') {
    errors.push({ code: 'ASSERT-002', message: `about "${about}" must be a REQUIREMENT typed id.`, path: 'about' });
  }

  // ── ASSERT-003 — subject ∈ {PRODUCT, PROCESS, CAPABILITY} ────────────────
  const subject = a.subject;
  if (typeof subject !== 'string' || subject.trim() === '') {
    errors.push({ code: 'ASSERT-003', message: 'subject is required and must be a typed PRODUCT/PROCESS/CAPABILITY id.', path: 'subject' });
  } else if (catalog) {
    const t = catalog.typeOf(subject);
    if (t === undefined) {
      errors.push({ code: 'ASSERT-003', message: `subject "${subject}" does not resolve to an admitted artefact.`, path: 'subject' });
    } else if (!SUBJECT_TYPES.includes(t)) {
      errors.push({ code: 'ASSERT-003', message: `subject "${subject}" resolves to a ${t}; must be PRODUCT, PROCESS or CAPABILITY.`, path: 'subject' });
    }
  } else {
    const t = typeOfId(subject);
    if (!t || !SUBJECT_TYPES.includes(t)) {
      errors.push({ code: 'ASSERT-003', message: `subject "${subject}" TYPE must be PRODUCT, PROCESS or CAPABILITY.`, path: 'subject' });
    }
  }

  // ── ASSERT-004 — realised_via resolves ───────────────────────────────────
  if (a.realised_via !== undefined) {
    if (!Array.isArray(a.realised_via)) {
      errors.push({ code: 'ASSERT-001', message: 'realised_via must be a list of typed IDs.', path: 'realised_via' });
    } else {
      a.realised_via.forEach((ref, i) => {
        if (!typeOfId(ref)) {
          errors.push({ code: 'ASSERT-004', message: `realised_via[${i}] "${String(ref)}" is not a resolvable typed ID.`, path: `realised_via[${i}]` });
        } else if (catalog && catalog.typeOf(ref as string) === undefined) {
          errors.push({ code: 'ASSERT-004', message: `realised_via[${i}] "${String(ref)}" does not resolve to an admitted element.`, path: `realised_via[${i}]` });
        }
      });
    }
  }

  // ── ASSERT-005 — canonical_ref evidence resolves ─────────────────────────
  if (a.evidence !== undefined) {
    if (!Array.isArray(a.evidence)) {
      errors.push({ code: 'ASSERT-001', message: 'evidence must be a list.', path: 'evidence' });
    } else {
      a.evidence.forEach((e, i) => {
        if (e === null || typeof e !== 'object') return;
        const entry = e as Record<string, unknown>;
        if (entry.kind !== 'canonical_ref') return;
        const ref = entry.ref;
        if (!typeOfId(ref)) {
          errors.push({ code: 'ASSERT-005', message: `evidence[${i}] canonical_ref "${String(ref)}" is not a resolvable typed ID.`, path: `evidence[${i}].ref` });
        } else if (catalog && catalog.typeOf(ref as string) === undefined) {
          errors.push({ code: 'ASSERT-005', message: `evidence[${i}] canonical_ref "${String(ref)}" does not resolve.`, path: `evidence[${i}].ref` });
        }
      });
    }
  }

  // ── ASSERT-006 / ASSERT-001 — status ─────────────────────────────────────
  const status = a.status;
  if (status === undefined || status === null) {
    errors.push({ code: 'ASSERT-001', message: 'status is required.', path: 'status' });
  } else if (!ASSERTION_STATUSES.includes(status as never)) {
    errors.push({ code: 'ASSERT-006', message: `status "${String(status)}" must be one of ${ASSERTION_STATUSES.join(', ')}.`, path: 'status' });
  }

  // ── ASSERT-007 (warning) — positive status with no evidence ──────────────
  const evidenceEmpty = !Array.isArray(a.evidence) || a.evidence.length === 0;
  if (evidenceEmpty && (status === 'compliant' || status === 'partial')) {
    warnings.push({ code: 'ASSERT-007', message: `status "${status}" has no evidence — a positive status without evidence is undefended.`, path: 'evidence' });
  }

  // ── ASSERT-008 (warning) — stale review (only when `today` is known) ──────
  if (today && typeof a.next_review_at === 'string' && a.next_review_at < today) {
    warnings.push({ code: 'ASSERT-008', message: `next_review_at ${a.next_review_at} is in the past — the assertion is stale and due for re-review.`, path: 'next_review_at' });
  }

  return { valid: errors.length === 0, errors, warnings };
}
