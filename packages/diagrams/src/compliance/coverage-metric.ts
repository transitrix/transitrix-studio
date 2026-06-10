// Coverage-metric view renderer — methodology/notations/views/22-coverage-metric.md
//
// Builds a per-codex (law) coverage summary: for each law in scope, how many
// of its requirements are covered by at least one compliant/partial assertion
// across the scoped products, and what is the RAG status against the configured
// thresholds.

import type { AssertionStatus } from '../assertion/types.js';
import type { ComplianceCanon } from './classify.js';
import { buildComplianceIndex } from './reverse-index.js';
import type { IndexAssertion } from './types.js';

// ── Config types ─────────────────────────────────────────────────────────────

export interface CoverageMetricSubjects {
  products?: string[];
}

export interface CoverageMetricScope {
  jurisdictions?: string[];
  codex?: string[];
  subjects?: CoverageMetricSubjects;
}

export interface CoverageMetricThresholds {
  /** Coverage fraction (0–1) at or above which the status is green. */
  green: number;
  /** Coverage fraction at or above which the status is amber (below green). */
  amber: number;
}

export interface CoverageMetricConfig {
  id: string;
  name: string;
  description?: string;
  date?: string;
  version?: string;
  scope: CoverageMetricScope;
  thresholds: CoverageMetricThresholds;
}

export type ParseCoverageMetricResult =
  | { ok: true; config: CoverageMetricConfig }
  | { ok: false; errors: string[] };

// ── Output types ─────────────────────────────────────────────────────────────

export type RagStatus = 'green' | 'amber' | 'red' | 'no_data';

export interface CoverageRow {
  codexId: string;
  /** Jurisdiction from the scanned canon codex doc, if available. */
  jurisdiction?: string;
  totalRequirements: number;
  compliant: number;
  partial: number;
  non_compliant: number;
  under_review: number;
  /** Requirements with no admitted assertion for the scoped products. */
  gap: number;
  /** compliant + partial. */
  coveredCount: number;
  /** coveredCount / totalRequirements (0–1). 0 when totalRequirements === 0. */
  coveragePct: number;
  ragStatus: RagStatus;
}

