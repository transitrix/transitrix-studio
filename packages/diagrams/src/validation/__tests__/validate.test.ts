import { describe, it, expect } from 'vitest';
import { validateValidation } from '../validate.js';
import type { CanonCatalog } from '../../typed-id.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'validation',
    id: 'VALIDATION-OUTAGE-STATUS-UAT-1',
    validates: 'NEED-TIMELY-OUTAGE-STATUS-1',
    method: 'user_acceptance',
    protocol: 'Simulate a service outage in staging; observe whether participants notice the status update within 5 minutes.',
    result: '9/10 participants noticed the status update within 5 minutes.',
    outcome: 'pass',
    evidence: [{ kind: 'note', text: '9/10 within 5 minutes.' }],
    performed_at: '2026-07-22',
    performed_by: 'ROLE-UX-RESEARCH-LEAD-1',
    zone: 'canon',
    admitted_at: '2026-07-23',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2026-07-23',
    valid_to: null,
  };
}

const codes = (input: unknown, opts?: Parameters<typeof validateValidation>[1]): string[] =>
  validateValidation(input, opts).errors.map(e => e.code);
const warnCodes = (input: unknown, opts?: Parameters<typeof validateValidation>[1]): string[] =>
  validateValidation(input, opts).warnings.map(w => w.code);

describe('validateValidation — positive', () => {
  it('accepts a well-formed validation', () => {
    const r = validateValidation(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe('validateValidation — VALID-001 (shape / id grammar)', () => {
  it('flags id grammar, wrong notation, missing admission/lifecycle/protocol fields', () => {
    expect(codes({ ...valid(), id: 'VALID-1' })).toContain('VALID-001');
    expect(codes({ ...valid(), notation: 'claim' })).toContain('VALID-001');
    const noAdmit = valid(); delete noAdmit.admitted_at;
    expect(codes(noAdmit)).toContain('VALID-001');
    const noValidTo = valid(); delete noValidTo.valid_to;
    expect(codes(noValidTo)).toContain('VALID-001');
    const noProtocol = valid(); delete noProtocol.protocol;
    expect(codes(noProtocol)).toContain('VALID-001');
  });

  it('flags a missing method or outcome as VALID-001 (required field)', () => {
    const noMethod = valid(); delete noMethod.method;
    expect(codes(noMethod)).toContain('VALID-001');
    const noOutcome = valid(); delete noOutcome.outcome;
    expect(codes(noOutcome)).toContain('VALID-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['VALID-001']);
  });
});

describe('validateValidation — VALID-002 (validates → NEED)', () => {
  it('flags a missing validates', () => {
    const r = valid(); delete r.validates;
    expect(codes(r)).toContain('VALID-002');
  });
  it('flags a validates that is not a NEED typed id', () => {
    expect(codes({ ...valid(), validates: 'REQUIREMENT-X-1' })).toContain('VALID-002');
  });
  it('with a catalog, flags an unresolved validates and a wrong-type validates', () => {
    expect(codes({ ...valid() }, { catalog: { typeOf: () => undefined } })).toContain('VALID-002');
    const catalog: CanonCatalog = { typeOf: (id) => (id === 'NEED-TIMELY-OUTAGE-STATUS-1' ? 'GOAL' : 'NEED') };
    expect(codes(valid(), { catalog })).toContain('VALID-002');
  });
});

describe('validateValidation — VALID-003 (method enum)', () => {
  it('flags an out-of-enum method', () => {
    expect(codes({ ...valid(), method: 'vibes' })).toContain('VALID-003');
  });
  it('accepts every method value', () => {
    for (const m of ['user_acceptance', 'field_trial', 'stakeholder_review', 'usability_study']) {
      expect(codes({ ...valid(), method: m })).not.toContain('VALID-003');
    }
  });
});

describe('validateValidation — VALID-004 (outcome enum)', () => {
  it('flags an out-of-enum outcome', () => {
    expect(codes({ ...valid(), outcome: 'maybe' })).toContain('VALID-004');
  });
  it('accepts every outcome value', () => {
    for (const o of ['pass', 'fail', 'inconclusive', 'not_yet_run']) {
      expect(codes({ ...valid(), outcome: o, evidence: [{ kind: 'note', text: 'x' }] })).not.toContain('VALID-004');
    }
  });
});

describe('validateValidation — VALID-005 (canonical_ref evidence resolves)', () => {
  it('flags a malformed canonical_ref', () => {
    expect(codes({ ...valid(), evidence: [{ kind: 'canonical_ref', ref: 'nope' }] })).toContain('VALID-005');
  });
  it('with a catalog, flags an unresolved canonical_ref', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes({ ...valid(), evidence: [{ kind: 'canonical_ref', ref: 'PROCESS-X-1' }] }, { catalog })).toContain('VALID-005');
  });
  it('ignores external_doc and note evidence kinds for resolution', () => {
    const ev = [{ kind: 'external_doc', title: 't', url: 'u' }, { kind: 'note', text: 'n' }];
    expect(codes({ ...valid(), evidence: ev })).not.toContain('VALID-005');
  });
});

describe('validateValidation — VALID-006 (pass outcome without evidence)', () => {
  it('warns when evidence is empty and outcome is pass', () => {
    expect(warnCodes({ ...valid(), evidence: [], outcome: 'pass' })).toContain('VALID-006');
  });
  it('does not warn for fail / inconclusive / not_yet_run with empty evidence', () => {
    for (const o of ['fail', 'inconclusive', 'not_yet_run']) {
      expect(warnCodes({ ...valid(), evidence: [], outcome: o })).not.toContain('VALID-006');
    }
  });
});
