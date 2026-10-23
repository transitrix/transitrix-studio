import { describe, expect, it } from 'vitest';
import { loadNotationYaml, validateNotationDoc } from '../src/validate-notation.js';

const relation = () => ({
  notation: 'relation', id: 'REL-SYN-REPORTING-1', type: 'reports_to',
  from: 'ACTOR-SYN-A-1', to: 'ACTOR-SYN-B-1', zone: 'canon',
  admitted_at: '2026-01-01', admitted_by: 'synthetic-example',
  gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
  valid_from: '2026-01-01', valid_to: '2026-06-30',
});
const check = (data: unknown) => validateNotationDoc('relation', data);

describe('relation file conformance', () => {
  it.each([
    ['2026-01-01', '2026-06-30'], ['2026-06-01', null], ['2026-08-01', null],
    ['2026-06-15', '2026-06-15'],
  ])('accepts inclusive synthetic reporting window %s through %s', (valid_from, valid_to) => {
    expect(check({ ...relation(), valid_from, valid_to }).isValid).toBe(true);
  });

  it.each([
    ['type', 'unknown', 'REL-001'], ['type', undefined, 'REL-001'],
    ['from', undefined, 'REL-002'], ['to', ['ACTOR-SYN-B-1', 'ACTOR-SYN-C-1'], 'SCHEMA_INVALID'],
    ['to', { id: 'ACTOR-SYN-B-1' }, 'SCHEMA_INVALID'], ['to', 'ROLE-SYN-1', 'REL-002'],
    ['valid_from', '2026-02-30', 'LIFECYCLE-001'], ['valid_to', '2026-02-30', 'LIFECYCLE-002'],
    ['valid_to', '2025-12-31', 'LIFECYCLE-003'], ['admission_state', 'invalid', 'ADMIT-001'],
    ['admission_state', null, 'ADMIT-001'],
    ['admission_state', ['active'], 'ADMIT-001'],
    ['admitted_by', '', 'ADMIT-003'], ['gate_checks', [], 'ADMIT-003'],
    ['gate_checks', { uniqueness: 'pass', consistency: 'pass', completeness: 'fail' }, 'ADMIT-003'],
  ])('rejects %s = %j with %s', (field, value, ruleId) => {
    expect(check({ ...relation(), [field]: value }).findings).toContainEqual(
      expect.objectContaining({ ruleId, severity: 'error' }));
  });

  it('distinguishes absent valid_to from invalid end date', () => {
    const { valid_to, ...data } = relation();
    expect(check(data).findings).toEqual([expect.objectContaining({ ruleId: 'SCHEMA_INVALID', message: expect.stringContaining('valid_to') })]);
  });

  it('preserves YAML timestamp types for quoted-date enforcement', () => {
    const data = loadNotationYaml('notation: relation\nvalid_from: 2026-06-15\n');
    expect(check({ ...relation(), ...(data as object) }).findings).toContainEqual(
      expect.objectContaining({ ruleId: 'LIFECYCLE-001' }));
  });

  it('checks proposal and rejection metadata independently', () => {
    expect(check({ ...relation(), admission_state: 'proposed' }).findings).toContainEqual(expect.objectContaining({ ruleId: 'ADMIT-002' }));
    expect(check({ ...relation(), admission_state: 'rejected' }).findings).toContainEqual(expect.objectContaining({ ruleId: 'ADMIT-004' }));
    expect(check({ ...relation(), admission_state: 'proposed', admitted_at: undefined, admitted_by: undefined,
      proposed_at: '2026-01-01', proposed_by: 'synthetic-example' }).isValid).toBe(true);
  });

  it.each(['employment', 'unit_parent'])('retains %s file shapes and opaque extensions', type => {
    expect(check({ ...relation(), type, roles: ['ROLE-SYN-1'], extensions: { manager: 'free-form' } }).isValid).toBe(true);
  });

  it.each(['application_scope', 'project_scope', 'project_product', 'project_application', 'source_trace', 'serves'])('retains existing %s kind recognition', type => {
    expect(check({ ...relation(), type }).findings.some(f => f.ruleId === 'REL-001')).toBe(false);
  });

  it('does not claim resolved identity or graph checks from one file', () => {
    expect(check({ ...relation(), to: relation().from }).findings).toEqual([]);
  });

  it('retains capability address references for existing relation kinds', () => {
    expect(check({ ...relation(), type: 'parent', from: 'CAPABILITY-V1.2', to: 'CAPABILITY-V1' }).isValid).toBe(true);
  });
});
