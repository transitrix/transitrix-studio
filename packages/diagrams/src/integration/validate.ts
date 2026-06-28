// INTEGRATION validator — methodology notations/ELEMENT_PRIMITIVES.md §7.8.
//
// Implements INT-001 (conditional field enforcement when interface_semantics: true)
// and INT-002 (endpoint APPLICATION type check). The shared HDR-/LIFECYCLE- rules
// are cross-cutting concerns (CONTRACT.md §8) and out of scope for the
// single-artefact validator.

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { isCanonicalIdOfType } from '../typed-id.js';

const REQUIRED_STRING_FIELDS = [
  'source', 'target', 'admitted_at', 'admitted_by', 'valid_from',
] as const;

const VALID_DIRECTIONS = new Set(['inbound', 'outbound', 'bidirectional']);
const VALID_SENSITIVITY = new Set(['public', 'internal', 'confidential', 'restricted']);
const VALID_DIRECTIONALITY = new Set(['producer', 'consumer', 'request_reply', 'bidirectional_stream']);

const IFACE_CONDITIONAL = ['protocol', 'payload_class', 'sensitivity', 'directionality'] as const;

export function validateIntegration(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'INT-001', message: 'Integration must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const a = input as Record<string, unknown>;

  // Shape — id grammar + notation tag + envelope.
  if (!isCanonicalIdOfType(a.id, 'INTEGRATION')) {
    errors.push({ code: 'INT-001', message: `id "${String(a.id)}" must match INTEGRATION-[<middle>-]<INTEGER>.`, path: 'id' });
  }
  if (a.notation !== 'integration') {
    errors.push({ code: 'INT-001', message: 'notation must be the fixed value "integration".', path: 'notation' });
  }
  if (a.zone !== undefined && a.zone !== 'canon') {
    errors.push({ code: 'INT-001', message: 'zone must be "canon" for a standalone INTEGRATION.', path: 'zone' });
  } else if (a.zone === undefined) {
    errors.push({ code: 'INT-001', message: 'zone is required.', path: 'zone' });
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const v = a[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'INT-001', message: `${field} is required.`, path: field });
    }
  }
  if (a.gate_checks === null || typeof a.gate_checks !== 'object') {
    errors.push({ code: 'INT-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }
  if (!('valid_to' in a) || !(typeof a.valid_to === 'string' || a.valid_to === null)) {
    errors.push({ code: 'INT-001', message: 'valid_to is required (an ISO date string or null).', path: 'valid_to' });
  }
  if (a.direction !== undefined && !VALID_DIRECTIONS.has(a.direction as string)) {
    errors.push({ code: 'INT-001', message: `direction "${a.direction}" must be one of inbound, outbound, bidirectional.`, path: 'direction' });
  }

  // INT-001 — interface_semantics: true triggers conditional field enforcement.
  if (a.interface_semantics === true) {
    for (const field of IFACE_CONDITIONAL) {
      const v = a[field];
      if (typeof v !== 'string' || v.trim() === '') {
        errors.push({
          code: 'INT-001',
          message: `${field} is required when interface_semantics is true.`,
          path: field,
        });
      }
    }
    if (typeof a.sensitivity === 'string' && !VALID_SENSITIVITY.has(a.sensitivity)) {
      errors.push({
        code: 'INT-001',
        message: `sensitivity "${a.sensitivity}" must be one of public, internal, confidential, restricted.`,
        path: 'sensitivity',
      });
    }
    if (typeof a.directionality === 'string' && !VALID_DIRECTIONALITY.has(a.directionality)) {
      errors.push({
        code: 'INT-001',
        message: `directionality "${a.directionality}" must be one of producer, consumer, request_reply, bidirectional_stream.`,
        path: 'directionality',
      });
    }

    // INT-002 — source and target must be APPLICATION-… IDs.
    if (typeof a.source === 'string' && a.source.trim() !== '' && !isCanonicalIdOfType(a.source, 'APPLICATION')) {
      errors.push({
        code: 'INT-002',
        message: `source "${a.source}" must be an APPLICATION-… canonical id when interface_semantics is true.`,
        path: 'source',
      });
    }
    if (typeof a.target === 'string' && a.target.trim() !== '' && !isCanonicalIdOfType(a.target, 'APPLICATION')) {
      errors.push({
        code: 'INT-002',
        message: `target "${a.target}" must be an APPLICATION-… canonical id when interface_semantics is true.`,
        path: 'target',
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
