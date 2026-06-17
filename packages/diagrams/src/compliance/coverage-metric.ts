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

/** Declarative filter resolved at build time from the canon's codex catalogue. */
export interface CoverageMetricRegimesFilter {
  jurisdiction?: string[];
  codex_type?: string[];
}

/**
 * Regime (codex) selection for the coverage view.
 * - `include`: explicit list of codex IDs — takes precedence over `filter`.
 * - `filter`: resolved against the workspace canon at render time.
 * - Omit entirely → all codex artefacts in the canon become regime columns.
 */
export interface CoverageMetricRegimes {
  include?: string[];
  filter?: CoverageMetricRegimesFilter;
}

export interface CoverageMetricSubjects {
  products?: string[];
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
  /** Regime (codex) selection. Absent = all canon codex entries. */
  regimes?: CoverageMetricRegimes;
  /** Products to scope assertions to. Absent = all products. */
  subjects?: CoverageMetricSubjects;
  thresholds: CoverageMetricThresholds;
  /** Non-fatal parse warnings (e.g. deprecated keys). */
  warnings?: string[];
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

function parseRegimes(raw: Record<string, unknown>): { regimes?: CoverageMetricRegimes; warnings: string[] } {
  const warnings: string[] = [];
  const rawR = raw.regimes;
  if (!rawR || typeof rawR !== 'object' || Array.isArray(rawR)) {
    return { regimes: undefined, warnings };
  }
  const r = rawR as Record<string, unknown>;

  const include = Array.isArray(r.include)
    ? (r.include as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;

  const rawF = r.filter;
  const filter =
    rawF && typeof rawF === 'object' && !Array.isArray(rawF)
      ? (() => {
          const f = rawF as Record<string, unknown>;
          return {
            jurisdiction: Array.isArray(f.jurisdiction)
              ? (f.jurisdiction as unknown[]).filter((x): x is string => typeof x === 'string')
              : undefined,
            codex_type: Array.isArray(f.codex_type)
              ? (f.codex_type as unknown[]).filter((x): x is string => typeof x === 'string')
              : undefined,
          };
        })()
      : undefined;

  if (include?.length && filter) {
    warnings.push('COVMET-007: both regimes.include and regimes.filter are set; include takes precedence');
  }

  return { regimes: { include, filter }, warnings };
}

function parseSubjects(raw: Record<string, unknown>): CoverageMetricSubjects | undefined {
  const s = raw.subjects;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return undefined;
  const obj = s as Record<string, unknown>;
  return {
    products: Array.isArray(obj.products)
      ? (obj.products as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined,
  };
}

/**
 * Parse and validate a raw (YAML-parsed) document into a `CoverageMetricConfig`.
 *
 * Accepts:
 * - `{ view: { id, name, regimes, subjects, thresholds } }` — canonical (new spec)
 * - `{ coverage_metric: { … } }` — deprecated; `scope.codex` → `regimes.include`
 * - Bare top-level object — same as deprecated wrapper, no wrapper warning
 */
export function parseCoverageMetricConfig(raw: unknown): ParseCoverageMetricResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['coverage-metric: expected an object at the document root'] };
  }
  const top = raw as Record<string, unknown>;

  const errors: string[] = [];
  const warnings: string[] = [];
  let v: Record<string, unknown>;
  let regimes: CoverageMetricRegimes | undefined;
  let subjects: CoverageMetricSubjects | undefined;

  if ('view' in top && top.view && typeof top.view === 'object' && !Array.isArray(top.view)) {
    // Canonical format: view: { id, name, regimes, subjects, thresholds }
    v = top.view as Record<string, unknown>;
    const parsed = parseRegimes(v);
    regimes = parsed.regimes;
    warnings.push(...parsed.warnings);
    subjects = parseSubjects(v);

  } else if (
    'coverage_metric' in top &&
    top.coverage_metric &&
    typeof top.coverage_metric === 'object' &&
    !Array.isArray(top.coverage_metric)
  ) {
    // Deprecated wrapper: coverage_metric: { scope: { codex, jurisdictions, subjects }, … }
    v = top.coverage_metric as Record<string, unknown>;
    warnings.push('COVMET-DEPRECATED: coverage_metric: wrapper is deprecated; migrate to view:');
    const r = migrateLegacyScope(v);
    regimes = r.regimes;
    subjects = r.subjects;

  } else {
    // Bare object — accept as deprecated shape without extra warning
    v = top;
    const r = migrateLegacyScope(v);
    regimes = r.regimes;
    subjects = r.subjects;
  }

