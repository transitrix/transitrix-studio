// Conformance test for the NorthBay Retail EU compliance demo scenario
// (strategy hub #178). Validates that the demo data files load without errors,
// produce the expected matrix shape, and exercise all four compliance statuses.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { buildComplianceIndex } from '../reverse-index.js';
import { buildLawTree, buildProductView } from '../views.js';
import { buildGapReport } from '../gap-report.js';
import { parseImpactViewConfig, buildImpactMatrix } from '../impact.js';
import { emptyCanon, ingestComplianceDoc } from '../classify.js';
import type { IndexAssertion, IndexRequirement, ComplianceIndex } from '../types.js';

const EXAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../examples');

function loadYamlDir(dir: string): Record<string, unknown>[] {
  const full = path.join(EXAMPLES, dir);
  return readdirSync(full)
    .filter(f => f.endsWith('.yaml'))
    .map(f => yaml.load(readFileSync(path.join(full, f), 'utf-8')) as Record<string, unknown>);
}

function loadYamlFile(relPath: string): unknown {
  return yaml.load(readFileSync(path.join(EXAMPLES, relPath), 'utf-8'));
}

// ── Build the demo canon ─────────────────────────────────────────────────────

const requirements: IndexRequirement[] = loadYamlDir('compliance/requirements').map(r => ({
  id: String(r.id),
  name: String(r.name),
  severity: r.severity as string | undefined,
  derived_from: Array.isArray(r.derived_from) ? (r.derived_from as string[]) : undefined,
  deadline: typeof r.deadline === 'string' ? r.deadline : undefined,
}));

const assertions: IndexAssertion[] = loadYamlDir('compliance/assertions').map(a => ({
  id: String(a.id),
  about: String(a.about),
  subject: String(a.subject),
  status: a.status as IndexAssertion['status'],
  realised_via: Array.isArray(a.realised_via) ? (a.realised_via as string[]) : undefined,
  assessed_at: typeof a.assessed_at === 'string' ? a.assessed_at : undefined,
  next_review_at: typeof a.next_review_at === 'string' ? a.next_review_at : undefined,
  evidenceCount: Array.isArray(a.evidence) ? (a.evidence as unknown[]).length : 0,
}));

const index: ComplianceIndex = buildComplianceIndex({ requirements, assertions });

// ── Demo data integrity ──────────────────────────────────────────────────────

describe('demo scenario — data integrity', () => {
  it('loads 5 requirements from the demo scenario', () => {
    expect(requirements).toHaveLength(5);
    const ids = requirements.map(r => r.id).sort();
    expect(ids).toEqual([
      'REQUIREMENT-GDPR-CONSENT-1',
      'REQUIREMENT-GDPR-DATA-ERASURE-1',
      'REQUIREMENT-GDPR-PORTABILITY-1',
      'REQUIREMENT-NIS2-INCIDENT-REPORT-1',
      'REQUIREMENT-NIS2-SUPPLY-CHAIN-1',
    ]);
  });

  it('loads 5 assertions covering all four compliance statuses', () => {
    expect(assertions).toHaveLength(5);
    const statuses = assertions.map(a => a.status).sort();
    expect(statuses).toContain('compliant');
    expect(statuses).toContain('partial');
    expect(statuses).toContain('non_compliant');
    expect(statuses).toContain('under_review');
  });

  it('requirements have deadline fields on 3 of 5', () => {
    const withDeadline = requirements.filter(r => r.deadline != null);
    expect(withDeadline).toHaveLength(3);
    const ids = withDeadline.map(r => r.id).sort();
    expect(ids).toEqual([
      'REQUIREMENT-GDPR-CONSENT-1',
      'REQUIREMENT-GDPR-DATA-ERASURE-1',
      'REQUIREMENT-NIS2-INCIDENT-REPORT-1',
    ]);
  });

  it('REQUIREMENT-GDPR-DATA-ERASURE-1 has a past-due deadline', () => {
    const req = requirements.find(r => r.id === 'REQUIREMENT-GDPR-DATA-ERASURE-1');
    expect(req?.deadline).toBe('2025-12-31');
    // 2025-12-31 is in the past relative to any 2026+ date
    expect(req!.deadline! < '2026-01-01').toBe(true);
  });
});

