// CONSTRAINT validator — methodology ELEMENT_PRIMITIVES.md §7.13 (sibling to
// 15-requirement.md). Implements CONST-001..005 for the compliance suite (#518 C4).

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { typeOfId, isCanonicalIdOfType, type CanonCatalog } from '../typed-id.js';
import { CONSTRAINT_STATUSES, CONSTRAINT_SEVERITIES } from './types.js';

export interface ConstraintValidateOptions {
  /** When provided, CONST-004/005 enforce artefact existence for cross-refs. */
  catalog?: CanonCatalog;
}

const REQUIRED_FIELDS = [
  'notation',
  'name',
  'statement',
  'status',
  'zone',
  'admitted_at',
  'admitted_by',
  'gate_checks',
  'valid_from',
] as const;

export function validateConstraint(
  input: unknown,
  options: ConstraintValidateOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'CONST-001', message: 'Constraint must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const c = input as Record<string, unknown>;

  if (!isCanonicalIdOfType(c.id, 'CONSTRAINT')) {
    errors.push({
      code: 'CONST-001',
      message: `id "${String(c.id)}" must match CONSTRAINT-[<middle>-]<INTEGER>.`,
      path: 'id',
    });
  }
  if (c.notation !== 'constraint') {
    errors.push({ code: 'CONST-001', message: 'notation must be the fixed value "constraint".', path: 'notation' });
  }
  for (const f of REQUIRED_FIELDS) {
    if (f === 'notation') continue;
    if (f === 'gate_checks') {
      if (c.gate_checks === null || typeof c.gate_checks !== 'object') {
        errors.push({ code: 'CONST-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
      }
      continue;
    }
    const v = c[f];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'CONST-001', message: `${f} is required.`, path: f });
    }
  }
  if (c.zone !== 'canon') {
    errors.push({ code: 'CONST-001', message: 'zone must be "canon" for a CONSTRAINT.', path: 'zone' });
  }
  if (!('valid_to' in c) || !(typeof c.valid_to === 'string' || c.valid_to === null)) {
    errors.push({ code: 'CONST-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }

  const status = typeof c.status === 'string' ? c.status.trim() : '';
  if (status && !(CONSTRAINT_STATUSES as readonly string[]).includes(status)) {
    errors.push({
      code: 'CONST-002',
      message: `status must be one of ${CONSTRAINT_STATUSES.join(', ')}.`,
      path: 'status',
    });
  }

  if (c.severity !== undefined) {
    const severity = typeof c.severity === 'string' ? c.severity.trim() : '';
    if (!severity || !(CONSTRAINT_SEVERITIES as readonly string[]).includes(severity)) {
      errors.push({
        code: 'CONST-003',
        message: `severity must be one of ${CONSTRAINT_SEVERITIES.join(', ')}.`,
        path: 'severity',
      });
    }
  }

  if (c.applies_to !== undefined) {
    if (!Array.isArray(c.applies_to)) {
      errors.push({ code: 'CONST-001', message: 'applies_to must be a list of typed IDs.', path: 'applies_to' });
    } else {
      c.applies_to.forEach((ref, i) => {
        const type = typeOfId(ref);
        if (!type) {
          errors.push({
            code: 'CONST-004',
            message: `applies_to[${i}] "${String(ref)}" is not a resolvable typed ID.`,
            path: `applies_to[${i}]`,
          });
          return;
        }
        if (options.catalog && options.catalog.typeOf(ref as string) === undefined) {
          errors.push({
            code: 'CONST-004',
            message: `applies_to[${i}] "${String(ref)}" does not resolve to an admitted artefact.`,
            path: `applies_to[${i}]`,
          });
        }
      });
    }
  }

  if (c.owner_role !== undefined) {
    const role = c.owner_role;
    if (typeof role !== 'string' || !isCanonicalIdOfType(role, 'ROLE')) {
      errors.push({
        code: 'CONST-005',
        message: `owner_role "${String(role)}" must be a typed ROLE id.`,
        path: 'owner_role',
      });
    } else if (options.catalog && options.catalog.typeOf(role) === undefined) {
      errors.push({
        code: 'CONST-005',
        message: `owner_role "${role}" does not resolve to an admitted artefact.`,
        path: 'owner_role',
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
