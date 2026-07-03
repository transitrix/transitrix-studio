import { describe, it, expect } from 'vitest';
import { buildComplianceIndex } from '../reverse-index.js';
import { buildRequirementTrace, buildTraceElementCatalog } from '../trace.js';
import type { ComplianceIndexInput } from '../types.js';
import type { ComplianceCodexDoc } from '../classify.js';

// Requirement traceability + hierarchy view.
//
// The two halves the view exposes:
//   1. Trace chain — derived_from → REQUIREMENT → ASSERTION → subject +
//      realised_via.
//   2. Hierarchy — parent chain + children via the `parent` field
//      (15-requirement.md §2.4 / ELEMENT_PRIMITIVES.md §7.13).

const input: ComplianceIndexInput = {
  requirements: [
    // A broad legislative parent decomposed into two child requirements.
    { id: 'REQUIREMENT-DATA-PROTECTION-1', name: 'Personal-data protection', origin: 'legislative', derived_from: ['REGULATION-GDPR-2016-1'], element_kind: 'requirement' },
    { id: 'REQUIREMENT-DATA-ERASURE-1',    name: 'Erase on request within 30 days', origin: 'legislative', parent: 'REQUIREMENT-DATA-PROTECTION-1', derived_from: ['REGULATION-GDPR-2016-1'], element_kind: 'requirement' },
    { id: 'REQUIREMENT-DATA-CONSENT-1',    name: 'Obtain consent before processing', origin: 'legislative', parent: 'REQUIREMENT-DATA-PROTECTION-1', element_kind: 'requirement' },
    // A process-product sub-requirement below the erasure duty (cross-origin).
    { id: 'REQUIREMENT-ERASURE-SLA-1',     name: 'Erasure SOP — 30d target', origin: 'process-product', parent: 'REQUIREMENT-DATA-ERASURE-1', element_kind: 'requirement' },
    // Constraint hierarchy (mirror pattern).
    { id: 'CONSTRAINT-EEA-TRANSFER-1',     name: 'No transfer outside EEA without safeguards', element_kind: 'constraint' },
    { id: 'CONSTRAINT-EEA-ANALYTICS-1',    name: 'No PII in analytics logs', parent: 'CONSTRAINT-EEA-TRANSFER-1', element_kind: 'constraint' },
    // Internal-only requirement — no source, no parent — for the empty-case sanity check.
    { id: 'REQUIREMENT-INTERNAL-1',        name: 'Internal-only', element_kind: 'requirement' },
  ],
  assertions: [
    { id: 'ASSERTION-1', about: 'REQUIREMENT-DATA-ERASURE-1', subject: 'PRODUCT-MOBILE-1', realised_via: ['CAPABILITY-V1', 'PROCESS-PURGE-1'], status: 'compliant' },
    { id: 'ASSERTION-2', about: 'REQUIREMENT-DATA-ERASURE-1', subject: 'PRODUCT-WEB-1',    status: 'partial' },
    { id: 'ASSERTION-3', about: 'REQUIREMENT-DATA-CONSENT-1', subject: 'PRODUCT-WEB-1',    status: 'compliant' },
  ],
};

const codex: ComplianceCodexDoc[] = [
  { id: 'REGULATION-GDPR-2016-1', name: 'GDPR', type: 'REGULATION', jurisdiction: 'EU' },
];

const catalog = buildTraceElementCatalog(
  [{ id: 'PRODUCT-MOBILE-1', name: 'Mobile app' }, { id: 'PRODUCT-WEB-1', name: 'Web app' }],
  [{ id: 'CAPABILITY-V1', name: 'Erasure capability v1' }, { id: 'PROCESS-PURGE-1', name: 'Purge process' }],
);

describe('buildComplianceIndex — requirementsByParent', () => {
  const idx = buildComplianceIndex(input);
  it('groups children of the same parent', () => {
    const children = idx.requirementsByParent.get('REQUIREMENT-DATA-PROTECTION-1');
    expect(children?.map(r => r.id).sort()).toEqual(['REQUIREMENT-DATA-CONSENT-1', 'REQUIREMENT-DATA-ERASURE-1']);
  });
  it('groups CONSTRAINT children the same way (element_kind-agnostic)', () => {
    const children = idx.requirementsByParent.get('CONSTRAINT-EEA-TRANSFER-1');
    expect(children?.map(r => r.id)).toEqual(['CONSTRAINT-EEA-ANALYTICS-1']);
  });
  it('returns undefined for a leaf with no children', () => {
    expect(idx.requirementsByParent.has('REQUIREMENT-INTERNAL-1')).toBe(false);
  });
});

