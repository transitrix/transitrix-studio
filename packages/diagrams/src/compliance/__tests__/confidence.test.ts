// Bridge from the compliance index projections to the DQ-1 confidence module
// (vkgeorgia/strategy#162 — DQ-2). Pins that:
//   • element TYPEs lift to REQUIREMENT / ASSERTION (decay lookup keys),
//   • admitted_at flows through to the freshness curve,
//   • the §11.6 header line matches the spec example shape,
//   • an empty view suppresses the header (caller-controlled).

import { describe, it, expect } from 'vitest';
import {
  assertionToScoringElement,
  complianceConfidenceHeader,
  requirementToScoringElement,
  scoreComplianceView,
} from '../confidence.js';
import type { IndexAssertion, IndexRequirement } from '../types.js';

const req = (over: Partial<IndexRequirement> = {}): IndexRequirement => ({
  id: 'REQUIREMENT-1', name: 'R', admitted_at: '2026-05-01', ...over,
});
const ass = (over: Partial<IndexAssertion> = {}): IndexAssertion => ({
  id: 'ASSERTION-1', about: 'REQUIREMENT-1', subject: 'PRODUCT-1',
  status: 'compliant', admitted_at: '2026-05-01', ...over,
});

describe('requirementToScoringElement / assertionToScoringElement', () => {
  it('lifts the index projection to a ScoringElement', () => {
    expect(requirementToScoringElement(req())).toEqual({
      type: 'REQUIREMENT', admitted_at: '2026-05-01',
    });
    expect(assertionToScoringElement(ass())).toEqual({
      type: 'ASSERTION', admitted_at: '2026-05-01',
    });
  });

  it('leaves sources undefined — v1 has no field-zone provenance to resolve', () => {
    // Documents the §11.5 behaviour: until DSM/Studio ingest field-zone
    // source_quality, every element scores unsourced and is counted separately.
    expect(requirementToScoringElement(req()).sources).toBeUndefined();
    expect(assertionToScoringElement(ass()).sources).toBeUndefined();
  });

  it('preserves an absent admitted_at as undefined', () => {
    expect(requirementToScoringElement(req({ admitted_at: undefined })).admitted_at).toBeUndefined();
  });
});

describe('scoreComplianceView', () => {
  it('scores the union of requirements + assertions and reports today', () => {
    const v = scoreComplianceView([req()], [ass()], '2026-06-07');
    expect(v.today).toBe('2026-06-07');
    expect(v.elements).toHaveLength(2);
    expect(v.composite.element_count).toBe(2);
    // Two fresh elements (37 days old, ≤ implicit fresh_days=180) → freshness=1.0,
    // but no sources → source_trust=0.25 floor → confidence=0.25, band D.
    for (const e of v.elements) {
      expect(e.freshness).toBe(1.0);
      expect(e.source_trust).toBe(0.25);
      expect(e.confidence).toBe(0.25);
      expect(e.sourced).toBe(false);
    }
    expect(v.composite.band).toBe('D');
    expect(v.composite.coverage).toBe(0);
    expect(v.composite.unsourced_count).toBe(2);
  });

  it('returns the degenerate composite for an empty view', () => {
    const v = scoreComplianceView([], [], '2026-06-07');
    expect(v.composite.element_count).toBe(0);
    expect(v.elements).toHaveLength(0);
  });

  it('honours per-TYPE decay overrides from the manifest config', () => {
    // ASSERTION decays faster than REQUIREMENT — exercise the by_type lookup.
    const v = scoreComplianceView(
      [req({ admitted_at: '2025-01-01' })],
      [ass({ admitted_at: '2025-01-01' })],
      '2026-06-07',
      {
        by_type: {
          REQUIREMENT: { fresh_days: 1000, stale_days: 2000, floor: 0.5 },
          ASSERTION:   { fresh_days: 30,   stale_days: 60,   floor: 0.1 },
        },
      },
    );
    // Requirement is still well within fresh_days=1000 → freshness 1.0.
    expect(v.elements[0].freshness).toBe(1.0);
    // Assertion is well past stale_days=60 → freshness floors at 0.1.
    expect(v.elements[1].freshness).toBeCloseTo(0.1, 10);
  });
});

describe('complianceConfidenceHeader', () => {
  it('formats the §11.6 example shape and returns empty for an empty view', () => {
    expect(complianceConfidenceHeader([], [], '2026-06-07')).toBe('');
    const line = complianceConfidenceHeader([req()], [ass()], '2026-06-07');
    expect(line).toMatch(/^Data confidence \(as of 2026-06-07\): D \(weakest link\) · 0\.25 mean · 0% sourced$/);
  });
});
