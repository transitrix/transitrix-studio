// Pins CONTRACT §11 — source-trust scale, freshness curve, element confidence,
// view composite, unsourced handling, manifest decay resolution, A–D bands.

import { describe, it, expect } from 'vitest';
import {
  IMPLICIT_DECAY_DEFAULTS,
  composeView,
  confidenceBand,
  formatConfidenceHeader,
  freshness,
  resolveDecayParams,
  scoreElement,
  scoreView,
  sourceTrustWeight,
} from '../score.js';
import type { ConfidenceDecayConfig, DecayParams } from '../types.js';

const D: DecayParams = { fresh_days: 100, stale_days: 200, floor: 0.3 };

describe('sourceTrustWeight (§11.2)', () => {
  it('matches the closed scale', () => {
    expect(sourceTrustWeight('authoritative')).toBe(1.0);
    expect(sourceTrustWeight('corroborated')).toBe(0.8);
    expect(sourceTrustWeight('single_source')).toBe(0.5);
    expect(sourceTrustWeight('unverified')).toBe(0.25);
  });
});

describe('freshness (§11.3)', () => {
  const today = '2026-06-05';

  it('returns 1.0 when age ≤ fresh_days', () => {
    expect(freshness('2026-05-01', today, D)).toBe(1.0);
    expect(freshness('2026-06-05', today, D)).toBe(1.0);
  });

  it('returns floor when age ≥ stale_days', () => {
    expect(freshness('2025-01-01', today, D)).toBeCloseTo(0.3, 10);
    const exactlyStale = '2025-11-17';
    expect(freshness(exactlyStale, today, { fresh_days: 100, stale_days: 200, floor: 0.3 })).toBeCloseTo(0.3, 10);
  });

  it('interpolates linearly between fresh_days and stale_days', () => {
    // midpoint: age 150 → 1.0 − (1.0 − 0.3) · (150 − 100) / (200 − 100) = 0.65
    const midAge = new Date(Date.UTC(2026, 5, 5));
    midAge.setUTCDate(midAge.getUTCDate() - 150);
    const iso = midAge.toISOString().slice(0, 10);
    expect(freshness(iso, today, D)).toBeCloseTo(0.65, 10);
  });

  it('clamps future-dated admitted_at to 1.0', () => {
    expect(freshness('2030-01-01', today, D)).toBe(1.0);
  });

  it('treats absent admitted_at as fully stale (returns floor)', () => {
    expect(freshness(undefined, today, D)).toBe(0.3);
  });

  it('treats unparseable admitted_at as fully stale', () => {
    expect(freshness('not-a-date', today, D)).toBe(0.3);
    expect(freshness('2026/06/05', today, D)).toBe(0.3);
    expect(freshness('2026-13-01', today, D)).toBe(0.3);
  });

  it('returns floor when stale_days <= fresh_days (degenerate config) and age exceeds fresh', () => {
    // age 365d for 2025-06-05; both branches collapse to floor.
    expect(freshness('2025-06-05', today, { fresh_days: 100, stale_days: 100, floor: 0.4 })).toBe(0.4);
    expect(freshness('2025-06-05', today, { fresh_days: 200, stale_days: 100, floor: 0.4 })).toBe(0.4);
  });
});

describe('resolveDecayParams (§11.3 + MANIFEST §2)', () => {
  const config: ConfidenceDecayConfig = {
    defaults: { fresh_days: 180, stale_days: 730, floor: 0.3 },
    by_type: {
      CAPABILITY: { fresh_days: 365, stale_days: 1825 },
      APPLICATION: { fresh_days: 180, stale_days: 730 },
    },
  };

  it('uses by_type overrides and inherits missing fields from defaults', () => {
    // Pins the §11.3 example: CAPABILITY overrides fresh/stale but inherits floor=0.3.
    expect(resolveDecayParams('CAPABILITY', config)).toEqual({ fresh_days: 365, stale_days: 1825, floor: 0.3 });
  });

  it('falls back to defaults for an unknown TYPE', () => {
    expect(resolveDecayParams('PROCESS', config)).toEqual({ fresh_days: 180, stale_days: 730, floor: 0.3 });
  });

  it('falls back to §11.3 implicit defaults when the whole block is omitted', () => {
    expect(resolveDecayParams('CAPABILITY', undefined)).toEqual(IMPLICIT_DECAY_DEFAULTS);
    expect(resolveDecayParams('CAPABILITY', {})).toEqual(IMPLICIT_DECAY_DEFAULTS);
  });

  it('fills missing defaults fields from §11.3 implicit defaults', () => {
    const partial: ConfidenceDecayConfig = { defaults: { floor: 0.5 } };
    expect(resolveDecayParams('PROCESS', partial)).toEqual({
      fresh_days: IMPLICIT_DECAY_DEFAULTS.fresh_days,
      stale_days: IMPLICIT_DECAY_DEFAULTS.stale_days,
      floor: 0.5,
    });
  });
});

