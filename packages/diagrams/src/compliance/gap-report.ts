// Gap dashboard report (vkgeorgia/strategy#84 Phase 4).
//
// Three operational gap lists computed from the shared reverse-index (Phase 3):
//   1. Requirements with no Assertion targeting them (severity-sorted).
//   2. Assertions without evidence — the ASSERT-007 case: status ∈
//      {compliant, partial} AND no evidence. `under_review` / `non_compliant` /
//      `n_a` are NOT positive statuses, so an empty-evidence assertion in those
//      states is legitimate and is not flagged (matches 16-assertion.md §5).
//   3. Stale Assertions — the ASSERT-008 case: `next_review_at` is in the past.

import type { ComplianceIndex, IndexAssertion, IndexRequirement } from './types.js';

export interface GapReport {
  /** Requirements with no assertion about them, severity-sorted then id. */
  requirementsWithoutAssertions: IndexRequirement[];
  /** ASSERT-007: positive status (compliant/partial) with empty evidence. */
  assertionsWithoutEvidence: IndexAssertion[];
  /** ASSERT-008: next_review_at in the past (only when `today` is supplied). */
  staleAssertions: IndexAssertion[];
}

export interface GapReportOptions {
  /** Today as ISO `YYYY-MM-DD`; required for the stale-assertion list. */
  today?: string;
}

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
function severityRank(s?: string): number {
  return s !== undefined && s in SEVERITY_RANK ? SEVERITY_RANK[s] : 3;
}

/** Flattens the by-requirement index back to the full assertion set (each
 *  assertion has exactly one `about`, so it appears once). */
function allAssertions(index: ComplianceIndex): IndexAssertion[] {
  const out: IndexAssertion[] = [];
  for (const list of index.assertionsByRequirement.values()) out.push(...list);
  return out;
}

export function buildGapReport(index: ComplianceIndex, options: GapReportOptions = {}): GapReport {
  const { today } = options;

  const requirementsWithoutAssertions = [...index.requirementById.values()]
    .filter(r => (index.assertionsByRequirement.get(r.id) ?? []).length === 0)
    .sort((a, b) => {
      const d = severityRank(a.severity) - severityRank(b.severity);
      return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const assertions = allAssertions(index);

  const assertionsWithoutEvidence = assertions
    .filter(a => (a.status === 'compliant' || a.status === 'partial') && (a.evidenceCount ?? 0) === 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const staleAssertions = (today
    ? assertions.filter(a => typeof a.next_review_at === 'string' && a.next_review_at < today)
    : []
  ).sort((a, b) => {
    // Oldest review first — most overdue at the top.
    const ra = a.next_review_at ?? '';
    const rb = b.next_review_at ?? '';
    return ra < rb ? -1 : ra > rb ? 1 : a.id < b.id ? -1 : 1;
  });

  return { requirementsWithoutAssertions, assertionsWithoutEvidence, staleAssertions };
}