// ── Single-law trees ─────────────────────────────────────────────────────────

describe('single-law tree — LAW-GDPR-1', () => {
  const tree = buildLawTree('LAW-GDPR-1', index);

  it('has 3 GDPR requirements', () => {
    expect(tree.requirements).toHaveLength(3);
    const ids = tree.requirements.map(r => r.requirement.id).sort();
    expect(ids).toEqual([
      'REQUIREMENT-GDPR-CONSENT-1',
      'REQUIREMENT-GDPR-DATA-ERASURE-1',
      'REQUIREMENT-GDPR-PORTABILITY-1',
    ]);
  });

  it('erasure requirement has 2 assertions (one per product)', () => {
    const erasure = tree.requirements.find(r => r.requirement.id === 'REQUIREMENT-GDPR-DATA-ERASURE-1');
    expect(erasure).toBeDefined();
    expect(erasure!.assertions).toHaveLength(2);
    const statuses = erasure!.assertions.map(a => a.status).sort();
    expect(statuses).toEqual(['compliant', 'non_compliant']);
  });

  it('consent requirement has exactly one partial assertion', () => {
    const consent = tree.requirements.find(r => r.requirement.id === 'REQUIREMENT-GDPR-CONSENT-1');
    expect(consent!.assertions).toHaveLength(1);
    expect(consent!.assertions[0].status).toBe('partial');
  });

  it('portability requirement is compliant', () => {
    const portability = tree.requirements.find(r => r.requirement.id === 'REQUIREMENT-GDPR-PORTABILITY-1');
    expect(portability!.assertions).toHaveLength(1);
    expect(portability!.assertions[0].status).toBe('compliant');
  });
});

describe('single-law tree — LAW-NIS2-1', () => {
  const tree = buildLawTree('LAW-NIS2-1', index);

  it('has 2 NIS2 requirements', () => {
    expect(tree.requirements).toHaveLength(2);
    const ids = tree.requirements.map(r => r.requirement.id).sort();
    expect(ids).toEqual([
      'REQUIREMENT-NIS2-INCIDENT-REPORT-1',
      'REQUIREMENT-NIS2-SUPPLY-CHAIN-1',
    ]);
  });

  it('incident-report requirement has one under_review assertion', () => {
    const incident = tree.requirements.find(r => r.requirement.id === 'REQUIREMENT-NIS2-INCIDENT-REPORT-1');
    expect(incident!.assertions).toHaveLength(1);
    expect(incident!.assertions[0].status).toBe('under_review');
  });

  it('supply-chain requirement has no assertions — deliberate gap', () => {
    const supplyChain = tree.requirements.find(r => r.requirement.id === 'REQUIREMENT-NIS2-SUPPLY-CHAIN-1');
    expect(supplyChain!.assertions).toHaveLength(0);
  });
});

// ── Single-product views ─────────────────────────────────────────────────────

describe('single-product view — PRODUCT-ECOMM-1', () => {
  const view = buildProductView('PRODUCT-ECOMM-1', index);

  it('covers 4 requirements (4 assertions with PRODUCT-ECOMM-1 as subject)', () => {
    expect(view.requirements).toHaveLength(4);
  });

  it('includes non_compliant erasure status', () => {
    const erasure = view.requirements.find(r => r.requirement.id === 'REQUIREMENT-GDPR-DATA-ERASURE-1');
    expect(erasure).toBeDefined();
    expect(erasure!.assertion.status).toBe('non_compliant');
  });
});

describe('single-product view — PRODUCT-SUPPORT-1', () => {
  const view = buildProductView('PRODUCT-SUPPORT-1', index);

  it('has exactly 1 assertion (erasure only)', () => {
    expect(view.requirements).toHaveLength(1);
    expect(view.requirements[0].requirement.id).toBe('REQUIREMENT-GDPR-DATA-ERASURE-1');
    expect(view.requirements[0].assertion.status).toBe('compliant');
  });
});

// ── Gap report ───────────────────────────────────────────────────────────────

