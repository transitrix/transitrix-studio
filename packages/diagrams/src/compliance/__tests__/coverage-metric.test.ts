import { describe, it, expect } from 'vitest';
import {
  parseCoverageMetricConfig,
  buildCoverageMatrix,
  type CoverageMetricConfig,
} from '../coverage-metric.js';
import { emptyCanon, ingestComplianceDoc } from '../classify.js';
import type { ComplianceCanon } from '../classify.js';

// ── parseCoverageMetricConfig ─────────────────────────────────────────────────

describe('parseCoverageMetricConfig', () => {
  it('rejects null', () => {
    const r = parseCoverageMetricConfig(null);
    expect(r.ok).toBe(false);
  });

  it('rejects missing id', () => {
    const r = parseCoverageMetricConfig({ coverage_metric: { name: 'x' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.includes('id'))).toBe(true);
  });

  it('parses minimal config', () => {
    const r = parseCoverageMetricConfig({
      coverage_metric: {
        id: 'CM-1',
        name: 'Test',
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.id).toBe('CM-1');
      expect(r.config.name).toBe('Test');
      expect(r.config.thresholds.green).toBe(0.8);
      expect(r.config.thresholds.amber).toBe(0.5);
    }
  });

  it('parses full config with scope and thresholds', () => {
    const r = parseCoverageMetricConfig({
      coverage_metric: {
        id: 'CM-2',
        name: 'EU Coverage',
        description: 'desc',
        scope: {
          jurisdictions: ['EU'],
          codex: ['LAW-GDPR-1'],
          subjects: { products: ['PRODUCT-1'] },
        },
        thresholds: { green: 0.9, amber: 0.6 },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.scope.codex).toEqual(['LAW-GDPR-1']);
      expect(r.config.scope.subjects?.products).toEqual(['PRODUCT-1']);
      expect(r.config.thresholds.green).toBe(0.9);
      expect(r.config.thresholds.amber).toBe(0.6);
    }
  });

  it('accepts bare (unwrapped) object', () => {
    const r = parseCoverageMetricConfig({ id: 'CM-3', name: 'Bare' });
    expect(r.ok).toBe(true);
  });
});

// ── buildCoverageMatrix ───────────────────────────────────────────────────────

function makeCanon(): ComplianceCanon {
  const canon = emptyCanon();
  // Codex: GDPR law
  ingestComplianceDoc(canon, { id: 'LAW-GDPR-1', name: 'GDPR', zone: 'codex', jurisdiction: 'EU' });
  // Requirements
  ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQ-1', name: 'Lawful basis', derived_from: ['LAW-GDPR-1'] });
  ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQ-2', name: 'Data minimisation', derived_from: ['LAW-GDPR-1'] });
  ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQ-3', name: 'Breach notification', derived_from: ['LAW-GDPR-1'] });
  // Products
  ingestComplianceDoc(canon, { notation: 'product', id: 'PRODUCT-1', name: 'E-commerce' });
  // Assertions
  ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-1', about: 'REQ-1', subject: 'PRODUCT-1', status: 'compliant' });
  ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-2', about: 'REQ-2', subject: 'PRODUCT-1', status: 'partial' });
  // REQ-3 has no assertion → gap
  return canon;
}

function makeConfig(overrides?: Partial<CoverageMetricConfig>): CoverageMetricConfig {
  return {
    id: 'CM-TEST-1',
    name: 'Test Coverage',
    scope: {
      codex: ['LAW-GDPR-1'],
      subjects: { products: ['PRODUCT-1'] },
    },
    thresholds: { green: 0.8, amber: 0.5 },
    ...overrides,
  };
}

describe('buildCoverageMatrix', () => {
  it('returns correct row counts', () => {
    const canon = makeCanon();
    const config = makeConfig();
    const matrix = buildCoverageMatrix(canon, config);

    expect(matrix.rows).toHaveLength(1);
    const row = matrix.rows[0];
    expect(row.codexId).toBe('LAW-GDPR-1');
    expect(row.totalRequirements).toBe(3);
    expect(row.compliant).toBe(1);
    expect(row.partial).toBe(1);
    expect(row.gap).toBe(1);
    expect(row.coveredCount).toBe(2);
  });

  it('computes coverage percentage correctly', () => {
    const matrix = buildCoverageMatrix(makeCanon(), makeConfig());
    const row = matrix.rows[0];
    // 2 covered out of 3 → ~66.7%
    expect(row.coveragePct).toBeCloseTo(2 / 3, 5);
  });

  it('assigns amber RAG status for ~67% coverage with green=0.80, amber=0.50', () => {
    const matrix = buildCoverageMatrix(makeCanon(), makeConfig());
    expect(matrix.rows[0].ragStatus).toBe('amber');
  });

  it('assigns green RAG when all requirements covered', () => {
    const canon = makeCanon();
    // Add assertion for REQ-3 so all 3 are covered
    ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-3', about: 'REQ-3', subject: 'PRODUCT-1', status: 'compliant' });
    const matrix = buildCoverageMatrix(canon, makeConfig());
    expect(matrix.rows[0].ragStatus).toBe('green');
    expect(matrix.rows[0].coveragePct).toBe(1);
  });

  it('assigns red RAG when coverage < amber threshold', () => {
    const matrix = buildCoverageMatrix(makeCanon(), makeConfig({ thresholds: { green: 0.9, amber: 0.8 } }));
    // ~67% < 80% → red
    expect(matrix.rows[0].ragStatus).toBe('red');
  });

  it('returns no_data when codex has no requirements', () => {
    const canon = emptyCanon();
    ingestComplianceDoc(canon, { id: 'LAW-EMPTY-1', name: 'Empty Law', zone: 'codex', jurisdiction: 'XX' });
    const config = makeConfig({ scope: { codex: ['LAW-EMPTY-1'] } });
    const matrix = buildCoverageMatrix(canon, config);
    expect(matrix.rows[0].ragStatus).toBe('no_data');
    expect(matrix.rows[0].totalRequirements).toBe(0);
  });

  it('includes jurisdiction from scanned canon', () => {
    const matrix = buildCoverageMatrix(makeCanon(), makeConfig());
    expect(matrix.rows[0].jurisdiction).toBe('EU');
  });

  it('handles multiple codex entries', () => {
    const canon = makeCanon();
    ingestComplianceDoc(canon, { id: 'LAW-NIS2-1', name: 'NIS2', zone: 'codex', jurisdiction: 'EU' });
    ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQ-NIS-1', name: 'Incident reporting', derived_from: ['LAW-NIS2-1'] });
    const config = makeConfig({ scope: { codex: ['LAW-GDPR-1', 'LAW-NIS2-1'] } });
    const matrix = buildCoverageMatrix(canon, config);
    expect(matrix.rows).toHaveLength(2);
    expect(matrix.rows[1].codexId).toBe('LAW-NIS2-1');
    expect(matrix.rows[1].gap).toBe(1);
  });

  it('respects product scope — ignores assertions for other products', () => {
    const canon = makeCanon();
    // Add another product with compliant assertion for REQ-3
    ingestComplianceDoc(canon, { notation: 'product', id: 'PRODUCT-2', name: 'Support' });
    ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-OUT', about: 'REQ-3', subject: 'PRODUCT-2', status: 'compliant' });
    // config only scopes PRODUCT-1 → REQ-3 should still be a gap
    const matrix = buildCoverageMatrix(canon, makeConfig({ scope: { codex: ['LAW-GDPR-1'], subjects: { products: ['PRODUCT-1'] } } }));
    expect(matrix.rows[0].gap).toBe(1);
  });

  it('counts non_compliant separately', () => {
    const canon = makeCanon();
    ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-FAIL', about: 'REQ-3', subject: 'PRODUCT-1', status: 'non_compliant' });
    const matrix = buildCoverageMatrix(canon, makeConfig());
    expect(matrix.rows[0].non_compliant).toBe(1);
    expect(matrix.rows[0].gap).toBe(0);
    // non_compliant does not count as covered
    expect(matrix.rows[0].coveredCount).toBe(2);
  });
});
