import { describe, it, expect } from 'vitest';
import { validateNode } from '../validate.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'node',
    id: 'NODE-KAFKA-HOST-1',
    name: 'Kafka Cluster Host',
    type: 'cloud_instance',
    description: 'AWS EC2 auto-scaling group hosting the Kafka broker cluster.',
    provider: 'AWS',
    region: 'eu-central-1',
    zone: 'canon',
    admitted_at: '2026-06-28',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2024-01-01',
    valid_to: null,
  };
}

const codes = (input: unknown): string[] =>
  validateNode(input).errors.map(e => e.code);

describe('validateNode — positive', () => {
  it('accepts a well-formed cloud_instance node with all optional fields', () => {
    const r = validateNode(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts a server node with no optional fields', () => {
    const a = valid();
    a.id = 'NODE-DB-1';
    a.name = 'Primary DB Server';
    a.type = 'server';
    delete a.description;
    delete a.provider;
    delete a.region;
    expect(validateNode(a).valid).toBe(true);
  });

  it('accepts all five type values', () => {
    for (const t of ['server', 'cloud_instance', 'container_platform', 'database_server', 'network_device']) {
      expect(validateNode({ ...valid(), type: t }).valid).toBe(true);
    }
  });

  it('accepts valid_to as a date string', () => {
    expect(validateNode({ ...valid(), valid_to: '2026-12-31' }).valid).toBe(true);
  });
});

describe('validateNode — NOD-001 (shape / id grammar)', () => {
  it('flags a non-object input', () => {
    expect(codes(null)).toEqual(['NOD-001']);
    expect(codes('string')).toEqual(['NOD-001']);
  });

  it('flags an id that violates the grammar', () => {
    expect(codes({ ...valid(), id: 'NODE-001' })).toContain('NOD-001');
    expect(codes({ ...valid(), id: 'NOD-1' })).toContain('NOD-001');
    expect(codes({ ...valid(), id: 'node-kafka-1' })).toContain('NOD-001');
  });

  it('flags a wrong notation tag', () => {
    expect(codes({ ...valid(), notation: 'nodes' })).toContain('NOD-001');
    expect(codes({ ...valid(), notation: 'infrastructure' })).toContain('NOD-001');
  });

  it('flags a non-canon zone', () => {
    expect(codes({ ...valid(), zone: 'sandbox' })).toContain('NOD-001');
  });

  it('flags a missing zone', () => {
    const a = valid();
    delete a.zone;
    expect(codes(a)).toContain('NOD-001');
  });

  it('flags a missing name', () => {
    const a = valid();
    delete a.name;
    expect(codes(a)).toContain('NOD-001');
  });

  it('flags a missing valid_to key', () => {
    const a = valid();
    delete a.valid_to;
    expect(codes(a)).toContain('NOD-001');
  });

  it('flags missing gate_checks', () => {
    const a = valid();
    delete a.gate_checks;
    expect(codes(a)).toContain('NOD-001');
  });

  it('flags a missing type', () => {
    const a = valid();
    delete a.type;
    expect(codes(a)).toContain('NOD-001');
  });
});

describe('validateNode — NOD-002 (type enum)', () => {
  it('flags a type outside the allowed enum', () => {
    expect(codes({ ...valid(), type: 'virtual_machine' })).toContain('NOD-002');
    expect(codes({ ...valid(), type: 'storage' })).toContain('NOD-002');
    expect(codes({ ...valid(), type: 'cluster' })).toContain('NOD-002');
  });

  it('does not flag a missing type with NOD-002 (NOD-001 fires instead)', () => {
    const a = valid();
    delete a.type;
    expect(codes(a)).not.toContain('NOD-002');
    expect(codes(a)).toContain('NOD-001');
  });
});
