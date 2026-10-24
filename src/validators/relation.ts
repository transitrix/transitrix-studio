import { isoDate, mapping } from '@transitrix/diagrams/standalone/validate.js';
import { isCanonicalId, isCanonicalIdOfType } from '@transitrix/diagrams/typed-id.js';
import type { ValidatorRegistration, NotationValidationResult } from '../notation-types.js';

// REL file contract. Catalogue identity, subtype and graph checks are separate.
const KINDS = new Set([
  'parent', 'goal_parent', 'target_state_satisfies_goal', 'assessment_influences_goal',
  'action_goal', 'activity_goal', 'unit_parent', 'employment', 'candidacy',
  'alumni_membership', 'community_membership', 'contracting', 'located_at',
  'unit_located_at', 'stakeholding', 'offers', 'realizes', 'hosts', 'uses',
  'depends_on', 'required_for', 'process_parent', 'requirement_parent',
  'product_scope', 'application_scope', 'project_scope', 'project_product',
  'project_application', 'source_trace', 'serves', 'reports_to',
]);

export function validateRelation(input: unknown): NotationValidationResult {
  const errors: NotationValidationResult['errors'] = [];
  const warnings: NotationValidationResult['warnings'] = [];
  const fail = (code: string, field: string, message: string) => errors.push({ code, message: `${field}: ${message}` });
  const result = () => ({ valid: errors.length === 0, errors, warnings });
  if (!mapping(input)) {
    fail('SCHEMA_INVALID', '$', 'Relation must be a mapping.');
    return result();
  }
  const d = input;
  if (d.notation !== 'relation') fail('SCHEMA_INVALID', 'notation', 'Expected relation.');
  if (!isCanonicalIdOfType(d.id, 'REL')) fail('SCHEMA_INVALID', 'id', 'Expected a canonical REL ID.');
  if (typeof d.type !== 'string' || !KINDS.has(d.type)) fail('REL-001', 'type', 'Missing or unknown relation kind.');
  for (const field of ['from', 'to']) {
    if (typeof d[field] !== 'string') fail('SCHEMA_INVALID', field, 'Expected one scalar endpoint ID; use separate binary relations.');
    const capabilityAddress = typeof d[field] === 'string' && /^CAPABILITY-[VH][1-9]\d*(?:\.[1-9]\d*)*$/.test(d[field] as string);
    if (!isCanonicalId(d[field]) && !capabilityAddress) fail('REL-002', field, 'Expected one canonical endpoint ID.');
    else if (['reports_to', 'employment', 'unit_parent'].includes(String(d.type)) && !isCanonicalIdOfType(d[field], 'ACTOR')) {
      fail('REL-002', field, 'Expected an ACTOR ID; resolved person/unit subtype requires catalogue validation.');
    }
  }
  const state = d.admission_state === undefined ? 'active' : d.admission_state;
  if (typeof state !== 'string' || !['active', 'proposed', 'rejected'].includes(state)) fail('ADMIT-001', 'admission_state', 'Unknown admission state.');
  else if (state === 'active') {
    const gates = d.gate_checks;
    if (d.zone !== 'canon' || !isoDate(d.admitted_at) || typeof d.admitted_by !== 'string' || !d.admitted_by.trim()
      || !mapping(gates) || !['uniqueness', 'consistency', 'completeness'].every(k => gates[k] === 'pass')
      || !Object.values(gates).every(v => v === 'pass')) {
      fail('ADMIT-003', 'admission', 'Active relation requires canon zone, admitted_at, admitted_by and passing gate_checks.');
    }
  } else if (state === 'proposed' && (d.admitted_at || d.admitted_by || !d.proposed_at || !d.proposed_by)) {
    fail('ADMIT-002', 'admission', 'Proposed relation requires proposal metadata and no admission metadata.');
  } else if (state === 'rejected' && (!d.rejected_at || !d.rejected_by)) {
    fail('ADMIT-004', 'admission', 'Rejected relation requires rejection metadata.');
  }
  if (!isoDate(d.valid_from)) fail('LIFECYCLE-001', 'valid_from', 'Expected an ISO calendar date.');
  if (!('valid_to' in d)) fail('SCHEMA_INVALID', 'valid_to', 'Required field is missing; use null for an unbounded end.');
  else if (d.valid_to !== null && !isoDate(d.valid_to)) fail('LIFECYCLE-002', 'valid_to', 'Expected an ISO calendar date or null.');
  if (isoDate(d.valid_from) && isoDate(d.valid_to) && d.valid_to < d.valid_from) fail('LIFECYCLE-003', 'valid_to', 'End precedes start.');
  return result();
}

export const registration: ValidatorRegistration = {
  notation: 'relation',
  validator: validateRelation,
};
