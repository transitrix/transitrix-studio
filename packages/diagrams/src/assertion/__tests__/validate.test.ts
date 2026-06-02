import { describe, it, expect } from 'vitest';
import { validateAssertion } from '../validate.js';
import type { CanonCatalog } from '../../typed-id.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'assertion',
    id: 'ASSERTION-MOBILE-DATA-ERASURE-1',
    about: 'REQUIREMENT-DATA-ERASURE-1',
    subject: 'PRODUCT-MOBILE-1',
    realised_via: ['CAPABILITY-V2', 'PROCESS-USER-DATA-PURGE-1'],
    status: 'compliant',
    evidence: [{ kind: 'note', text: 'DPO review confirmed compliance.' }],
    assessed_at: '2026-03-15',
    next_review_at: '2026-09-15',
    zone: 'canon',
    admitted_at: '2026-05-28',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass' },
    valid_from: '2026-03-15',
    valid_to: null,
  };
}

const codes = (input: unknown, opts?: Parameters<typeof validateAssertion>[1]): string[] =>
  validateAssertion(input, opts).errors.map(e => e.code);
const warnCodes = (input: unknown, opts?: Parameters<typeof validateAssertion>[1]): string[] =>
  validateAssertion(input, opts).warnings.map(w => w.code);

describe('validateAssertion — positive', () => {
  it('accepts a well-formed assertion', () => {
    const r = validateAssertion(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe('validateAssertion — ASSERT-001 (shape / id grammar)', () => {
  it('flags id grammar, wrong notation, missing admission/lifecycle fields', () => {
    expect(codes({ ...valid(), id: 'ASSERT-1' })).toContain('ASSERT-001');
    expect(codes({ ...valid(), notation: 'claim' })).toContain('ASSERT-001');
    const noAdmit = valid(); delete noAdmit.admitted_at;
    expect(codes(noAdmit)).toContain('ASSERT-001');
    const noValidTo = valid(); delete noValidTo.valid_to;
    expect(codes(noValidTo)).toContain('ASSERT-001');
  });

  it('flags a missing status as ASSERT-001 (required field)', () => {
    const r = valid(); delete r.status;
    expect(codes(r)).toContain('ASSERT-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['ASSERT-001']);
  });
});

describe('validateAssertion — ASSERT-002 (about → REQUIREMENT)', () => {
  it('flags a missing about', () => {
    const r = valid(); delete r.about;
    expect(codes(r)).toContain('ASSERT-002');
  });
  it('flags an about that is not a REQUIREMENT typed id', () => {
    expect(codes({ ...valid(), about: 'PRODUCT-MOBILE-1' })).toContain('ASSERT-002');
  });
  it('with a catalog, flags an unresolved about and a wrong-type about', () => {
    expect(codes({ ...valid() }, { catalog: { typeOf: () => undefined } })).toContain('ASSERT-002');
    const catalog: CanonCatalog = { typeOf: (id) => (id === 'REQUIREMENT-DATA-ERASURE-1' ? 'GOAL' : 'PRODUCT') };
    expect(codes(valid(), { catalog })).toContain('ASSERT-002');
  });
});

describe('validateAssertion — ASSERT-003 (subject TYPE)', () => {
  it('flags a subject whose TYPE is not PRODUCT/PROCESS/CAPABILITY', () => {
    expect(codes({ ...valid(), subject: 'GOAL-1' })).toContain('ASSERT-003');
  });
  it('accepts PRODUCT, PROCESS and CAPABILITY subjects', () => {
    for (const s of ['PRODUCT-1', 'PROCESS-1', 'CAPABILITY-V2']) {
      expect(codes({ ...valid(), subject: s })).not.toContain('ASSERT-003');
    }
  });
  it('with a catalog, flags an unresolved subject', () => {
    const catalog: CanonCatalog = { typeOf: (id) => (id === 'PRODUCT-MOBILE-1' ? undefined : 'REQUIREMENT') };
    expect(codes(valid(), { catalog })).toContain('ASSERT-003');
  });
});

describe('validateAssertion — ASSERT-004 (realised_via resolves)', () => {
  it('flags a malformed realised_via entry', () => {
    expect(codes({ ...valid(), realised_via: ['nope'] })).toContain('ASSERT-004');
  });
  it('with a catalog, flags an unresolved realised_via entry', () => {
    const catalog: CanonCatalog = { typeOf: (id) => (id.startsWith('CAPABILITY') ? undefined : 'X') };
    expect(codes(valid(), { catalog })).toContain('ASSERT-004');
  });
});

describe('validateAssertion — ASSERT-005 (canonical_ref evidence resolves)', () => {
  it('flags a malformed canonical_ref', () => {
    expect(codes({ ...valid(), evidence: [{ kind: 'canonical_ref', ref: 'nope' }] })).toContain('ASSERT-005');
  });
  it('with a catalog, flags an unresolved canonical_ref', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes({ ...valid(), evidence: [{ kind: 'canonical_ref', ref: 'PROCESS-X-1' }] }, { catalog })).toContain('ASSERT-005');
  });
  it('ignores external_doc and note evidence kinds for resolution', () => {
    const ev = [{ kind: 'external_doc', title: 't', url: 'u' }, { kind: 'note', text: 'n' }];
    expect(codes({ ...valid(), evidence: ev })).not.toContain('ASSERT-005');
  });
});

describe('validateAssertion — ASSERT-006 (status enum)', () => {
  it('flags an out-of-enum status', () => {
    expect(codes({ ...valid(), status: 'maybe' })).toContain('ASSERT-006');
  });
  it('accepts every status value', () => {
    for (const s of ['compliant', 'partial', 'non_compliant', 'under_review', 'n_a']) {
      expect(codes({ ...valid(), status: s, evidence: [{ kind: 'note', text: 'x' }] })).not.toContain('ASSERT-006');
    }
  });
});

describe('validateAssertion — ASSERT-007 (positive status without evidence)', () => {
  it('warns when evidence is empty and status is compliant or partial', () => {
    expect(warnCodes({ ...valid(), evidence: [], status: 'compliant' })).toContain('ASSERT-007');
    expect(warnCodes({ ...valid(), evidence: [], status: 'partial' })).toContain('ASSERT-007');
  });
  it('does not warn for under_review / non_compliant / n_a with empty evidence', () => {
    for (const s of ['under_review', 'non_compliant', 'n_a']) {
      expect(warnCodes({ ...valid(), evidence: [], status: s })).not.toContain('ASSERT-007');
    }
  });
});

describe('validateAssertion — ASSERT-008 (stale review)', () => {
  it('warns only when today is supplied and next_review_at is in the past', () => {
    expect(warnCodes({ ...valid(), next_review_at: '2026-01-01' }, { today: '2026-06-02' })).toContain('ASSERT-008');
    expect(warnCodes({ ...valid(), next_review_at: '2026-12-01' }, { today: '2026-06-02' })).not.toContain('ASSERT-008');
    // No `today` → clock-free, never warns.
    expect(warnCodes({ ...valid(), next_review_at: '2000-01-01' })).not.toContain('ASSERT-008');
  });
});