describe('scoreElement (§11.4–11.5)', () => {
  const today = '2026-06-05';

  it('takes the max source-trust weight (§11.4): extra weak sources never subtract', () => {
    const score = scoreElement(
      { type: 'CAPABILITY', admitted_at: today, sources: ['unverified', 'authoritative', 'single_source'] },
      today,
    );
    expect(score.source_trust).toBe(1.0);
    expect(score.confidence).toBe(1.0);
    expect(score.sourced).toBe(true);
  });

  it('multiplies source_trust by freshness', () => {
    // §11.4 worked example: authoritative · floor.
    const score = scoreElement(
      { type: 'X', admitted_at: '2024-01-01', sources: ['authoritative'] },
      today,
      { defaults: D },
    );
    expect(score.source_trust).toBe(1.0);
    expect(score.freshness).toBeCloseTo(0.3, 10);
    expect(score.confidence).toBeCloseTo(0.3, 10);
  });

  it('marks unsourced elements at the unverified floor (§11.5) and sourced=false', () => {
    const undef = scoreElement({ type: 'X', admitted_at: today }, today);
    const empty = scoreElement({ type: 'X', admitted_at: today, sources: [] }, today);
    for (const score of [undef, empty]) {
      expect(score.source_trust).toBe(0.25);
      expect(score.sourced).toBe(false);
      expect(score.confidence).toBeCloseTo(0.25, 10);
    }
  });

  it('distinguishes unsourced (counted separately) from sourced-but-unverified', () => {
    const unsourced = scoreElement({ type: 'X', admitted_at: today }, today);
    const sourcedUnverified = scoreElement(
      { type: 'X', admitted_at: today, sources: ['unverified'] },
      today,
    );
    expect(unsourced.source_trust).toBe(sourcedUnverified.source_trust);
    expect(unsourced.sourced).toBe(false);
    expect(sourcedUnverified.sourced).toBe(true);
  });
});

describe('confidenceBand (§11.6)', () => {
  it('uses the documented thresholds', () => {
    expect(confidenceBand(1.0)).toBe('A');
    expect(confidenceBand(0.8)).toBe('A');
    expect(confidenceBand(0.79)).toBe('B');
    expect(confidenceBand(0.6)).toBe('B');
    expect(confidenceBand(0.59)).toBe('C');
    expect(confidenceBand(0.4)).toBe('C');
    expect(confidenceBand(0.39)).toBe('D');
    expect(confidenceBand(0)).toBe('D');
  });
});

describe('composeView (§11.6)', () => {
  it('headlines weakest link, reports mean and coverage', () => {
    const composite = composeView([
      { source_trust: 1.0, freshness: 1.0, confidence: 1.0, sourced: true },
      { source_trust: 0.5, freshness: 0.8, confidence: 0.4, sourced: true },
      { source_trust: 0.25, freshness: 1.0, confidence: 0.25, sourced: false },
    ]);
    expect(composite.weakest_link).toBeCloseTo(0.25, 10);
    expect(composite.band).toBe('D');
    expect(composite.mean).toBeCloseTo((1.0 + 0.4 + 0.25) / 3, 10);
    expect(composite.coverage).toBeCloseTo(2 / 3, 10);
    expect(composite.element_count).toBe(3);
    expect(composite.unsourced_count).toBe(1);
  });

  it('returns a degenerate composite (band D, counts 0) for an empty set', () => {
    const composite = composeView([]);
    expect(composite.element_count).toBe(0);
    expect(composite.weakest_link).toBe(0);
    expect(composite.mean).toBe(0);
    expect(composite.coverage).toBe(0);
    expect(composite.band).toBe('D');
  });
});

describe('scoreView end-to-end', () => {
  const today = '2026-06-05';

  it('composes weakest-link / mean / coverage / band from heterogenous elements', () => {
    const view = scoreView(
      [
        // weakest link = 0.50 → band C
        { type: 'X', admitted_at: today, sources: ['authoritative'] },  // 1.00
        { type: 'X', admitted_at: today, sources: ['corroborated'] },   // 0.80
        { type: 'X', admitted_at: today, sources: ['single_source'] },  // 0.50
        { type: 'X', admitted_at: today, sources: ['corroborated'] },   // 0.80
      ],
      today,
    );
    expect(view.composite.weakest_link).toBeCloseTo(0.5, 10);
    expect(view.composite.band).toBe('C');
    expect(view.composite.mean).toBeCloseTo((1.0 + 0.8 + 0.5 + 0.8) / 4, 10);
    expect(view.composite.coverage).toBe(1);
    expect(view.composite.unsourced_count).toBe(0);
    expect(view.today).toBe(today);
  });

  it('accepts Date for today and converts to ISO', () => {
    const view = scoreView(
      [{ type: 'X', admitted_at: '2026-06-05', sources: ['authoritative'] }],
      new Date(Date.UTC(2026, 5, 5)),
    );
    expect(view.today).toBe('2026-06-05');
    expect(view.composite.band).toBe('A');
  });

  it('reports band D and 0% coverage when every element is unsourced and fully stale', () => {
    const view = scoreView(
      [
        { type: 'X' },
        { type: 'X' },
      ],
      '2026-06-05',
      { defaults: D },
    );
    // unsourced (0.25) · freshness floor (0.3) = 0.075 → band D.
    expect(view.composite.coverage).toBe(0);
    expect(view.composite.unsourced_count).toBe(2);
    expect(view.composite.band).toBe('D');
    expect(view.composite.weakest_link).toBeCloseTo(0.075, 10);
  });
});

describe('formatConfidenceHeader (§11.6)', () => {
  it('renders the documented header shape', () => {
    const view = scoreView(
      [{ type: 'X', admitted_at: '2026-06-05', sources: ['corroborated'] }],
      '2026-06-05',
    );
    // corroborated (0.8) · freshness 1.0 = 0.80 → band A (A is ≥ 0.8).
    expect(formatConfidenceHeader(view)).toBe(
      'Data confidence (as of 2026-06-05): A (weakest link) · 0.80 mean · 100% sourced',
    );
  });

  it('returns an empty string for an empty composite', () => {
    const view = scoreView([], '2026-06-05');
    expect(formatConfidenceHeader(view)).toBe('');
  });
});
