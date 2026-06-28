import { describe, it, expect } from 'vitest';
import { validateIntegration } from '../validate.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'integration',
    id: 'INTEGRATION-OMS-CRM-1',
    source: 'APPLICATION-OMS-1',
    target: 'APPLICATION-CRM-1',
    direction: 'outbound',
    protocol: 'REST',
    zone: 'canon',
    admitted_at: '2026-06-28',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2024-01-01',
    valid_to: null,
  };
}

function validWithInterface(): Record<string, unknown> {
  return {
    ...valid(),
    id: 'INTEGRATION-OMS-EVENTS-1',
    interface_semantics: true,
    payload_class: 'domain_event',
    sensitivity: 'internal',
    directionality: 'producer',
  };
}

const codes = (input: unknown): string[] =>
  validateIntegration(input).errors.map(e => e.code);

describe('validateIntegration — positive', () => {
  it('accepts a well-formed integration without interface_semantics', () => {
    const r = validateIntegration(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts integration with no optional fields except required ones', () => {
    const a = valid();
    delete a.direction;
    delete a.protocol;
    expect(validateIntegration(a).valid).toBe(true);
  });

  it('accepts a valid integration with interface_semantics: true and all required fields', () => {
    const r = validateIntegration(validWithInterface());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts valid_to as a date string', () => {
    expect(validateIntegration({ ...valid(), valid_to: '2026-12-31' }).valid).toBe(true);
  });

  it('accepts interface_semantics: false without requiring conditional fields', () => {
    expect(validateIntegration({ ...valid(), interface_semantics: false }).valid).toBe(true);
  });

  it('accepts all four directionality values', () => {
    for (const d of ['producer', 'consumer', 'request_reply', 'bidirectional_stream']) {
      expect(validateIntegration({ ...validWithInterface(), directionality: d }).valid).toBe(true);
    }
  });

  it('accepts all four sensitivity values', () => {
    for (const s of ['public', 'internal', 'confidential', 'restricted']) {
      expect(validateIntegration({ ...validWithInterface(), sensitivity: s }).valid).toBe(true);
    }
  });
});

describe('validateIntegration — INT-001 (shape / id grammar)', () => {
  it('flags a non-object input', () => {
    expect(codes(null)).toEqual(['INT-001']);
    expect(codes('string')).toEqual(['INT-001']);
  });

  it('flags an id that violates the grammar', () => {
    expect(codes({ ...valid(), id: 'INTEGRATION-001' })).toContain('INT-001');
    expect(codes({ ...valid(), id: 'INT-1' })).toContain('INT-001');
    expect(codes({ ...valid(), id: 'integration-oms-1' })).toContain('INT-001');
  });

  it('flags a wrong notation tag', () => {
    expect(codes({ ...valid(), notation: 'integrations' })).toContain('INT-001');
    expect(codes({ ...valid(), notation: 'application' })).toContain('INT-001');
  });

  it('flags a non-canon zone', () => {
    expect(codes({ ...valid(), zone: 'sandbox' })).toContain('INT-001');
  });

  it('flags a missing zone', () => {
    const a = valid();
    delete a.zone;
    expect(codes(a)).toContain('INT-001');
  });

  it('flags a missing source', () => {
    const a = valid();
    delete a.source;
    expect(codes(a)).toContain('INT-001');
  });

  it('flags a missing target', () => {
    const a = valid();
    delete a.target;
    expect(codes(a)).toContain('INT-001');
  });

  it('flags a missing admitted_at', () => {
    const a = valid();
    delete a.admitted_at;
    expect(codes(a)).toContain('INT-001');
  });

  it('flags a missing valid_to key', () => {
    const a = valid();
    delete a.valid_to;
    expect(codes(a)).toContain('INT-001');
  });

  it('flags missing gate_checks', () => {
    const a = valid();
    delete a.gate_checks;
    expect(codes(a)).toContain('INT-001');
  });

  it('flags an invalid direction value', () => {
    expect(codes({ ...valid(), direction: 'both' })).toContain('INT-001');
  });
});

describe('validateIntegration — INT-001 (interface_semantics conditional fields)', () => {
  it('flags missing protocol when interface_semantics is true', () => {
    const a = validWithInterface();
    delete a.protocol;
    expect(codes(a)).toContain('INT-001');
  });

  it('flags missing payload_class when interface_semantics is true', () => {
    const a = validWithInterface();
    delete a.payload_class;
    expect(codes(a)).toContain('INT-001');
  });

  it('flags missing sensitivity when interface_semantics is true', () => {
    const a = validWithInterface();
    delete a.sensitivity;
    expect(codes(a)).toContain('INT-001');
  });

  it('flags missing directionality when interface_semantics is true', () => {
    const a = validWithInterface();
    delete a.directionality;
    expect(codes(a)).toContain('INT-001');
  });

  it('flags all four missing at once', () => {
    const a = valid();
    a.interface_semantics = true;
    delete a.protocol;
    const errs = validateIntegration(a).errors.filter(e => e.code === 'INT-001');
    expect(errs.length).toBeGreaterThanOrEqual(4);
  });

  it('flags an invalid sensitivity value when interface_semantics is true', () => {
    expect(codes({ ...validWithInterface(), sensitivity: 'secret' })).toContain('INT-001');
  });

  it('flags an invalid directionality value when interface_semantics is true', () => {
    expect(codes({ ...validWithInterface(), directionality: 'both_ways' })).toContain('INT-001');
  });

  it('does not fire INT-001 conditional checks when interface_semantics is absent', () => {
    const a = valid();
    const errs = validateIntegration(a).errors.filter(e => e.code === 'INT-001' && e.path && ['protocol', 'payload_class', 'sensitivity', 'directionality'].includes(e.path));
    expect(errs).toHaveLength(0);
  });
});

describe('validateIntegration — INT-002 (endpoint APPLICATION type)', () => {
  it('flags a source that is not an APPLICATION-… id when interface_semantics is true', () => {
    expect(codes({ ...validWithInterface(), source: 'INTEGRATION-OTHER-1' })).toContain('INT-002');
    expect(codes({ ...validWithInterface(), source: 'ACTOR-SALES-1' })).toContain('INT-002');
  });

  it('flags a target that is not an APPLICATION-… id when interface_semantics is true', () => {
    expect(codes({ ...validWithInterface(), target: 'TECHNOLOGY_SERVICE-KAFKA-1' })).toContain('INT-002');
    expect(codes({ ...validWithInterface(), target: 'NODE-HOST-1' })).toContain('INT-002');
  });

  it('does not fire INT-002 when interface_semantics is absent', () => {
    const a = { ...valid(), source: 'ACTOR-OPS-1', target: 'NODE-HOST-1' };
    expect(codes(a)).not.toContain('INT-002');
  });

  it('does not fire INT-002 for valid APPLICATION-… endpoints', () => {
    expect(codes(validWithInterface())).not.toContain('INT-002');
  });
});
