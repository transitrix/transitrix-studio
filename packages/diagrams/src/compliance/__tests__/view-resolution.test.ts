import { describe, it, expect } from 'vitest';

import { emptyCanon } from '../classify.js';
import { catalogFromMap } from '../canon-catalog.js';
import { collectImpactViewResolutionFindings } from '../impact.js';
import { collectCoverageViewResolutionFindings } from '../coverage-metric.js';
import type { ImpactViewConfig } from '../impact.js';
import type { CoverageMetricConfig } from '../coverage-metric.js';

const catalog = catalogFromMap(
  new Map([
    ['PRODUCT-ECOMM-1', 'PRODUCT'],
    ['REQUIREMENT-GDPR-1', 'REQUIREMENT'],
    ['LAW-GDPR-1', 'LAW'],
  ]),
);

const complianceCanon = emptyCanon();
complianceCanon.products.push({ id: 'PRODUCT-ECOMM-1', name: 'E-Commerce' });
complianceCanon.requirements.push({ id: 'REQUIREMENT-GDPR-1', name: 'GDPR req' });
complianceCanon.codex.push({ id: 'LAW-GDPR-1', name: 'GDPR' });

describe('collectImpactViewResolutionFindings', () => {
  const base: ImpactViewConfig = {
    id: 'test-impact',
    name: 'Test',
    subjects: { products: ['PRODUCT-ECOMM-1'], processes: [], capabilities: [] },
    obligations: { filter: { derived_from_codex: ['LAW-GDPR-1'] } },
    status_display: { show: ['compliant'] },
    empty_cells: {},
    order_rows_by: 'id',
  };

  it('passes when subjects and regimes resolve', () => {
    expect(collectImpactViewResolutionFindings(base, catalog, complianceCanon)).toEqual([]);
  });

  it('flags unresolved subjects and regimes', () => {
    const findings = collectImpactViewResolutionFindings(
      {
        ...base,
        subjects: { products: ['PRODUCT-MISSING-1'], processes: [], capabilities: [] },
        obligations: { include: ['REQUIREMENT-MISSING-1'], filter: { derived_from_codex: ['LAW-MISSING-1'] } },
      },
      catalog,
      complianceCanon,
    );
    expect(findings.some((f) => f.code === 'COMPIMP-REF' && f.message.includes('PRODUCT-MISSING-1'))).toBe(true);
    expect(findings.some((f) => f.message.includes('REQUIREMENT-MISSING-1'))).toBe(true);
    expect(findings.some((f) => f.message.includes('LAW-MISSING-1'))).toBe(true);
  });
});

describe('collectCoverageViewResolutionFindings', () => {
  const base: CoverageMetricConfig = {
    id: 'test-coverage',
    name: 'Test',
    thresholds: { green: 0.9, amber: 0.7 },
    subjects: { products: ['PRODUCT-ECOMM-1'] },
    regimes: { include: ['LAW-GDPR-1'] },
  };

  it('passes when products and regimes resolve', () => {
    expect(collectCoverageViewResolutionFindings(base, catalog, complianceCanon)).toEqual([]);
  });

  it('flags unresolved product and regime refs', () => {
    const findings = collectCoverageViewResolutionFindings(
      {
        ...base,
        subjects: { products: ['PRODUCT-MISSING-1'] },
        regimes: { include: ['LAW-MISSING-1'] },
      },
      catalog,
      complianceCanon,
    );
    expect(findings.some((f) => f.code === 'COVMET-REF')).toBe(true);
    expect(findings).toHaveLength(2);
  });
});
