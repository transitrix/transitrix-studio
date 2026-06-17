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
    const r = parseCoverageMetricConfig({ view: { name: 'x' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.includes('id'))).toBe(true);
  });

  it('parses minimal config via view: wrapper', () => {
    const r = parseCoverageMetricConfig({
      view: { id: 'CM-1', name: 'Test' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.id).toBe('CM-1');
      expect(r.config.name).toBe('Test');
      expect(r.config.thresholds.green).toBe(0.8);
      expect(r.config.thresholds.amber).toBe(0.5);
      expect(r.config.regimes).toBeUndefined();
    }
  });

  it('parses view: wrapper with regimes.include and subjects', () => {
    const r = parseCoverageMetricConfig({
      view: {
        id: 'CM-2',
        name: 'EU Coverage',
        description: 'desc',
        regimes: { include: ['LAW-GDPR-1'] },
        subjects: { products: ['PRODUCT-1'] },
        thresholds: { green: 0.9, amber: 0.6 },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.regimes?.include).toEqual(['LAW-GDPR-1']);
      expect(r.config.subjects?.products).toEqual(['PRODUCT-1']);
      expect(r.config.thresholds.green).toBe(0.9);
      expect(r.config.thresholds.amber).toBe(0.6);
      expect(r.config.warnings).toBeUndefined();
    }
  });

  it('parses view: wrapper with regimes.filter', () => {
    const r = parseCoverageMetricConfig({
      view: {
        id: 'CM-3',
        name: 'EU Filter',
        regimes: { filter: { jurisdiction: ['EU'], codex_type: ['regulation'] } },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.regimes?.filter?.jurisdiction).toEqual(['EU']);
      expect(r.config.regimes?.filter?.codex_type).toEqual(['regulation']);
      expect(r.config.regimes?.include).toBeUndefined();
    }
  });

  it('warns COVMET-007 when both regimes.include and regimes.filter are set', () => {
    const r = parseCoverageMetricConfig({
      view: {
        id: 'CM-4',
        name: 'Both',
        regimes: {
          include: ['LAW-GDPR-1'],
          filter: { jurisdiction: ['EU'] },
        },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.warnings?.some(w => w.includes('COVMET-007'))).toBe(true);
    }
  });

  it('accepts bare (unwrapped) object without wrapper warning', () => {
    const r = parseCoverageMetricConfig({ id: 'CM-5', name: 'Bare' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.warnings?.some(w => w.includes('COVMET-DEPRECATED'))).toBeFalsy();
    }
  });

  // ── Backward compatibility: deprecated coverage_metric: wrapper ──────────────

  it('accepts deprecated coverage_metric: wrapper with COVMET-DEPRECATED warning', () => {
    const r = parseCoverageMetricConfig({
      coverage_metric: { id: 'CM-6', name: 'Legacy' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.warnings?.some(w => w.includes('COVMET-DEPRECATED'))).toBe(true);
    }
  });

  it('maps deprecated scope.codex to regimes.include', () => {
    const r = parseCoverageMetricConfig({
      coverage_metric: {
        id: 'CM-7',
        name: 'Legacy Scope',
        scope: {
          codex: ['LAW-GDPR-1', 'LAW-NIS2-1'],
          subjects: { products: ['PRODUCT-1'] },
        },
        thresholds: { green: 0.9, amber: 0.6 },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.regimes?.include).toEqual(['LAW-GDPR-1', 'LAW-NIS2-1']);
      expect(r.config.subjects?.products).toEqual(['PRODUCT-1']);
      expect(r.config.thresholds.green).toBe(0.9);
    }
  });
});

// ── buildCoverageMatrix ───────────────────────────────────────────────────────

function makeCanon(): ComplianceCanon {
  const canon = emptyCanon();
  ingestComplianceDoc(canon, { id: 'LAW-GDPR-1', name: 'GDPR', zone: 'codex', jurisdiction: 'EU' });
  ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQ-1', name: 'Lawful basis', derived_from: ['LAW-GDPR-1'] });
  ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQ-2', name: 'Data minimisation', derived_from: ['LAW-GDPR-1'] });
  ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQ-3', name: 'Breach notification', derived_from: ['LAW-GDPR-1'] });
  ingestComplianceDoc(canon, { notation: 'product', id: 'PRODUCT-1', name: 'E-commerce' });
  ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-1', about: 'REQ-1', subject: 'PRODUCT-1', status: 'compliant' });
  ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-2', about: 'REQ-2', subject: 'PRODUCT-1', status: 'partial' });
  // REQ-3 has no assertion → gap
  return canon;
}

function makeConfig(overrides?: Partial<CoverageMetricConfig>): CoverageMetricConfig {
  return {
    id: 'CM-TEST-1',
    name: 'Test Coverage',
    regimes: { include: ['LAW-GDPR-1'] },
    subjects: { products: ['PRODUCT-1'] },
    thresholds: { green: 0.8, amber: 0.5 },
    ...overrides,
  };
}

describe('buildCoverageMatrix', () => {
  it('returns correct row counts', () => {
    const matrix = buildCoverageMatrix(makeCanon(), makeConfig());
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
    const row = buildCoverageMatrix(makeCanon(), makeConfig()).rows[0];
    expect(row.coveragePct).toBeCloseTo(2 / 3, 5);
  });

  it('assigns amber RAG status for ~67% coverage with green=0.80, amber=0.50', () => {
    expect(buildCoverageMatrix(makeCanon(), makeConfig()).rows[0].ragStatus).toBe('amber');
  });

  it('assigns green RAG when all requirements covered', () => {
    const canon = makeCanon();
    ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-3', about: 'REQ-3', subject: 'PRODUCT-1', status: 'compliant' });
    const matrix = buildCoverageMatrix(canon, makeConfig());
    expect(matrix.rows[0].ragStatus).toBe('green');
    expect(matrix.rows[0].coveragePct).toBe(1);
  });

  it('assigns red RAG when coverage < amber threshold', () => {
    const matrix = buildCoverageMatrix(makeCanon(), makeConfig({ thresholds: { green: 0.9, amber: 0.8 } }));
    expect(matrix.rows[0].ragStatus).toBe('red');
  });

  it('returns no_data when codex has no requirements', () => {
    const canon = emptyCanon();
    ingestComplianceDoc(canon, { id: 'LAW-EMPTY-1', name: 'Empty Law', zone: 'codex', jurisdiction: 'XX' });
    const matrix = buildCoverageMatrix(canon, makeConfig({ regimes: { include: ['LAW-EMPTY-1'] } }));
    expect(matrix.rows[0].ragStatus).toBe('no_data');
    expect(matrix.rows[0].totalRequirements).toBe(0);
  });

  it('includes jurisdiction from scanned canon', () => {
    expect(buildCoverageMatrix(makeCanon(), makeConfig()).rows[0].jurisdiction).toBe('EU');
  });

  it('handles multiple codex entries via regimes.include', () => {
    const canon = makeCanon();
    ingestComplianceDoc(canon, { id: 'LAW-NIS2-1', name: 'NIS2', zone: 'codex', jurisdiction: 'EU' });
    ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQ-NIS-1', name: 'Incident reporting', derived_from: ['LAW-NIS2-1'] });
    const matrix = buildCoverageMatrix(canon, makeConfig({ regimes: { include: ['LAW-GDPR-1', 'LAW-NIS2-1'] } }));
    expect(matrix.rows).toHaveLength(2);
    expect(matrix.rows[1].codexId).toBe('LAW-NIS2-1');
    expect(matrix.rows[1].gap).toBe(1);
  });

  it('respects product scope — ignores assertions for other products', () => {
    const canon = makeCanon();
    ingestComplianceDoc(canon, { notation: 'product', id: 'PRODUCT-2', name: 'Support' });
    ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-OUT', about: 'REQ-3', subject: 'PRODUCT-2', status: 'compliant' });
    const matrix = buildCoverageMatrix(canon, makeConfig({
      regimes: { include: ['LAW-GDPR-1'] },
      subjects: { products: ['PRODUCT-1'] },
    }));
    expect(matrix.rows[0].gap).toBe(1);
  });

  it('counts non_compliant separately', () => {
    const canon = makeCanon();
    ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-FAIL', about: 'REQ-3', subject: 'PRODUCT-1', status: 'non_compliant' });
    const matrix = buildCoverageMatrix(canon, makeConfig());
    expect(matrix.rows[0].non_compliant).toBe(1);
    expect(matrix.rows[0].gap).toBe(0);
    expect(matrix.rows[0].coveredCount).toBe(2);
  });

  it('counts pending_owner separately and does not include it in coveredCount', () => {
    const canon = makeCanon();
    ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-PO', about: 'REQ-3', subject: 'PRODUCT-1', status: 'pending_owner', owner_to_confirm: 'alice' });
    const matrix = buildCoverageMatrix(canon, makeConfig());
    expect(matrix.rows[0].pending_owner).toBe(1);
    expect(matrix.rows[0].gap).toBe(0);
    expect(matrix.rows[0].coveredCount).toBe(2);
  });

  // ── regimes.filter ───────────────────────────────────────────────────────────

  it('resolves codex via regimes.filter.jurisdiction', () => {
    const canon = makeCanon();
    ingestComplianceDoc(canon, { id: 'LAW-CCPA-1', name: 'CCPA', zone: 'codex', jurisdiction: 'US' });
    // regimes.filter: only EU laws → should return LAW-GDPR-1 only
    const matrix = buildCoverageMatrix(canon, makeConfig({
      regimes: { filter: { jurisdiction: ['EU'] } },
    }));
    expect(matrix.rows.every(r => r.codexId !== 'LAW-CCPA-1')).toBe(true);
    expect(matrix.rows.some(r => r.codexId === 'LAW-GDPR-1')).toBe(true);
  });

  it('resolves codex via regimes.filter.codex_type', () => {
    const canon = emptyCanon();
    ingestComplianceDoc(canon, { id: 'LAW-A', name: 'Regulation A', zone: 'codex', type: 'regulation' });
    ingestComplianceDoc(canon, { id: 'LAW-B', name: 'Standard B', zone: 'codex', type: 'standard' });
    const matrix = buildCoverageMatrix(canon, makeConfig({
      regimes: { filter: { codex_type: ['regulation'] } },
    }));
    expect(matrix.rows.map(r => r.codexId)).toEqual(['LAW-A']);
  });

  // ── Zero-config: all canon codex entries ─────────────────────────────────────

  it('zero-config (no regimes) enumerates all canon codex', () => {
    const canon = makeCanon();
    ingestComplianceDoc(canon, { id: 'LAW-NIS2-1', name: 'NIS2', zone: 'codex', jurisdiction: 'EU' });
    const matrix = buildCoverageMatrix(canon, makeConfig({ regimes: undefined }));
    expect(matrix.rows.map(r => r.codexId)).toContain('LAW-GDPR-1');
    expect(matrix.rows.map(r => r.codexId)).toContain('LAW-NIS2-1');
  });

  // ── Backward compat: deprecated config still produces correct matrix ─────────

  it('deprecated scope.codex via parseCoverageMetricConfig maps to correct matrix', () => {
    const r = parseCoverageMetricConfig({
      coverage_metric: {
        id: 'CM-LEGACY',
        name: 'Legacy',
        scope: {
          codex: ['LAW-GDPR-1'],
          subjects: { products: ['PRODUCT-1'] },
        },
        thresholds: { green: 0.8, amber: 0.5 },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const matrix = buildCoverageMatrix(makeCanon(), r.config);
      expect(matrix.rows).toHaveLength(1);
      expect(matrix.rows[0].codexId).toBe('LAW-GDPR-1');
      expect(matrix.rows[0].coveredCount).toBe(2);
    }
  });
});