describe('buildRequirementTrace — trace chain', () => {
  const idx = buildComplianceIndex(input);
  it('resolves derived_from codex artefacts on the sources block', () => {
    const trace = buildRequirementTrace('REQUIREMENT-DATA-ERASURE-1', idx, catalog, codex);
    expect(trace.sources).toHaveLength(1);
    expect(trace.sources[0].id).toBe('REGULATION-GDPR-2016-1');
    expect(trace.sources[0].codex?.jurisdiction).toBe('EU');
  });
  it('keeps a dangling derived_from ref with no codex when the artefact is missing', () => {
    const local: ComplianceIndexInput = {
      requirements: [{ id: 'REQUIREMENT-X-1', name: 'X', derived_from: ['LAW-MISSING-1'] }],
      assertions: [],
    };
    const trace = buildRequirementTrace('REQUIREMENT-X-1', buildComplianceIndex(local), catalog);
    expect(trace.sources).toEqual([{ id: 'LAW-MISSING-1' }]);
  });
  it('lists ASSERTIONs id-sorted, each with resolved subject + realised_via names', () => {
    const trace = buildRequirementTrace('REQUIREMENT-DATA-ERASURE-1', idx, catalog, codex);
    expect(trace.assertions.map(a => a.assertion.id)).toEqual(['ASSERTION-1', 'ASSERTION-2']);
    expect(trace.assertions[0].subject).toEqual({ id: 'PRODUCT-MOBILE-1', name: 'Mobile app' });
    expect(trace.assertions[0].realisedVia.map(r => r.name)).toEqual(['Erasure capability v1', 'Purge process']);
  });
  it('returns an empty assertions list for a REQUIREMENT with no filed claim', () => {
    const trace = buildRequirementTrace('REQUIREMENT-DATA-PROTECTION-1', idx, catalog);
    expect(trace.assertions).toEqual([]);
  });
  it('returns an empty assertions list for a CONSTRAINT (16-assertion.md §1 — CONSTRAINT-side out of v1)', () => {
    const trace = buildRequirementTrace('CONSTRAINT-EEA-TRANSFER-1', idx, catalog);
    expect(trace.assertions).toEqual([]);
  });
  it('falls back to id when the subject / realised_via element is not in the catalog (dangling ref)', () => {
    const local: ComplianceIndexInput = {
      requirements: [{ id: 'REQUIREMENT-Y-1', name: 'Y' }],
      assertions: [{ id: 'ASSERTION-9', about: 'REQUIREMENT-Y-1', subject: 'PRODUCT-GONE-1', realised_via: ['CAPABILITY-GONE-1'], status: 'n_a' }],
    };
    const trace = buildRequirementTrace('REQUIREMENT-Y-1', buildComplianceIndex(local), catalog);
    expect(trace.assertions[0].subject).toEqual({ id: 'PRODUCT-GONE-1' });
    expect(trace.assertions[0].realisedVia).toEqual([{ id: 'CAPABILITY-GONE-1' }]);
  });
});

describe('buildRequirementTrace — hierarchy', () => {
  const idx = buildComplianceIndex(input);
  it('walks ancestors: immediate parent first, root last', () => {
    const trace = buildRequirementTrace('REQUIREMENT-ERASURE-SLA-1', idx, catalog);
    expect(trace.ancestors.map(r => r.id)).toEqual([
      'REQUIREMENT-DATA-ERASURE-1',
      'REQUIREMENT-DATA-PROTECTION-1',
    ]);
  });
  it('lists direct children id-sorted', () => {
    const trace = buildRequirementTrace('REQUIREMENT-DATA-PROTECTION-1', idx, catalog);
    expect(trace.children.map(r => r.id)).toEqual([
      'REQUIREMENT-DATA-CONSENT-1',
      'REQUIREMENT-DATA-ERASURE-1',
    ]);
  });
  it('handles a top-level requirement (no ancestors) with no children', () => {
    const trace = buildRequirementTrace('REQUIREMENT-INTERNAL-1', idx, catalog);
    expect(trace.ancestors).toEqual([]);
    expect(trace.children).toEqual([]);
  });
  it('supports CONSTRAINT hierarchy the same way', () => {
    const trace = buildRequirementTrace('CONSTRAINT-EEA-ANALYTICS-1', idx, catalog);
    expect(trace.ancestors.map(r => r.id)).toEqual(['CONSTRAINT-EEA-TRANSFER-1']);
  });
  it('terminates at a missing parent without throwing (broken model)', () => {
    const local: ComplianceIndexInput = {
      requirements: [{ id: 'REQUIREMENT-ORPHAN-1', name: 'Orphan', parent: 'REQUIREMENT-GONE-1' }],
      assertions: [],
    };
    const trace = buildRequirementTrace('REQUIREMENT-ORPHAN-1', buildComplianceIndex(local), catalog);
    expect(trace.ancestors).toEqual([]);
  });
  it('breaks a parent cycle rather than looping', () => {
    // A → B → A (misauthored).
    const local: ComplianceIndexInput = {
      requirements: [
        { id: 'REQUIREMENT-A-1', name: 'A', parent: 'REQUIREMENT-B-1' },
        { id: 'REQUIREMENT-B-1', name: 'B', parent: 'REQUIREMENT-A-1' },
      ],
      assertions: [],
    };
    const trace = buildRequirementTrace('REQUIREMENT-A-1', buildComplianceIndex(local), catalog);
    expect(trace.ancestors.map(r => r.id)).toEqual(['REQUIREMENT-B-1']);
  });
});

describe('buildRequirementTrace — dangling target', () => {
  it('returns a stub carrying the id as name when the requirement is not scanned', () => {
    const trace = buildRequirementTrace('REQUIREMENT-UNKNOWN-1', buildComplianceIndex({ requirements: [], assertions: [] }), catalog);
    expect(trace.requirement).toEqual({ id: 'REQUIREMENT-UNKNOWN-1', name: 'REQUIREMENT-UNKNOWN-1' });
    expect(trace.sources).toEqual([]);
    expect(trace.assertions).toEqual([]);
    expect(trace.ancestors).toEqual([]);
    expect(trace.children).toEqual([]);
  });
});
