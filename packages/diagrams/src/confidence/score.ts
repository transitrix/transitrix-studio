// Pure confidence-scoring per methodology CONTRACT §11. No I/O, no mutation:
// callers (Studio previews, DSM React) pass already-resolved element inputs
// and a `today` reference; this module returns the per-element scores and
// the view composite. Lives in @transitrix/diagrams so Studio and DSM share
// one implementation (see vkgeorgia/strategy#159 — DQ-1).

import type {
  ConfidenceBand,
  ConfidenceDecayConfig,
  DecayParams,
  ElementScore,
  ScoringElement,
  SourceQuality,
  ViewComposite,
  ViewScore,
} from './types.js';

/** §11.3 implicit defaults — used when the adopter omits `confidence_decay`. */
export const IMPLICIT_DECAY_DEFAULTS: DecayParams = {
  fresh_days: 180,
  stale_days: 730,
  floor: 0.3,
};

/** §11.2 source-trust weights. The fallback for an unknown label is `unverified`. */
const SOURCE_TRUST_WEIGHTS: Record<SourceQuality, number> = {
  authoritative: 1.0,
  corroborated: 0.8,
  single_source: 0.5,
  unverified: 0.25,
};

/** Weight for the `unverified` floor — both an explicit label and the unsourced fallback. */
const UNVERIFIED_WEIGHT = SOURCE_TRUST_WEIGHTS.unverified;

export function sourceTrustWeight(q: SourceQuality): number {
  return SOURCE_TRUST_WEIGHTS[q] ?? UNVERIFIED_WEIGHT;
}

/**
 * Resolves the decay parameters for one element TYPE: `by_type[type]` overrides
 * `defaults`, which overrides {@link IMPLICIT_DECAY_DEFAULTS}. Each field
 * resolves independently — a `by_type` entry that sets only `fresh_days` /
 * `stale_days` inherits `floor` from `defaults` (per the §11.3 example).
 */
export function resolveDecayParams(
  type: string,
  config?: ConfidenceDecayConfig,
): DecayParams {
  const typeOverride = config?.by_type?.[type] ?? {};
  const defaults = config?.defaults ?? {};
  return {
    fresh_days: pick(typeOverride.fresh_days, defaults.fresh_days, IMPLICIT_DECAY_DEFAULTS.fresh_days),
    stale_days: pick(typeOverride.stale_days, defaults.stale_days, IMPLICIT_DECAY_DEFAULTS.stale_days),
    floor: pick(typeOverride.floor, defaults.floor, IMPLICIT_DECAY_DEFAULTS.floor),
  };
}

function pick(...values: (number | undefined)[]): number {
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v)) return v;
  // The trailing implicit default is always finite; this is only reached if a
  // caller passes a non-finite implicit default — which we treat as 0.
  return 0;
}

/**
 * Computes freshness per CONTRACT §11.3.
 *
 * ```
 * freshness = 1.0      if age_days ≤ fresh_days
 *           = floor    if age_days ≥ stale_days
 *           = 1.0 − (1.0 − floor) · (age_days − fresh_days) / (stale_days − fresh_days)   otherwise
 * ```
 *
 * Future-dated `admitted_at` (negative age) is clamped to 1.0. An absent or
 * unparseable `admitted_at` returns `floor` — the element is treated as fully
 * stale, never as fresh.
 */
export function freshness(
  admittedAt: string | undefined,
  today: string,
  params: DecayParams,
): number {
  if (!admittedAt) return params.floor;
  const age = daysBetween(admittedAt, today);
  if (age === null) return params.floor;
  if (age <= params.fresh_days) return 1.0;
  if (age >= params.stale_days) return params.floor;
  // Linear interpolation. Guard against a degenerate fresh==stale config: the
  // two equalities above would already have returned, but if a caller passes
  // stale_days < fresh_days we keep monotonic behaviour by returning floor.
  const span = params.stale_days - params.fresh_days;
  if (span <= 0) return params.floor;
  return 1.0 - (1.0 - params.floor) * ((age - params.fresh_days) / span);
}