export interface CoverageMatrix {
  id: string;
  name: string;
  description?: string;
  date?: string;
  version?: string;
  rows: CoverageRow[];
  thresholds: CoverageMetricThresholds;
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Validate and normalise a raw (YAML-parsed) document into a
 * `CoverageMetricConfig`. Accepts both the bare top-level object and the
 * wrapped form (`{ coverage_metric: { … } }`).
 */
export function parseCoverageMetricConfig(raw: unknown): ParseCoverageMetricResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['coverage-metric: expected an object at the document root'] };
  }
  const top = raw as Record<string, unknown>;

  // Unwrap optional `coverage_metric:` wrapper.
  const v: Record<string, unknown> =
    'coverage_metric' in top &&
    top.coverage_metric &&
    typeof top.coverage_metric === 'object' &&
    !Array.isArray(top.coverage_metric)
      ? (top.coverage_metric as Record<string, unknown>)
      : top;

  const errors: string[] = [];
  if (!v.id || typeof v.id !== 'string') errors.push('coverage_metric.id: required string');
  if (!v.name || typeof v.name !== 'string') errors.push('coverage_metric.name: required string');
  if (errors.length) return { ok: false, errors };

  const rawScope =
    v.scope && typeof v.scope === 'object' && !Array.isArray(v.scope)
      ? (v.scope as Record<string, unknown>)
      : {};
  const rawSubjects =
    rawScope.subjects && typeof rawScope.subjects === 'object' && !Array.isArray(rawScope.subjects)
      ? (rawScope.subjects as Record<string, unknown>)
      : {};
  const rawThresholds =
    v.thresholds && typeof v.thresholds === 'object' && !Array.isArray(v.thresholds)
      ? (v.thresholds as Record<string, unknown>)
      : {};

  const greenRaw = typeof rawThresholds.green === 'number' ? rawThresholds.green : 0.8;
  const amberRaw = typeof rawThresholds.amber === 'number' ? rawThresholds.amber : 0.5;

  const config: CoverageMetricConfig = {
    id: v.id as string,
    name: v.name as string,
    description: typeof v.description === 'string' ? v.description : undefined,
    date: typeof v.date === 'string' ? v.date : undefined,
    version: typeof v.version === 'string' ? v.version : undefined,
    scope: {
      jurisdictions: Array.isArray(rawScope.jurisdictions)
        ? (rawScope.jurisdictions as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined,
      codex: Array.isArray(rawScope.codex)
        ? (rawScope.codex as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined,
      subjects: {
        products: Array.isArray(rawSubjects.products)
          ? (rawSubjects.products as unknown[]).filter((x): x is string => typeof x === 'string')
          : undefined,
      },
    },
    thresholds: {
      green: Math.max(0, Math.min(1, greenRaw)),
      amber: Math.max(0, Math.min(1, amberRaw)),
    },
  };

  return { ok: true, config };
}

// ── Builder ───────────────────────────────────────────────────────────────────

const ADMITTED: Set<AssertionStatus> = new Set(['compliant', 'partial', 'non_compliant', 'under_review', 'n_a']);

/** Worst-case aggregate across multiple assertions (excludes n_a when others exist). */
function aggregateStatus(assertions: IndexAssertion[]): AssertionStatus {
  let sawPartial = false;
  let sawUnderReview = false;
  let sawCompliant = false;
  for (const a of assertions) {
    if (a.status === 'non_compliant') return 'non_compliant';
    if (a.status === 'partial') sawPartial = true;
    else if (a.status === 'under_review') sawUnderReview = true;
    else if (a.status === 'compliant') sawCompliant = true;
  }
  if (sawPartial) return 'partial';
  if (sawUnderReview) return 'under_review';
  if (sawCompliant) return 'compliant';
  return 'n_a';
}

function ragFromPct(pct: number, thresholds: CoverageMetricThresholds, hasData: boolean): RagStatus {
  if (!hasData) return 'no_data';
  if (pct >= thresholds.green) return 'green';
  if (pct >= thresholds.amber) return 'amber';
  return 'red';
}

/**
 * Compute per-codex coverage statistics.
 *
 * For each law (codex ID) in `config.scope.codex`:
 *  - Collect requirements whose `derived_from` includes that law.
 *  - Optionally restrict to assertions for `config.scope.subjects.products`.
 *  - Compute compliant / partial / non_compliant / under_review / gap counts.
 *  - Compute coverage % = (compliant + partial) / total and apply RAG.
 */
export function buildCoverageMatrix(
  canon: ComplianceCanon,
  config: CoverageMetricConfig,
): CoverageMatrix {
  const index = buildComplianceIndex({
    requirements: canon.requirements,
    assertions: canon.assertions,
  });

  const codexList = config.scope.codex ?? [];
  const productList = config.scope.subjects?.products ?? [];

  const rows: CoverageRow[] = [];

  for (const codexId of codexList) {
    const reqs = index.requirementsByLaw.get(codexId) ?? [];
    const codexDoc = canon.codex.find(c => c.id === codexId);
    const jurisdiction = codexDoc?.jurisdiction;

    let compliant = 0;
    let partial = 0;
    let non_compliant = 0;
    let under_review = 0;
    let gap = 0;

    for (const req of reqs) {
      const allAssertions = index.assertionsByRequirement.get(req.id) ?? [];

      // Filter to admitted statuses, then optionally to scoped products.
      const admitted = allAssertions.filter(a => ADMITTED.has(a.status));
      const scoped = productList.length > 0
        ? admitted.filter(a => productList.includes(a.subject))
        : admitted;

      // Exclude pure n_a assertions from counting as coverage.
      const active = scoped.filter(a => a.status !== 'n_a');
      if (active.length === 0) {
        gap++;
        continue;
      }

      const status = aggregateStatus(active);
      if (status === 'compliant') compliant++;
      else if (status === 'partial') partial++;
      else if (status === 'non_compliant') non_compliant++;
      else if (status === 'under_review') under_review++;
      else gap++;
    }

    const total = reqs.length;
    const coveredCount = compliant + partial;
    const coveragePct = total > 0 ? coveredCount / total : 0;

    rows.push({
      codexId,
      jurisdiction,
      totalRequirements: total,
      compliant,
      partial,
      non_compliant,
      under_review,
      gap,
      coveredCount,
      coveragePct,
      ragStatus: ragFromPct(coveragePct, config.thresholds, total > 0),
    });
  }

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    date: config.date,
    version: config.version,
    rows,
    thresholds: config.thresholds,
  };
}
