import { describe, it, expect } from 'vitest';
import { validateVerification } from '../validate.js';
import type { CanonCatalog } from '../../typed-id.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'verification',
    id: 'VERIFICATION-DEVICE-ALARM-TEST-1',
    verifies: 'REQUIREMENT-DEVICE-ALARM-1',
    method: 'test',
    protocol: 'Discharge battery under controlled load to 10% state of charge; confirm the alert triggers within 2 seconds.',
    result: 'Alert triggered at 9.7% state of charge, 1.4 seconds after threshold crossing.',
    outcome: 'pass',
    evidence: [{ kind: 'note', text: '10/10 runs passed.' }],
    performed_at: '2026-07-20',
    performed_by: 'ROLE-VERIFICATION-ENG-1',
    zone: 'canon',
    admitted_at: '2026-07-21',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass' },
    valid_from: '2026-07-21',
    valid_to: null,
  };
}

const codes = (input: unknown, opts?: Parameters<typeof validateVerification>[1]): string[] =>
  validateVerification(input, opts).errors.map(e => e.code);
const warnCodes = (input: unknown, opts?: Parameters<typeof validateVerification>[1]): string[] =>
  validateVerification(input, opts).warnings.map(w => w.code);

describe('validateVerification — positive', () => {
  it('accepts a well-formed verification', () => {
    const r = validateVerification(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe('validateVerification — VERIF-001 (shape / id grammar)', () => {
  it('flags id grammar, wrong notation, missing admission/lifecycle/protocol fields', () => {
    expect(codes({ ...valid(), id: 'VERIF-1' })).toContain('VERIF-001');
    expect(codes({ ...valid(), notation: 'claim' })).toContain('VERIF-001');
    const noAdmit = valid(); delete noAdmit.admitted_at;
    expect(codes(noAdmit)).toContain('VERIF-001');
    const noValidTo = valid(); delete noValidTo.valid_to;
    expect(codes(noValidTo)).toContain('VERIF-001');
    const noProtocol = valid(); delete noProtocol.protocol;
    expect(codes(noProtocol)).toContain('VERIF-001');
  });

  it('flags a missing method or outcome as VERIF-001 (required field)', () => {
    const noMethod = valid(); delete noMethod.method;
    expect(codes(noMethod)).toContain('VERIF-001');
    const noOutcome = valid(); delete noOutcome.outcome;
    expect(codes(noOutcome)).toContain('VERIF-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['VERIF-001']);
  });
});

describe('validateVerification — VERIF-002 (verifies → REQUIREMENT)', () => {
  it('flags a missing verifies', () => {
    const r = valid(); delete r.verifies;
    expect(codes(r)).toContain('VERIF-002');
  });
  it('flags a verifies that is not a REQUIREMENT typed id', () => {
    expect(codes({ ...valid(), verifies: 'PRODUCT-MOBILE-1' })).toContain('VERIF-002');
  });
  it('with a catalog, flags an unresolved verifies and a wrong-type verifies', () => {
    expect(codes({ ...valid() }, { catalog: { typeOf: () => undefined } })).toContain('VERIF-002');
    const catalog: CanonCatalog = { typeOf: (id) => (id === 'REQUIREMENT-DEVICE-ALARM-1' ? 'GOAL' : 'PRODUCT') };
    expect(codes(valid(), { catalog })).toContain('VERIF-002');
  });
});

describe('validateVerification — VERIF-003 (method enum)', () => {
  it('flags an out-of-enum method', () => {
    expect(codes({ ...valid(), method: 'vibes' })).toContain('VERIF-003');
  });
  it('accepts every method value', () => {
    for (const m of ['test', 'analysis', 'inspection', 'demonstration']) {
      expect(codes({ ...valid(), method: m })).not.toContain('VERIF-003');
    }
  });
});

describe('validateVerification — VERIF-004 (outcome enum)', () => {
  it('flags an out-of-enum outcome', () => {
    expect(codes({ ...valid(), outcome: 'maybe' })).toContain('VERIF-004');
  });
  it('accepts every outcome value', () => {
    for (const o of ['pass', 'fail', 'inconclusive', 'not_yet_run']) {
      expect(codes({ ...valid(), outcome: o, evidence: [{ kind: 'note', text: 'x' }] })).not.toContain('VERIF-004');
    }
  });
});

describe('validateVerification — VERIF-005 (canonical_ref evidence resolves)', () => {
  it('flags a malformed canonical_ref', () => {
    expect(codes({ ...valid(), evidence: [{ kind: 'canonical_ref', ref: 'nope' }] })).toContain('VERIF-005');
  });
  it('with a catalog, flags an unresolved canonical_ref', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes({ ...valid(), evidence: [{ kind: 'canonical_ref', ref: 'PROCESS-X-1' }] }, { catalog })).toContain('VERIF-005');
  });
  it('ignores external_doc and note evidence kinds for resolution', () => {
    const ev = [{ kind: 'external_doc', title: 't', url: 'u' }, { kind: 'note', text: 'n' }];
    expect(codes({ ...valid(), evidence: ev })).not.toContain('VERIF-005');
  });
});

describe('validateVerification — VERIF-006 (pass outcome without evidence)', () => {
  it('warns when evidence is empty and outcome is pass', () => {
    expect(warnCodes({ ...valid(), evidence: [], outcome: 'pass' })).toContain('VERIF-006');
  });
  it('does not warn for fail / inconclusive / not_yet_run with empty evidence', () => {
    for (const o of ['fail', 'inconclusive', 'not_yet_run']) {
      expect(warnCodes({ ...valid(), evidence: [], outcome: o })).not.toContain('VERIF-006');
    }
  });
});
