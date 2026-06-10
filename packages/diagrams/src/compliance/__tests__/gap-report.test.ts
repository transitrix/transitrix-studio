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

const examples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../tests/fixtures/notation-corpus');
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

describe('CV-5 -- pastDeadlineRequirements', () => {
  it('lists requirements with past deadline and no compliant assertion', () => {
    const indexLocal = buildComplianceIndex({
      requirements: [
        { id: 'REQ-PD-1', name: 'Past deadline, no assertion', deadline: '2020-01-01' },
        { id: 'REQ-PD-2', name: 'Past deadline, non-compliant assertion', deadline: '2020-01-01' },
        { id: 'REQ-PD-3', name: 'Past deadline, compliant assertion', deadline: '2020-01-01' },
        { id: 'REQ-FU-1', name: 'Future deadline', deadline: '2099-01-01' },
        { id: 'REQ-ND-1', name: 'No deadline' },
      ],
      assertions: [
        { id: 'ASS-2', about: 'REQ-PD-2', subject: 'S', status: 'non_compliant' },
        { id: 'ASS-3', about: 'REQ-PD-3', subject: 'S', status: 'compliant' },
      ],
    });
    const r = buildGapReport(indexLocal, { today: '2026-06-09' });
    // REQ-PD-1 and REQ-PD-2 are past-deadline without full compliance
    expect(r.pastDeadlineRequirements.map(x => x.id)).toEqual(['REQ-PD-1', 'REQ-PD-2']);
    // REQ-PD-3 has a compliant assertion -> excluded
    expect(r.pastDeadlineRequirements.map(x => x.id)).not.toContain('REQ-PD-3');
    // Future or no deadline -> excluded
    expect(r.pastDeadlineRequirements.map(x => x.id)).not.toContain('REQ-FU-1');
    expect(r.pastDeadlineRequirements.map(x => x.id)).not.toContain('REQ-ND-1');
  });

  it('is empty when no today is supplied (clock-free)', () => {
    const idx2 = buildComplianceIndex({
      requirements: [{ id: 'REQ-PD-1', name: 'Past', deadline: '2020-01-01' }],
      assertions: [],
    });
    expect(buildGapReport(idx2, {}).pastDeadlineRequirements).toEqual([]);
  });

  it('sorts oldest deadline first', () => {
    const idx3 = buildComplianceIndex({
      requirements: [
        { id: 'REQ-A', name: 'A', deadline: '2022-06-01' },
        { id: 'REQ-B', name: 'B', deadline: '2019-01-01' },
      ],
      assertions: [],
    });
    const r3 = buildGapReport(idx3, { today: '2026-06-09' });
    expect(r3.pastDeadlineRequirements.map(x => x.id)).toEqual(['REQ-B', 'REQ-A']);
  });
});