// REQUIREMENT validator — methodology notations/elements/15-requirement.md §4.
//
// Implements REQ-001..003. The shared HDR-/LIFECYCLE-/REQ-COVERAGE rules are
// cross-cutting concerns owned elsewhere (CONTRACT.md §8) and are out of scope
// for this single-artefact validator.
//
// REQ-002/003 resolve `derived_from` against the codex zone. Resolution that
// needs artefact *existence* (REQ-002) only runs when a `CanonCatalog` is
// supplied; the TYPE check (REQ-003) is derivable from the id prefix and runs
// either way.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { typeOfId, isCanonicalIdOfType, type CanonCatalog } from '../typed-id.js';
import { REQUIREMENT_DERIVED_FROM_TYPES } from './types.js';

export interface RequirementValidateOptions {
  /** When provided, REQ-002 enforces that each `derived_from` id is admitted. */
  catalog?: CanonCatalog;
}

const REQUIRED_FIELDS = [
  'notation', 'name', 'description', 'zone', 'admitted_at', 'admitted_by', 'gate_checks', 'valid_from',
] as const;

export function validateRequirement(input: unknown, options: RequirementValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'REQ-001', message: 'Requirement must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const r = input as Record<string, unknown>;

  // REQ-001 — id grammar.
  if (!isCanonicalIdOfType(r.id, 'REQUIREMENT')) {
    errors.push({ code: 'REQ-001', message: `id "${String(r.id)}" must match REQUIREMENT-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  // REQ-001 — fixed notation tag.
  if (r.notation !== 'requirement') {
    errors.push({ code: 'REQ-001', message: 'notation must be the fixed value "requirement".', path: 'notation' });
  }
  // REQ-001 — required fields present and non-empty (notation handled above).
  for (const f of REQUIRED_FIELDS) {
    if (f === 'notation') continue;
    if (f === 'gate_checks') {
      if (r.gate_checks === null || typeof r.gate_checks !== 'object') {
        errors.push({ code: 'REQ-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
      }
      continue;
    }
    const v = r[f];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'REQ-001', message: `${f} is required.`, path: f });
    }
  }
  // REQ-001 — zone fixed value.
  if (r.zone !== undefined && r.zone !== 'canon') {
    errors.push({ code: 'REQ-001', message: 'zone must be "canon" for a REQUIREMENT.', path: 'zone' });
  }
  // REQ-001 — valid_to key must exist (string or null).
  if (!('valid_to' in r) || !(typeof r.valid_to === 'string' || r.valid_to === null)) {
    errors.push({ code: 'REQ-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }

  // REQ-002 / REQ-003 — derived_from references.
  if (r.derived_from !== undefined) {
    if (!Array.isArray(r.derived_from)) {
      errors.push({ code: 'REQ-001', message: 'derived_from must be a list of typed IDs.', path: 'derived_from' });
    } else {
      r.derived_from.forEach((ref, i) => {
        const type = typeOfId(ref);
        if (!type) {
          // A malformed ref cannot resolve — REQ-002.
          errors.push({ code: 'REQ-002', message: `derived_from[${i}] "${String(ref)}" is not a resolvable typed ID.`, path: `derived_from[${i}]` });
          return;
        }
        if (!REQUIREMENT_DERIVED_FROM_TYPES.includes(type as typeof REQUIREMENT_DERIVED_FROM_TYPES[number])) {
          // REQ-003 — TYPE not a permitted codex source type (prefix-derivable).
          errors.push({ code: 'REQ-003', message: `derived_from[${i}] TYPE "${type}" is not one of ${REQUIREMENT_DERIVED_FROM_TYPES.join(', ')}.`, path: `derived_from[${i}]` });
          return;
        }
        if (options.catalog && options.catalog.typeOf(ref as string) === undefined) {
          // REQ-002 — well-formed but not admitted in the codex zone.
          errors.push({ code: 'REQ-002', message: `derived_from[${i}] "${String(ref)}" does not resolve to an admitted codex artefact.`, path: `derived_from[${i}]` });
        }
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
