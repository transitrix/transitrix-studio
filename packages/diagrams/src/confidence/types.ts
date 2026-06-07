// Confidence-scoring types per methodology CONTRACT §11 (Confidence and
// freshness). Two independent signals — source trust (authored, fixed) and
// freshness (derived, recomputed on read) — combined per element and rolled
// up to a view composite. See packages/diagrams/src/confidence/score.ts for
// the pure scoring functions.

/** Closed source-trust scale per CONTRACT §11.2. */
export type SourceQuality =
  | 'authoritative'
  | 'corroborated'
  | 'single_source'
  | 'unverified';

/** Confidence band per CONTRACT §11.6 — derived from a numeric confidence. */
export type ConfidenceBand = 'A' | 'B' | 'C' | 'D';

/** Per-TYPE freshness-decay parameters per CONTRACT §11.3. */
export interface DecayParams {
  fresh_days: number;
  stale_days: number;
  floor: number;
}

/**
 * Adopter-manifest `confidence_decay` block (MANIFEST.md §2). Both halves
 * are optional: an absent `defaults` block falls back to the §11.3 implicit
 * defaults, and an absent `by_type` entry inherits from `defaults`.
 */
export interface ConfidenceDecayConfig {
  defaults?: Partial<DecayParams>;
  by_type?: Record<string, Partial<DecayParams>>;
}

/**
 * One canonical element fed to the scorer. The caller (Studio / DSM) has
 * already resolved `derived_from` to the field artefacts and extracted their
 * `source_quality` labels — this module never reads files.
 */
export interface ScoringElement {
  /** Element TYPE name, used to look up per-TYPE decay (e.g. `CAPABILITY`). */
  type: string;
  /**
   * ISO 8601 date the admission gate last ran for this element
   * (`admitted_at`, CONTRACT §6). Reaffirmation bumps this date — the cure
   * for staleness. Absent ⇒ treated as fully stale (freshness = floor).
   */
  admitted_at?: string;
  /**
   * Source qualities resolved from `derived_from` — one entry per cited
   * field artefact. Undefined or empty ⇒ unsourced: scored as `unverified`
   * (0.25) and counted separately per §11.5.
   */
  sources?: SourceQuality[];
}

/** Per-element scoring output. */
export interface ElementScore {
  /** Max source-trust weight over `sources`; 0.25 (`unverified`) if unsourced. */
  source_trust: number;
  /** Freshness in [floor, 1.0] per the §11.3 curve. */
  freshness: number;
  /** `source_trust × freshness`. */
  confidence: number;
  /**
   * True iff at least one resolvable `derived_from` source was supplied.
   * Drives the §11.5 "counted separately" gap signal and view coverage.
   */
  sourced: boolean;
}

/**
 * View-level composite per CONTRACT §11.6. Three numbers surfaced alongside
 * the view's formation date; the headline `band` is the band of the
 * weakest link.
 */
export interface ViewComposite {
  /** `min(confidence)` over the rendered elements. The headline figure. */
  weakest_link: number;
  /** Arithmetic mean of `confidence` (equal element weight in v1). */
  mean: number;
  /** Fraction of elements with `sourced === true`. */
  coverage: number;
  /** Band of the weakest link. */
  band: ConfidenceBand;
  element_count: number;
  /** Elements with no resolvable `derived_from` — `unsourced_count` / `element_count` is the gap. */
  unsourced_count: number;
}

/** Full scorer output: per-element + composite, plus the `today` used. */
export interface ViewScore {
  elements: ElementScore[];
  composite: ViewComposite;
  /** The date used as `today` (the reference for `age_days`). */
  today: string;
}
