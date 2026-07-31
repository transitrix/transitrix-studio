// METRIC validator — methodology ELEMENT_PRIMITIVES.md §7.27 / §9.
//
// Codes:
//   METRIC-001 — shape / id grammar / required envelope + per-type fields
//               (measures, unit, target, direction_of_good, owner_role).
//   METRIC-002 — measures is empty, or an entry does not resolve to an
//               admitted GOAL / CAPABILITY / PROCESS in canon.
//   METRIC-003 — direction_of_good outside {higher_is_better, lower_is_better,
//               on_target}.
//   METRIC-004 — owner_role does not resolve to an admitted ROLE in canon.
//
// Resolution rules (METRIC-002/004) that need artefact *existence* run only
// when a `CanonCatalog` is supplied; the TYPE checks are derivable from the
// id prefix and run either way.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { typeOfId, isCanonicalIdOfType, type CanonCatalog } from '../typed-id.js';
import { METRIC_DIRECTIONS_OF_GOOD } from './types.js';

export interface MetricValidateOptions {
  /** When provided, METRIC-002/004 enforce artefact existence for cross-refs. */
  catalog?: CanonCatalog;
}

const MEASURES_TYPES = ['GOAL', 'CAPABILITY', 'PROCESS'] as const;

export function validateMetric(input: unknown, options: MetricValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'METRIC-001', message: 'Metric must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const m = input as Record<string, unknown>;

  // METRIC-001 — id grammar + notation tag + envelope + plain per-type fields.
  if (!isCanonicalIdOfType(m.id, 'METRIC')) {
    errors.push({ code: 'METRIC-001', message: `id "${String(m.id)}" must match METRIC-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (m.notation !== 'metric') {
    errors.push({ code: 'METRIC-001', message: 'notation must be the fixed value "metric".', path: 'notation' });
  }
  if (m.zone !== 'canon') {
    errors.push({ code: 'METRIC-001', message: 'zone is required and must be "canon".', path: 'zone' });
  }
  for (const f of ['name', 'admitted_at', 'admitted_by', 'valid_from', 'unit', 'owner_role'] as const) {
    if (typeof m[f] !== 'string' || (m[f] as string).trim() === '') {
      errors.push({ code: 'METRIC-001', message: `${f} is required.`, path: f });
    }
  }
  if (m.gate_checks === null || typeof m.gate_checks !== 'object') {
    errors.push({ code: 'METRIC-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in m) || !(typeof m.valid_to === 'string' || m.valid_to === null)) {
    errors.push({ code: 'METRIC-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }
  if (typeof m.target !== 'number' || Number.isNaN(m.target)) {
    errors.push({ code: 'METRIC-001', message: 'target is required and must be a number.', path: 'target' });
  }

  // direction_of_good — required (METRIC-001) + enum (METRIC-003).
  const dir = m.direction_of_good;
  if (dir === undefined || dir === null || dir === '') {
    errors.push({ code: 'METRIC-001', message: 'direction_of_good is required.', path: 'direction_of_good' });
  } else if (!(METRIC_DIRECTIONS_OF_GOOD as readonly string[]).includes(dir as string)) {
    errors.push({
      code: 'METRIC-003',
      message: `direction_of_good "${String(dir)}" must be one of ${METRIC_DIRECTIONS_OF_GOOD.join(', ')}.`,
      path: 'direction_of_good',
    });
  }

  // measures — required non-empty list (METRIC-001), each resolves to GOAL/CAPABILITY/PROCESS (METRIC-002).
  const measures = m.measures;
  if (!Array.isArray(measures) || measures.length === 0) {
    errors.push({ code: 'METRIC-001', message: 'measures is required and must be a non-empty list of typed IDs.', path: 'measures' });
  } else {
    measures.forEach((ref, i) => {
      const type = typeOfId(ref);
      if (!type || !(MEASURES_TYPES as readonly string[]).includes(type as typeof MEASURES_TYPES[number])) {
        errors.push({ code: 'METRIC-002', message: `measures[${i}] "${String(ref)}" must resolve to a GOAL, CAPABILITY, or PROCESS.`, path: `measures[${i}]` });
        return;
      }
      if (options.catalog && options.catalog.typeOf(ref as string) === undefined) {
        errors.push({ code: 'METRIC-002', message: `measures[${i}] "${String(ref)}" does not resolve to an admitted artefact.`, path: `measures[${i}]` });
      }
    });
  }

  // owner_role — must be a typed ROLE id (METRIC-004), and resolve when a catalog is supplied.
  const ownerRole = m.owner_role;
  if (typeof ownerRole === 'string' && ownerRole.trim() !== '') {
    if (!isCanonicalIdOfType(ownerRole, 'ROLE')) {
      errors.push({ code: 'METRIC-004', message: `owner_role "${ownerRole}" must be a typed ROLE id.`, path: 'owner_role' });
    } else if (options.catalog && options.catalog.typeOf(ownerRole) === undefined) {
      errors.push({ code: 'METRIC-004', message: `owner_role "${ownerRole}" does not resolve to an admitted artefact.`, path: 'owner_role' });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
