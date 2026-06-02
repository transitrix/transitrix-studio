import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { buildComplianceIndex } from '../reverse-index.js';
import { buildGapReport } from '../gap-report.js';
import type { ComplianceIndexInput, IndexAssertion, IndexRequirement } from '../types.js';

const input: ComplianceIndexInput = {
  requirements: [
    { id: 'REQUIREMENT-A-1', name: 'A', severity: 'high' },   // has assertions
    { id: 'REQUIREMENT-B-1', name: 'B', severity: 'low' },    // orphan
    { id: 'REQUIREMENT-C-1', name: 'C', severity: 'medium' }, // orphan
    { id: 'REQUIREMENT-D-1', name: 'D' },                     // orphan, no severity
  ],
  assertions: [
    { id: 'ASSERTION-1', about: 'REQUIREMENT-A-1', subject: 'PRODUCT-1', status: 'compliant', evidenceCount: 0 }, // 007
    { id: 'ASSERTION-2', about: 'REQUIREMENT-A-1', subject: 'PRODUCT-2', status: 'under_review', evidenceCount: 0 }, // NOT 007
    { id: 'ASSERTION-3', about: 'REQUIREMENT-A-1', subject: 'PRODUCT-3', status: 'partial', evidenceCount: 2, next_review_at: '2025-01-01' }, // stale
  ],
};

describe('buildGapReport', () => {
  const index = buildComplianceIndex(input);
  const report = buildGapReport(index, { today: '2026-06-02' });

  it('lists requirements without assertions, severity-sorted (high→medium→low→none)', () => {
    expect(report.requirementsWithoutAssertions.map(r => r.id)).toEqual([
      'REQUIREMENT-C-1', // medium
      'REQUIREMENT-B-1', // low
      'REQUIREMENT-D-1', // none
    ]);
  });

  it('flags only compliant/partial assertions with empty evidence (ASSERT-007)', () => {
    expect(report.assertionsWithoutEvidence.map(a => a.id)).toEqual(['ASSERTION-1']);
    // under_review with empty evidence is legitimate — not flagged.
    expect(report.assertionsWithoutEvidence.map(a => a.id)).not.toContain('ASSERTION-2');
  });

  it('flags assertions whose next_review_at is past today (ASSERT-008)', () => {
    expect(report.staleAssertions.map(a => a.id)).toEqual(['ASSERTION-3']);
  });

  it('produces no stale list when today is not supplied (clock-free)', () => {
    expect(buildGapReport(index, {}).staleAssertions).toEqual([]);
  });
});

// ── Conformance on the acme_corp worked examples ────────────────────────────

const examples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../examples');
function loadAll(dir: string): Record<string, unknown>[] {
  const full = path.join(examples, dir);
  return readdirSync(full).filter(f => f.endsWith('.yaml')).map(f => yaml.load(readFileSync(path.join(full, f), 'utf-8')) as Record<string, unknown>);
}

describe('gap report — acme_corp worked examples', () => {
  const requirements: IndexRequirement[] = loadAll('requirement').map(r => ({
    id: String(r.id), name: String(r.name), severity: r.severity as string | undefined,
    derived_from: Array.isArray(r.derived_from) ? (r.derived_from as string[]) : undefined,
  }));
  const assertions: IndexAssertion[] = loadAll('assertion').map(a => ({
    id: String(a.id), about: String(a.about), subject: String(a.subject),
    status: a.status as IndexAssertion['status'],
    next_review_at: a.next_review_at as string | undefined,
    evidenceCount: Array.isArray(a.evidence) ? a.evidence.length : 0,
  }));
  const report = buildGapReport(buildComplianceIndex({ requirements, assertions }), { today: '2026-06-02' });

  it('surfaces the internal audit-log requirement as an un-asserted gap', () => {
    expect(report.requirementsWithoutAssertions.map(r => r.id)).toEqual(['REQUIREMENT-AUDIT-LOG-RETENTION-1']);
  });

  it('does not flag the under_review empty-evidence assertion under ASSERT-007', () => {
    expect(report.assertionsWithoutEvidence).toEqual([]);
  });

  it('has no stale assertions (all acme reviews are in the future)', () => {
    expect(report.staleAssertions).toEqual([]);
  });
});
