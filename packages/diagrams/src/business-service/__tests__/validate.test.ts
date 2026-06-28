import { describe, it, expect } from 'vitest';
import { validateBusinessService } from '../validate.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'business-service',
    id: 'BUSINESS_SERVICE-CRM-1',
    name: 'CRM Service',
    type: 'internal',
    description: 'Customer relationship management service offering contact management and deal tracking.',
    offering_unit: 'ACTOR-SALES-OPS-1',
    capability: 'CAPABILITY-V2.1',
    zone: 'canon',
    admitted_at: '2026-06-28',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2024-01-01',
    valid_to: null,
  };
}

const codes = (input: unknown): string[] =>
  validateBusinessService(input).errors.map(e => e.code);

describe('validateBusinessService — positive', () => {
  it('accepts a well-formed internal service with all optional fields', () => {
    const r = validateBusinessService(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts an external service with no optional fields', () => {
    const a = valid();
    a.id = 'BUSINESS_SERVICE-ONBOARDING-1';
    a.name = 'Onboarding Service';
    a.type = 'external';
    delete a.description;
    delete a.offering_unit;
    delete a.capability;
    expect(validateBusinessService(a).valid).toBe(true);
  });

  it('accepts a shared service offered by a ROLE', () => {
    expect(validateBusinessService({ ...valid(), type: 'shared', offering_unit: 'ROLE-PLATFORM-OWNER-1' }).valid).toBe(true);
  });

  it('accepts valid_to as a date string', () => {
    expect(validateBusinessService({ ...valid(), valid_to: '2026-12-31' }).valid).toBe(true);
  });

  it('accepts a service with no offering_unit or capability', () => {
    const a = valid();
    delete a.offering_unit;
    delete a.capability;
    expect(validateBusinessService(a).valid).toBe(true);
  });
});

describe('validateBusinessService — BSV-001 (shape / id grammar)', () => {
  it('flags a missing required envelope field (name)', () => {
    const a = valid();
    delete a.name;
    expect(codes(a)).toContain('BSV-001');
  });

  it('flags an id that violates the grammar', () => {
    expect(codes({ ...valid(), id: 'BUSINESS_SERVICE-001' })).toContain('BSV-001');
    expect(codes({ ...valid(), id: 'BSV-1' })).toContain('BSV-001');
    expect(codes({ ...valid(), id: 'business-service-1' })).toContain('BSV-001');
  });

  it('flags a wrong notation tag', () => {
    expect(codes({ ...valid(), notation: 'service' })).toContain('BSV-001');
    expect(codes({ ...valid(), notation: 'business_service' })).toContain('BSV-001');
  });

  it('flags a non-canon zone', () => {
    expect(codes({ ...valid(), zone: 'sandbox' })).toContain('BSV-001');
  });

  it('flags a missing zone', () => {
    const a = valid();
    delete a.zone;
    expect(codes(a)).toContain('BSV-001');
  });

  it('flags a missing type', () => {
    const a = valid();
    delete a.type;
    expect(codes(a)).toContain('BSV-001');
  });

  it('flags a missing valid_to key', () => {
    const a = valid();
    delete a.valid_to;
    expect(codes(a)).toContain('BSV-001');
  });

  it('flags missing gate_checks', () => {
    const a = valid();
    delete a.gate_checks;
    expect(codes(a)).toContain('BSV-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['BSV-001']);
    expect(codes('string')).toEqual(['BSV-001']);
  });
});

describe('validateBusinessService — BSV-002 (type enum)', () => {
  it('flags a type outside the allowed enum', () => {
    expect(codes({ ...valid(), type: 'public' })).toContain('BSV-002');
    expect(codes({ ...valid(), type: 'platform' })).toContain('BSV-002');
  });

  it('accepts all valid type values', () => {
    for (const t of ['internal', 'external', 'shared']) {
      expect(codes({ ...valid(), type: t })).not.toContain('BSV-002');
    }
  });
});

describe('validateBusinessService — BSV-003 (offering_unit grammar)', () => {
  it('flags an offering_unit that is not an ACTOR-… or ROLE-… id', () => {
    expect(codes({ ...valid(), offering_unit: 'PRODUCT-PLATFORM-1' })).toContain('BSV-003');
    expect(codes({ ...valid(), offering_unit: 'not-an-id' })).toContain('BSV-003');
    expect(codes({ ...valid(), offering_unit: 'BUSINESS_SERVICE-CRM-1' })).toContain('BSV-003');
  });

  it('accepts a null or absent offering_unit without error', () => {
    expect(codes({ ...valid(), offering_unit: undefined })).not.toContain('BSV-003');
    const a = valid();
    delete a.offering_unit;
    expect(codes(a)).not.toContain('BSV-003');
  });

  it('accepts ACTOR-… and ROLE-… ids', () => {
    expect(codes({ ...valid(), offering_unit: 'ACTOR-OPS-1' })).not.toContain('BSV-003');
    expect(codes({ ...valid(), offering_unit: 'ROLE-SERVICE-OWNER-1' })).not.toContain('BSV-003');
  });
});

describe('validateBusinessService — BSV-004 (capability grammar)', () => {
  it('flags a capability that is not a CAPABILITY-… id', () => {
    expect(codes({ ...valid(), capability: 'PRODUCT-MOBILE-1' })).toContain('BSV-004');
    expect(codes({ ...valid(), capability: 'not-a-capability' })).toContain('BSV-004');
  });

  it('accepts a null or absent capability without error', () => {
    expect(codes({ ...valid(), capability: undefined })).not.toContain('BSV-004');
    const a = valid();
    delete a.capability;
    expect(codes(a)).not.toContain('BSV-004');
  });

  it('accepts a CAPABILITY-… id', () => {
    expect(codes({ ...valid(), capability: 'CAPABILITY-V2.1' })).not.toContain('BSV-004');
    expect(codes({ ...valid(), capability: 'CAPABILITY-H3.1' })).not.toContain('BSV-004');
  });
});
