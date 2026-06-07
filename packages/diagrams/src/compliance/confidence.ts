// Confidence bridge for the compliance views (vkgeorgia/strategy#162 — DQ-2).
// Maps the compliance index projections (IndexRequirement / IndexAssertion) onto
// the DQ-1 ScoringElement shape, scores the view, and renders the §11.6 header
// line. Lives in @transitrix/diagrams so Studio and DSM share one bridge and
// the headline reads the same on both surfaces.

import {
  formatConfidenceHeader,
  scoreView,
} from '../confidence/index.js';
import type {
  ConfidenceDecayConfig,
  ScoringElement,
  ViewScore,
} from '../confidence/index.js';
import type { IndexAssertion, IndexRequirement } from './types.js';

/**
 * Lifts a compliance projection (requirement / assertion) to the DQ-1
 * ScoringElement shape. `sources` is intentionally left undefined here:
 * resolving a canon element's `derived_from` to the source_quality of the
 * cited field artefacts (§11.4) needs the field-zone provenance model
 * that Studio's compliance scan does not yet ingest (the DSM equivalent
 * is escalated as DQ-3/DQ-4/DQ-5 on the strategy hub). Until then the
 * scorer treats every element as unsourced — counted separately per §11.5
 * — so the headline honestly reports `0% sourced` rather than guessing a
 * trust label. The freshness signal is fully wired and remains useful.
 */
export function requirementToScoringElement(r: IndexRequirement): ScoringElement {
  return { type: 'REQUIREMENT', admitted_at: r.admitted_at };
}

export function assertionToScoringElement(a: IndexAssertion): ScoringElement {
  return { type: 'ASSERTION', admitted_at: a.admitted_at };
}

/**
 * Scores a compliance view composed of the given requirements + assertions.
 * Pure / derived per §11.6 — recomputed on read, never stored.
 */
export function scoreComplianceView(
  requirements: IndexRequirement[],
  assertions: IndexAssertion[],
  today: string | Date,
  config?: ConfidenceDecayConfig,
): ViewScore {
  const elements: ScoringElement[] = [
    ...requirements.map(requirementToScoringElement),
    ...assertions.map(assertionToScoringElement),
  ];
  return scoreView(elements, today, config);
}

/**
 * Convenience wrapper — scores the view and formats the §11.6 header line.
 * Returns an empty string for an empty element set so the caller can suppress
 * the header (e.g. a single-law tree with no requirements). Re-exports
 * {@link formatConfidenceHeader} for callers that already hold a `ViewScore`.
 */
export function complianceConfidenceHeader(
  requirements: IndexRequirement[],
  assertions: IndexAssertion[],
  today: string | Date,
  config?: ConfidenceDecayConfig,
): string {
  return formatConfidenceHeader(
    scoreComplianceView(requirements, assertions, today, config),
  );
}