describe('gap report', () => {
  const today = '2026-06-10';
  const report = buildGapReport(index, { today });

  it('NIS2 supply-chain requirement appears in requirements-without-assertions', () => {
    const gap = report.requirementsWithoutAssertions.find(
      r => r.id === 'REQUIREMENT-NIS2-SUPPLY-CHAIN-1',
    );
    expect(gap).toBeDefined();
  });

  it('non_compliant erasure requirement is NOT in requirements-without-assertions', () => {
    const gap = report.requirementsWithoutAssertions.find(
      r => r.id === 'REQUIREMENT-GDPR-DATA-ERASURE-1',
    );
    expect(gap).toBeUndefined();
  });

  it('erasure requirement is NOT in pastDeadlineRequirements — it has a compliant assertion for PRODUCT-SUPPORT-1', () => {
    // buildGapReport only surfaces a past-deadline req when ALL its assertions
    // are non-compliant. PRODUCT-SUPPORT-1 has a compliant assertion for erasure,
    // so the requirement is excluded from the past-deadline gap list even though
    // PRODUCT-ECOMM-1 is non_compliant.
    const overdue = report.pastDeadlineRequirements.find(
      r => r.id === 'REQUIREMENT-GDPR-DATA-ERASURE-1',
    );
    expect(overdue).toBeUndefined();
  });
});

// ── Compliance-impact view-config ────────────────────────────────────────────

describe('compliance-impact view-config — gdpr-nis2', () => {
  const raw = loadYamlFile('compliance-impact/gdpr-nis2.compliance-impact.view.yaml');
  const result = parseImpactViewConfig(raw);

  it('parses without errors', () => {
    expect(result.ok).toBe(true);
  });

  it('scopes to PRODUCT-ECOMM-1 and PRODUCT-SUPPORT-1', () => {
    if (!result.ok) throw new Error('parse failed');
    expect(result.config.subjects.products).toEqual(['PRODUCT-ECOMM-1', 'PRODUCT-SUPPORT-1']);
  });

  it('filters obligations to LAW-GDPR-1 and LAW-NIS2-1', () => {
    if (!result.ok) throw new Error('parse failed');
    expect(result.config.obligations.filter?.derived_from_codex).toEqual(['LAW-GDPR-1', 'LAW-NIS2-1']);
  });

  it('builds a matrix with 2 products and 5 requirements scoped to the two laws', () => {
    if (!result.ok) throw new Error('parse failed');

    // Build the canon using ingestComplianceDoc (same path as the Studio extension).
    const canon = emptyCanon();
    for (const r of loadYamlDir('compliance/requirements')) ingestComplianceDoc(canon, r);
    for (const a of loadYamlDir('compliance/assertions')) ingestComplianceDoc(canon, a);
    // Add the two products.
    canon.products.push({ id: 'PRODUCT-ECOMM-1', name: 'E-Commerce Platform' });
    canon.products.push({ id: 'PRODUCT-SUPPORT-1', name: 'Customer Support Service' });

    const matrix = buildImpactMatrix(canon, result.config);
    expect(matrix.columns).toHaveLength(2);
    // 5 requirements are split: 3 GDPR + 2 NIS2 — all 5 should appear.
    expect(matrix.rows).toHaveLength(5);
  });
});

// ── Regression: existing worked examples unaffected ─────────────────────────

describe('regression — existing examples/requirement + examples/assertion unchanged', () => {
  const reqs: IndexRequirement[] = loadYamlDir('requirement').map(r => ({
    id: String(r.id),
    name: String(r.name),
    derived_from: Array.isArray(r.derived_from) ? (r.derived_from as string[]) : undefined,
  }));
  const asns: IndexAssertion[] = loadYamlDir('assertion').map(a => ({
    id: String(a.id),
    about: String(a.about),
    subject: String(a.subject),
    status: a.status as IndexAssertion['status'],
  }));
  const idx = buildComplianceIndex({ requirements: reqs, assertions: asns });

  it('original LAW-PERSONAL-DATA-2017-1 tree still resolves correctly', () => {
    const tree = buildLawTree('LAW-PERSONAL-DATA-2017-1', idx);
    expect(tree.requirements.map(r => r.requirement.id)).toEqual(['REQUIREMENT-DATA-ERASURE-1']);
    expect(tree.requirements[0].assertions).toHaveLength(3);
  });
});
