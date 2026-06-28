import { describe, it, expect } from 'vitest';
import { validateTechnologyService } from '../validate.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'technology-service',
    id: 'TECHNOLOGY_SERVICE-KAFKA-1',
    name: 'Kafka Event Bus',
    type: 'messaging',
    description: 'Managed Kafka cluster for async event streaming.',
    node: 'NODE-KAFKA-HOST-1',
    endpoint: 'kafka.internal:9092',
    zone: 'canon',
    admitted_at: '2026-06-28',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2024-01-01',
    valid_to: null,
  };
}

const codes = (input: unknown): string[] =>
  validateTechnologyService(input).errors.map(e => e.code);

describe('validateTechnologyService — positive', () => {
  it('accepts a well-formed messaging service with all optional fields', () => {
    const r = validateTechnologyService(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts a storage service with no optional fields', () => {
    const a = valid();
    a.id = 'TECHNOLOGY_SERVICE-S3-1';
    a.name = 'Object Storage';
    a.type = 'storage';
    delete a.description;
    delete a.node;
    delete a.endpoint;
    expect(validateTechnologyService(a).valid).toBe(true);
  });

  it('accepts all five type values', () => {
    for (const t of ['messaging', 'storage', 'api_gateway', 'database', 'compute']) {
      expect(validateTechnologyService({ ...valid(), type: t }).valid).toBe(true);
    }
  });

  it('accepts valid_to as a date string', () => {
    expect(validateTechnologyService({ ...valid(), valid_to: '2026-12-31' }).valid).toBe(true);
  });

  it('accepts absent node without error', () => {
    const a = valid();
    delete a.node;
    expect(validateTechnologyService(a).valid).toBe(true);
  });
});

describe('validateTechnologyService — TSVC-001 (shape / id grammar)', () => {
  it('flags a non-object input', () => {
    expect(codes(null)).toEqual(['TSVC-001']);
  });

  it('flags an id that violates the grammar', () => {
    expect(codes({ ...valid(), id: 'TECHNOLOGY_SERVICE-001' })).toContain('TSVC-001');
    expect(codes({ ...valid(), id: 'TSVC-1' })).toContain('TSVC-001');
    expect(codes({ ...valid(), id: 'technology-service-kafka-1' })).toContain('TSVC-001');
  });

  it('flags a wrong notation tag', () => {
    expect(codes({ ...valid(), notation: 'technology_service' })).toContain('TSVC-001');
    expect(codes({ ...valid(), notation: 'service' })).toContain('TSVC-001');
  });

  it('flags a non-canon zone', () => {
    expect(codes({ ...valid(), zone: 'sandbox' })).toContain('TSVC-001');
  });

  it('flags a missing zone', () => {
    const a = valid();
    delete a.zone;
    expect(codes(a)).toContain('TSVC-001');
  });

  it('flags a missing name', () => {
    const a = valid();
    delete a.name;
    expect(codes(a)).toContain('TSVC-001');
  });

  it('flags a missing valid_to key', () => {
    const a = valid();
    delete a.valid_to;
    expect(codes(a)).toContain('TSVC-001');
  });

  it('flags missing gate_checks', () => {
    const a = valid();
    delete a.gate_checks;
    expect(codes(a)).toContain('TSVC-001');
  });

  it('flags a missing type', () => {
    const a = valid();
    delete a.type;
    expect(codes(a)).toContain('TSVC-001');
  });
});

describe('validateTechnologyService — TSVC-002 (type enum)', () => {
  it('flags a type outside the allowed enum', () => {
    expect(codes({ ...valid(), type: 'queue' })).toContain('TSVC-002');
    expect(codes({ ...valid(), type: 'event_streaming' })).toContain('TSVC-002');
    expect(codes({ ...valid(), type: 'cache' })).toContain('TSVC-002');
  });

  it('does not flag a missing type with TSVC-002 (TSVC-001 fires instead)', () => {
    const a = valid();
    delete a.type;
    expect(codes(a)).not.toContain('TSVC-002');
    expect(codes(a)).toContain('TSVC-001');
  });
});

describe('validateTechnologyService — TSVC-003 (node grammar)', () => {
  it('flags a node reference that is not a NODE-… id', () => {
    expect(codes({ ...valid(), node: 'ACTOR-OPS-1' })).toContain('TSVC-003');
    expect(codes({ ...valid(), node: 'not-an-id' })).toContain('TSVC-003');
    expect(codes({ ...valid(), node: 'NODE-001' })).toContain('TSVC-003');
  });

  it('accepts a null or absent node without error', () => {
    expect(codes({ ...valid(), node: undefined })).not.toContain('TSVC-003');
    const a = valid();
    delete a.node;
    expect(codes(a)).not.toContain('TSVC-003');
  });

  it('accepts a well-formed NODE-… id', () => {
    expect(codes({ ...valid(), node: 'NODE-KAFKA-HOST-1' })).not.toContain('TSVC-003');
    expect(codes({ ...valid(), node: 'NODE-K8S-CLUSTER-1' })).not.toContain('TSVC-003');
  });
});
