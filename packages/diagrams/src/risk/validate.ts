// RISK validator — methodology ELEMENT_PRIMITIVES.md §7.26 / §9.
//
// Codes:
//   RISK-001 — shape / id grammar / required envelope + per-type fields
//              (likelihood, impact, residual, owner_role, threatens).
//   RISK-002 — likelihood / impact / residual outside {low, medium, high}.
//   RISK-003 — threatens is empty, or an entry does not resolve to an
//              admitted element in canon (no TYPE restriction — any core
//              element may be threatened).
//   RISK-004 — a treated_by entry does not resolve, or resolves to a TYPE
//              other than REQUIREMENT / CONSTRAINT.
//   RISK-COVERAGE-001 (warning) — treated_by is empty/absent (an untreated
//              risk). Unlike the cross-cutting *-COVERAGE-001 rules this
//              reads only the RISK element's own field — no catalogue scan
//              required — so it is implemented inline here rather than via
//              the compliance reverse-index.
//
// Resolution rules (RISK-003/004) that need artefact *existence* run only
// when a `CanonCatalog` is supplied; the TYPE check RISK-004 also carries is
// derivable from the id prefix and runs either way.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { typeOfId, isCanonicalIdOfType, type CanonCatalog } from '../typed-id.js';
import { RISK_LEVELS } from './types.js';

export interface RiskValidateOptions {
  /** When provided, RISK-003/004 enforce artefact existence for cross-refs. */
  catalog?: CanonCatalog;
}

const TREATED_BY_TYPES = ['REQUIREMENT', 'CONSTRAINT'] as const;

export function validateRisk(input: unknown, options: RiskValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'RISK-001', message: 'Risk must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const r = input as Record<string, unknown>;

  // RISK-001 — id grammar + notation tag + envelope + plain per-type fields.
  if (!isCanonicalIdOfType(r.id, 'RISK')) {
    errors.push({ code: 'RISK-001', message: `id "${String(r.id)}" must match RISK-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (r.notation !== 'risk') {
    errors.push({ code: 'RISK-001', message: 'notation must be the fixed value "risk".', path: 'notation' });
  }
  if (r.zone !== 'canon') {
    errors.push({ code: 'RISK-001', message: 'zone is required and must be "canon".', path: 'zone' });
  }
  for (const f of ['name', 'admitted_at', 'admitted_by', 'valid_from', 'owner_role'] as const) {
    if (typeof r[f] !== 'string' || (r[f] as string).trim() === '') {
      errors.push({ code: 'RISK-001', message: `${f} is required.`, path: f });
    }
  }
  if (r.gate_checks === null || typeof r.gate_checks !== 'object') {
    errors.push({ code: 'RISK-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in r) || !(typeof r.valid_to === 'string' || r.valid_to === null)) {
    errors.push({ code: 'RISK-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }

  // likelihood / impact / residual — required (RISK-001) + enum (RISK-002).
  for (const f of ['likelihood', 'impact', 'residual'] as const) {
    const v = r[f];
    if (v === undefined || v === null || v === '') {
      errors.push({ code: 'RISK-001', message: `${f} is required.`, path: f });
    } else if (!(RISK_LEVELS as readonly string[]).includes(v as string)) {
      errors.push({ code: 'RISK-002', message: `${f} "${String(v)}" must be one of ${RISK_LEVELS.join(', ')}.`, path: f });
    }
  }

  // threatens — required non-empty list (RISK-001), each entry resolves (RISK-003).
  const threatens = r.threatens;
  if (!Array.isArray(threatens) || threatens.length === 0) {
    errors.push({ code: 'RISK-001', message: 'threatens is required and must be a non-empty list of typed IDs.', path: 'threatens' });
  } else {
    threatens.forEach((ref, i) => {
      const type = typeOfId(ref);
      if (!type) {
        errors.push({ code: 'RISK-003', message: `threatens[${i}] "${String(ref)}" is not a resolvable typed ID.`, path: `threatens[${i}]` });
        return;
      }
      if (options.catalog && options.catalog.typeOf(ref as string) === undefined) {
        errors.push({ code: 'RISK-003', message: `threatens[${i}] "${String(ref)}" does not resolve to an admitted element.`, path: `threatens[${i}]` });
      }
    });
  }

  // treated_by — optional list; each entry must resolve to REQUIREMENT/CONSTRAINT (RISK-004).
  const treatedBy = r.treated_by;
  if (treatedBy !== undefined) {
    if (!Array.isArray(treatedBy)) {
      errors.push({ code: 'RISK-001', message: 'treated_by must be a list of typed IDs.', path: 'treated_by' });
    } else {
      treatedBy.forEach((ref, i) => {
        const type = typeOfId(ref);
        if (!type || !(TREATED_BY_TYPES as readonly string[]).includes(type as typeof TREATED_BY_TYPES[number])) {
          errors.push({ code: 'RISK-004', message: `treated_by[${i}] "${String(ref)}" must resolve to a REQUIREMENT or CONSTRAINT.`, path: `treated_by[${i}]` });
          return;
        }
        if (options.catalog && options.catalog.typeOf(ref as string) === undefined) {
          errors.push({ code: 'RISK-004', message: `treated_by[${i}] "${String(ref)}" does not resolve to an admitted artefact.`, path: `treated_by[${i}]` });
        }
      });
    }
  }

  // RISK-COVERAGE-001 (warning) — untreated risk; single-file check, no catalogue needed.
  if (!Array.isArray(treatedBy) || treatedBy.length === 0) {
    warnings.push({
      code: 'RISK-COVERAGE-001',
      message: 'treated_by is empty or absent — this risk has no recorded treatment obligation.',
      path: 'treated_by',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}
