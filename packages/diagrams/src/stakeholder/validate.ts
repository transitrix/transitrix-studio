// STAKEHOLDER validator — methodology notations/elements/20-stakeholders.md §5.
//
// Codes:
//   STAKE-001 — shape / id grammar / required envelope / interest|influence enum.
//   STAKE-002 — `actor` missing, malformed, wrong TYPE, or unresolved in catalog.
//   STAKE-003 — `type` outside {internal, external}.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { typeOfId, isCanonicalIdOfType, type CanonCatalog } from '../typed-id.js';
import { STAKEHOLDER_TYPES, STAKEHOLDER_LEVELS } from './types.js';

export interface StakeholderValidateOptions {
  /** When provided, STAKE-002 enforces that `actor` resolves to an admitted ACTOR. */
  catalog?: CanonCatalog;
}

const REQUIRED_STRING_FIELDS = [
  'name', 'admitted_at', 'admitted_by', 'valid_from',
] as const;

const TYPES: readonly string[] = STAKEHOLDER_TYPES;
const LEVELS: readonly string[] = STAKEHOLDER_LEVELS;

export function validateStakeholder(input: unknown, options: StakeholderValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'STAKE-001', message: 'Stakeholder must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const s = input as Record<string, unknown>;

  // STAKE-001 — id grammar + notation tag + envelope.
  if (!isCanonicalIdOfType(s.id, 'STAKEHOLDER')) {
    errors.push({ code: 'STAKE-001', message: `id "${String(s.id)}" must match STAKEHOLDER-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (s.notation !== 'stakeholder') {
    errors.push({ code: 'STAKE-001', message: 'notation must be the fixed value "stakeholder".', path: 'notation' });
  }
  if (s.zone !== undefined && s.zone !== 'canon') {
    errors.push({ code: 'STAKE-001', message: 'zone must be "canon" for a STAKEHOLDER.', path: 'zone' });
  } else if (s.zone === undefined) {
    errors.push({ code: 'STAKE-001', message: 'zone is required.', path: 'zone' });
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const v = s[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'STAKE-001', message: `${field} is required.`, path: field });
    }
  }
  if (s.gate_checks === null || typeof s.gate_checks !== 'object') {
    errors.push({ code: 'STAKE-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in s) || !(typeof s.valid_to === 'string' || s.valid_to === null)) {
    errors.push({ code: 'STAKE-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }

  // STAKE-003 — type enum (required field).
  if (typeof s.type !== 'string' || s.type.trim() === '') {
    errors.push({ code: 'STAKE-001', message: 'type is required.', path: 'type' });
  } else if (!TYPES.includes(s.type)) {
    errors.push({ code: 'STAKE-003', message: `type "${s.type}" must be one of ${TYPES.join(', ')}.`, path: 'type' });
  }

  // STAKE-002 — actor identity binding (required).
  const actor = s.actor;
  if (typeof actor !== 'string' || actor.trim() === '') {
    errors.push({ code: 'STAKE-002', message: 'actor is required — identity must come from an ACTOR.', path: 'actor' });
  } else if (typeOfId(actor) !== 'ACTOR') {
    errors.push({ code: 'STAKE-002', message: `actor "${actor}" must be a typed ACTOR id.`, path: 'actor' });
  } else if (options.catalog) {
    const t = options.catalog.typeOf(actor);
    if (t === undefined) {
      errors.push({ code: 'STAKE-002', message: `actor "${actor}" does not resolve to an admitted ACTOR.`, path: 'actor' });
    } else if (t !== 'ACTOR') {
      errors.push({ code: 'STAKE-002', message: `actor "${actor}" resolves to a ${t}, not an ACTOR.`, path: 'actor' });
    }
  }

  // STAKE-001 — interest / influence levels.
  for (const field of ['interest', 'influence'] as const) {
    const v = s[field];
    if (v !== undefined && (typeof v !== 'string' || !LEVELS.includes(v))) {
      errors.push({ code: 'STAKE-001', message: `${field} "${String(v)}" must be one of ${LEVELS.join(', ')}.`, path: field });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