  if (!v.id || typeof v.id !== 'string') errors.push('coverage_metric.id: required string');
  if (!v.name || typeof v.name !== 'string') errors.push('coverage_metric.name: required string');
  if (errors.length) return { ok: false, errors };

  const rawT = v.thresholds;
  const rawThresholds =
    rawT && typeof rawT === 'object' && !Array.isArray(rawT)
      ? (rawT as Record<string, unknown>)
      : {};

  const greenRaw = typeof rawThresholds.green === 'number' ? rawThresholds.green : 0.8;
  const amberRaw = typeof rawThresholds.amber === 'number' ? rawThresholds.amber : 0.5;

  const config: CoverageMetricConfig = {
    id: v.id as string,
    name: v.name as string,
    description: typeof v.description === 'string' ? v.description : undefined,
    date: typeof v.date === 'string' ? v.date : undefined,
    version: typeof v.version === 'string' ? v.version : undefined,
    regimes,
    subjects,
    thresholds: {
      green: Math.max(0, Math.min(1, greenRaw)),
      amber: Math.max(0, Math.min(1, amberRaw)),
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };

  return { ok: true, config };
}

/** Translate old `scope.codex` / `scope.jurisdictions` / `scope.subjects` to new shape. */
function migrateLegacyScope(v: Record<string, unknown>): {
  regimes: CoverageMetricRegimes | undefined;
  subjects: CoverageMetricSubjects | undefined;
} {
  const rawScope =
    v.scope && typeof v.scope === 'object' && !Array.isArray(v.scope)
      ? (v.scope as Record<string, unknown>)
      : {};

  const codexList = Array.isArray(rawScope.codex)
    ? (rawScope.codex as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;
  const jurisdictionList = Array.isArray(rawScope.jurisdictions)
    ? (rawScope.jurisdictions as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;

  let regimes: CoverageMetricRegimes | undefined;
  if (codexList && codexList.length > 0) {
    regimes = { include: codexList };
  } else if (jurisdictionList && jurisdictionList.length > 0) {
    regimes = { filter: { jurisdiction: jurisdictionList } };
  }

  const rawSubjectsObj =
    rawScope.subjects && typeof rawScope.subjects === 'object' && !Array.isArray(rawScope.subjects)
      ? (rawScope.subjects as Record<string, unknown>)
      : {};
  const subjects: CoverageMetricSubjects = {
    products: Array.isArray(rawSubjectsObj.products)
      ? (rawSubjectsObj.products as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined,
  };

  return { regimes, subjects };
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
 * Resolve the ordered list of codex IDs from the config's `regimes` field:
 * - `regimes.include` — explicit list, takes precedence.
 * - `regimes.filter` — resolved against the canon's codex catalogue.
 * - No `regimes` — all codex entries in the canon.
 */
function resolveCodexList(regimes: CoverageMetricRegimes | undefined, canon: ComplianceCanon): string[] {
  if (regimes?.include && regimes.include.length > 0) return regimes.include;
  if (regimes?.filter) {
    let docs = [...canon.codex];
    if (regimes.filter.jurisdiction?.length) {
      const jurs = regimes.filter.jurisdiction;
      docs = docs.filter(c => c.jurisdiction != null && jurs.includes(c.jurisdiction));
    }
    if (regimes.filter.codex_type?.length) {
      const types = regimes.filter.codex_type;
      docs = docs.filter(c => c.type != null && types.includes(c.type));
    }
    return docs.map(c => c.id);
  }
  return canon.codex.map(c => c.id);
}

/**
 * Compute per-codex coverage statistics.
 *
 * For each law (codex ID) resolved from `config.regimes`:
 *  - Collect requirements whose `derived_from` includes that law.
 *  - Optionally restrict to assertions for `config.subjects.products`.
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

  const codexList = resolveCodexList(config.regimes, canon);
  const productList = config.subjects?.products ?? [];

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
      const scoped =
        productList.length > 0 ? admitted.filter(a => productList.includes(a.subject)) : admitted;

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
