import { describe, it, expect } from 'vitest';
import { validateTargetState } from '../validate.js';
import type { CanonCatalog } from '../../typed-id.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'target-state',
    id: 'TARGET_STATE-EU-LIVE-1',
    name: 'EU operations live — three markets, localised CRM and payments',
    description: 'The structural end-state.',
    capabilities: ['CAPABILITY-V1', 'CAPABILITY-V1.2', 'CAPABILITY-V2'],
    processes: ['PROCESS-CUST-ONBOARD-1', 'PROCESS-ORD-FULFILL-1'],
    applications: ['APPLICATION-CRM-1', 'APPLICATION-OMS-1'],
    zone: 'canon',
    admitted_at: '2026-05-31',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2026-05-31',
    valid_to: null,
  };
}

const codes = (input: unknown, opts?: Parameters<typeof validateTargetState>[1]): string[] =>
  validateTargetState(input, opts).errors.map(e => e.code);

describe('validateTargetState — positive', () => {
  it('accepts a well-formed target state', () => {
    const r = validateTargetState(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts a target state with empty composition lists', () => {
    const t = valid();
    delete t.capabilities;
    delete t.processes;
    delete t.applications;
    expect(validateTargetState(t).valid).toBe(true);
  });

  it('accepts CAPABILITY V/H ids without integer terminal', () => {
    const t = valid();
    t.capabilities = ['CAPABILITY-V1.2.3', 'CAPABILITY-H1.2'];
    expect(validateTargetState(t).valid).toBe(true);
  });
});

describe('validateTargetState — TSTATE-001 (shape / id grammar)', () => {
  it('flags a missing required envelope field', () => {
    const t = valid();
    delete t.name;
    expect(codes(t)).toContain('TSTATE-001');
  });

  it('flags an id that violates the grammar', () => {
    expect(codes({ ...valid(), id: 'TARGET_STATE-EU-LIVE-001' })).toContain('TSTATE-001');
    expect(codes({ ...valid(), id: 'TS-1' })).toContain('TSTATE-001');
  });

  it('flags a wrong notation tag', () => {
    expect(codes({ ...valid(), notation: 'target_state' })).toContain('TSTATE-001');
  });

  it('flags a non-array composition list', () => {
    expect(codes({ ...valid(), capabilities: 'CAPABILITY-V1' })).toContain('TSTATE-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['TSTATE-001']);
  });
});

describe('validateTargetState — TSTATE-002 (composition TYPEs)', () => {
  it('flags a capabilities entry of the wrong TYPE', () => {
    expect(codes({ ...valid(), capabilities: ['PROCESS-X-1'] })).toContain('TSTATE-002');
  });

  it('flags a processes entry of the wrong TYPE', () => {
    expect(codes({ ...valid(), processes: ['APPLICATION-X-1'] })).toContain('TSTATE-002');
  });

  it('flags an applications entry of the wrong TYPE', () => {
    expect(codes({ ...valid(), applications: ['CAPABILITY-V1'] })).toContain('TSTATE-002');
  });

  it('flags an unresolved id when a catalog is supplied', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes(valid(), { catalog })).toContain('TSTATE-002');
  });
});

describe('validateTargetState — TSTATE-003 (forbidden inline goals)', () => {
  it('flags an inline goals field', () => {
    expect(codes({ ...valid(), goals: ['GOAL-EU-1'] })).toContain('TSTATE-003');
  });
});