/**
 * Scores one element per §11.4–11.5. The element's `sources` list is the
 * resolved `derived_from` provenance: max trust wins (`max` in §11.4), and
 * an empty / absent list marks the element unsourced — scored at the
 * `unverified` floor and `sourced: false` so the view composite can count
 * it separately per §11.5.
 */
export function scoreElement(
  element: ScoringElement,
  today: string,
  config?: ConfidenceDecayConfig,
): ElementScore {
  const sources = element.sources ?? [];
  const sourced = sources.length > 0;
  const source_trust = sourced
    ? Math.max(...sources.map(sourceTrustWeight))
    : UNVERIFIED_WEIGHT;
  const params = resolveDecayParams(element.type, config);
  const f = freshness(element.admitted_at, today, params);
  return {
    source_trust,
    freshness: f,
    confidence: source_trust * f,
    sourced,
  };
}

/** Confidence band per §11.6: A ≥ 0.8, B ≥ 0.6, C ≥ 0.4, D < 0.4. */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return 'A';
  if (confidence >= 0.6) return 'B';
  if (confidence >= 0.4) return 'C';
  return 'D';
}

/**
 * Rolls per-element scores up to the view composite per §11.6. The weakest
 * link is the headline; mean and coverage are reported alongside. An empty
 * element set returns a degenerate composite (`weakest_link` and `mean` of 0,
 * coverage 0, band `D`) — callers should detect `element_count === 0` if they
 * want to suppress the header entirely rather than display the floor.
 */
export function composeView(scores: ElementScore[]): ViewComposite {
  if (scores.length === 0) {
    return {
      weakest_link: 0,
      mean: 0,
      coverage: 0,
      band: 'D',
      element_count: 0,
      unsourced_count: 0,
    };
  }
  let min = Infinity;
  let sum = 0;
  let sourcedCount = 0;
  for (const s of scores) {
    if (s.confidence < min) min = s.confidence;
    sum += s.confidence;
    if (s.sourced) sourcedCount += 1;
  }
  const mean = sum / scores.length;
  return {
    weakest_link: min,
    mean,
    coverage: sourcedCount / scores.length,
    band: confidenceBand(min),
    element_count: scores.length,
    unsourced_count: scores.length - sourcedCount,
  };
}

/**
 * Scores a view's elements end-to-end. The caller passes the rendered set,
 * the adopter manifest's `confidence_decay` block (optional), and the
 * reference date (`today`); the result is purely derived and never stored
 * — re-running on the same inputs yields the same numbers (§11.6).
 */
export function scoreView(
  elements: ScoringElement[],
  today: string | Date,
  config?: ConfidenceDecayConfig,
): ViewScore {
  const todayIso = toIsoDate(today);
  const elementScores = elements.map(e => scoreElement(e, todayIso, config));
  return {
    elements: elementScores,
    composite: composeView(elementScores),
    today: todayIso,
  };
}

/**
 * Renders the §11.6 example header line, e.g.:
 *
 * ```
 * Data confidence (as of 2026-06-05): B (weakest link) · 0.71 mean · 92% sourced
 * ```
 *
 * Shared between Studio (DQ-2) and DSM (DQ-5) so the banding/labels stay
 * consistent across the two consumers. Returns an empty string for an empty
 * composite — callers decide whether to suppress the header in that case.
 */
export function formatConfidenceHeader(view: ViewScore): string {
  const c = view.composite;
  if (c.element_count === 0) return '';
  const mean = c.mean.toFixed(2);
  const coverage = Math.round(c.coverage * 100);
  return `Data confidence (as of ${view.today}): ${c.band} (weakest link) · ${mean} mean · ${coverage}% sourced`;
}

// ── Date helpers ────────────────────────────────────────────────────────────

/** Strict ISO-date parser. Accepts `YYYY-MM-DD`; returns null on anything else. */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(s: string): Date | null {
  const m = ISO_DATE_RE.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // UTC to avoid the host TZ shifting age_days by ±1.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) return null;
  return d;
}

function toIsoDate(d: string | Date): string {
  if (typeof d === 'string') return d;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return null;
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
