// Compliance-impact matrix derivation + markdown renderer
// (vkgeorgia/strategy#166 — interim renderer; CV-1 view-config wiring
// per strategy#84 decomposition refresh).
//
// Implements the render contract from
// methodology/notations/views/21-compliance-impact.md §5 at the coarsest grain
// (`product` columns × `obligation` rows). Stage / task grouping is planned
// for CV-3a and intentionally out of scope here.

import type { AssertionStatus } from '../assertion/types.js';
import type { ComplianceCanon } from './classify.js';
import { buildComplianceIndex } from './reverse-index.js';
import type { ComplianceIndex, IndexAssertion, IndexRequirement } from './types.js';

/** Filter selecting REQUIREMENTs by codex source (jurisdiction / regime keys
 *  are accepted for forward compatibility but not yet honoured — the canon
 *  projection does not carry those fields). */
export interface ImpactObligationFilter {
  derived_from_codex?: string[];
}

export interface ImpactSubjects {
  products?: string[];
  processes?: string[];
}

export interface ImpactStatusDisplay {
  show?: AssertionStatus[];
}

export interface ImpactEmptyCellLabels {
  /** Label used when no admitted ASSERTION binds the cell (modelling gap). */
  no_obligation_label?: string;
  /** Label used when an admitted ASSERTION exists with status `n_a`
   *  (modelled fact: the obligation does not apply). */
  no_obligation_applies_label?: string;
}

/**
 * Named, versioned view-config — the report *definition*.
 *
 * A saved view config is the source of truth for a deterministic report run:
 * given the same config + canon, `buildImpactMatrix` always produces the
 * same matrix. Configs are stored in YAML files (top-level `view:` key) and
 * referenced by `id`.
 *
 * `snapshot_at` (ISO 8601 date) records when the report was last generated.
 * CV-3 blueprint-lane rendering uses it to mark obligations that appeared in
 * the canon *after* the snapshot as "new" (dashed-border cell decoration).
 */
export interface ImpactViewConfig {
  id: string;
  name: string;
  description?: string;
  /**
   * ISO 8601 date of the last report snapshot (YYYY-MM-DD).
   * Populated automatically by the CLI on each run and stored back to the
   * view-config file, giving CV-3 its "new since last run" signal.
   */
  snapshot_at?: string;
  subjects: ImpactSubjects;
  obligations: {
    include?: string[];
    filter?: ImpactObligationFilter;
  };
  status_display?: ImpactStatusDisplay;
  empty_cells?: ImpactEmptyCellLabels;
  order_rows_by?: 'id' | 'name';
}

// ── Pinned defaults ─────────────────────────────────────────────────────────

/**
 * Explicit defaults for every optional field in ImpactViewConfig.
 *
 * When a view config omits a field, COMPLIANCE_IMPACT_DEFAULTS defines the
 * assumed behaviour. The CLI prints these so re-runs without a full config
 * are auditable ("what I assumed").
 */
export const COMPLIANCE_IMPACT_DEFAULTS = {
  /** Accept all four active statuses + n_a in cell aggregation. */
  status_display: {
    show: ['compliant', 'partial', 'non_compliant', 'under_review', 'n_a'] as AssertionStatus[],
  },
  /** Order rows by canonical REQUIREMENT ID (lexicographic). */
  order_rows_by: 'id' as const,
  /** §5.3 empty-cell labels. */
  empty_cells: {
    no_obligation_label: 'No mapped obligation (current model)',
    no_obligation_applies_label: 'No obligation applies',
  },
  /** Obligation scope: all known REQUIREMENTs in the canon (no filter). */
  obligations: { include: undefined as string[] | undefined, filter: undefined },
  /** Subjects: empty — must be supplied explicitly in the view config. */
  subjects: { products: [] as string[], processes: [] as string[] },
} as const;

// ── View-config parser ──────────────────────────────────────────────────────

export type ParseImpactViewConfigResult =
  | { ok: true; config: ImpactViewConfig }
  | { ok: false; errors: string[] };

/**
 * Validate and normalise a raw (YAML-parsed) value into an ImpactViewConfig.
 *
 * Accepts both the bare config object and the view-config file shape
 * (`{ view: { id, name, … } }`) — the top-level `view:` wrapper is unwrapped
 * automatically.
 *
 * Every optional field is filled from COMPLIANCE_IMPACT_DEFAULTS, so callers
 * can rely on the returned config being complete without any `??` chains.
 *
 * Returns `{ ok: false, errors }` on schema violations rather than throwing,
 * so the CLI can surface a clean error message without a stack trace.
 */
export function parseImpactViewConfig(raw: unknown): ParseImpactViewConfigResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['view config: expected an object at the document root'] };
  }
  const top = raw as Record<string, unknown>;

  // Unwrap optional `view:` wrapper (view-config YAML files use this key).
  const v: Record<string, unknown> =
    'view' in top && top.view && typeof top.view === 'object' && !Array.isArray(top.view)
      ? (top.view as Record<string, unknown>)
      : top;

  const errors: string[] = [];
  if (!v.id || typeof v.id !== 'string') errors.push('view.id: required string');
  if (!v.name || typeof v.name !== 'string') errors.push('view.name: required string');
  if (v.subjects !== undefined && (typeof v.subjects !== 'object' || Array.isArray(v.subjects))) {
    errors.push('view.subjects: expected an object');
  }
  if (errors.length) return { ok: false, errors };

  const subjects =
    v.subjects && typeof v.subjects === 'object' && !Array.isArray(v.subjects)
      ? (v.subjects as Record<string, unknown>)
      : {};
  const obligations =
    v.obligations && typeof v.obligations === 'object' && !Array.isArray(v.obligations)
      ? (v.obligations as Record<string, unknown>)
      : {};
  const obFilter =
    obligations.filter && typeof obligations.filter === 'object' && !Array.isArray(obligations.filter)
      ? (obligations.filter as Record<string, unknown>)
      : null;
  const statusDisplay =
    v.status_display && typeof v.status_display === 'object' && !Array.isArray(v.status_display)
      ? (v.status_display as Record<string, unknown>)
      : {};
  const emptyCells =
    v.empty_cells && typeof v.empty_cells === 'object' && !Array.isArray(v.empty_cells)
      ? (v.empty_cells as Record<string, unknown>)
      : {};

  const config: ImpactViewConfig = {
    id: v.id as string,
    name: v.name as string,
    description: typeof v.description === 'string' ? v.description : undefined,
    snapshot_at: typeof v.snapshot_at === 'string' ? v.snapshot_at : undefined,
    subjects: {
      products: Array.isArray(subjects.products)
        ? (subjects.products as unknown[]).filter((x): x is string => typeof x === 'string')
        : [...COMPLIANCE_IMPACT_DEFAULTS.subjects.products],
      processes: Array.isArray(subjects.processes)
        ? (subjects.processes as unknown[]).filter((x): x is string => typeof x === 'string')
        : [...COMPLIANCE_IMPACT_DEFAULTS.subjects.processes],
    },
    obligations: {
      include: Array.isArray(obligations.include)
        ? (obligations.include as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined,
      filter: obFilter
        ? {
            derived_from_codex: Array.isArray(obFilter.derived_from_codex)
              ? (obFilter.derived_from_codex as unknown[]).filter((x): x is string => typeof x === 'string')
              : undefined,
          }
        : undefined,
    },
    status_display: {
      show: Array.isArray(statusDisplay.show)
        ? (statusDisplay.show as unknown[]).filter((x): x is AssertionStatus => typeof x === 'string')
        : [...COMPLIANCE_IMPACT_DEFAULTS.status_display.show],
    },
    empty_cells: {
      no_obligation_label:
        typeof emptyCells.no_obligation_label === 'string'
          ? emptyCells.no_obligation_label
          : COMPLIANCE_IMPACT_DEFAULTS.empty_cells.no_obligation_label,
      no_obligation_applies_label:
        typeof emptyCells.no_obligation_applies_label === 'string'
          ? emptyCells.no_obligation_applies_label
          : COMPLIANCE_IMPACT_DEFAULTS.empty_cells.no_obligation_applies_label,
    },
    order_rows_by: v.order_rows_by === 'name' ? 'name' : COMPLIANCE_IMPACT_DEFAULTS.order_rows_by,
  };

  return { ok: true, config };
}

/** A single cell of the rendered matrix. */
export interface ImpactCell {
  /** Resolved status when an ASSERTION binds the cell, else null. */
  status: AssertionStatus | null;
  /** Empty-cell condition per §5.3 — one of:
   *  - `bound`   : at least one admitted ASSERTION binds the cell; `status` is set.
   *  - `n_a_only`: every binding ASSERTION has status `n_a` (modelled fact).
   *  - `gap`     : no admitted ASSERTION binds the cell (modelling gap). */
  kind: 'bound' | 'n_a_only' | 'gap';
  /** The assertions that contributed to this cell, id-sorted. */
  assertions: IndexAssertion[];
}

export interface ImpactMatrix {
  viewId: string;
  viewName: string;
  description?: string;
  /**
   * ISO 8601 date of the last report snapshot, copied from the view config.
   * CV-3 blueprint-lane rendering uses this to flag obligations that appeared
   * after the snapshot as "new" (dashed-border cell decoration).
   */
  snapshotAt?: string;
  /** Row dimension — REQUIREMENT projections, in the configured order. */
  rows: IndexRequirement[];
  /** Column dimension — subject IDs (PRODUCT ids in the coarsest grain). */
  columns: string[];
  /** Cells, indexed as `cell[rowIdx][colIdx]`. */
  cells: ImpactCell[][];
  /** Canonical empty-cell labels actually used (after defaults applied). */
  emptyLabels: Required<ImpactEmptyCellLabels>;
}

const DEFAULT_NO_OBLIGATION_LABEL = 'No mapped obligation (current model)';
const DEFAULT_NO_OBLIGATION_APPLIES_LABEL = 'No obligation applies';

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function resolveObligations(
  config: ImpactViewConfig,
  index: ComplianceIndex,
  allRequirements: IndexRequirement[],
): IndexRequirement[] {
  // `include` wins over `filter` per §4 (and COMPIMP-007).
  if (config.obligations.include?.length) {
    const out: IndexRequirement[] = [];
    for (const id of config.obligations.include) {
      const r = index.requirementById.get(id);
      if (r) out.push(r);
    }
    return out;
  }
  const codices = config.obligations.filter?.derived_from_codex ?? [];
  if (codices.length === 0) return [...allRequirements].sort(byId);
  const seen = new Set<string>();
  const out: IndexRequirement[] = [];
  for (const codex of codices) {
    for (const r of index.requirementsByLaw.get(codex) ?? []) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        out.push(r);
      }
    }
  }
  return out;
}

function orderRows(rows: IndexRequirement[], key: 'id' | 'name' | undefined): IndexRequirement[] {
  const sorted = [...rows];
  if (key === 'name') {
    sorted.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } else {
    sorted.sort(byId);
  }
  return sorted;
}

/** Aggregate multiple matching assertions into one cell value, per §5.2 step 4.
 *  Assumes at least one assertion matches an allowed status; caller filters. */
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

/**
 * Build the matrix per §5.2 at the `product` × `obligation` grain.
 *
 * Subjects are taken from `config.subjects.products` and
 * `config.subjects.processes` directly (in that order; no PRODUCT→PROCESS
 * derivation walk yet — that needs a `realises` index out of scope here).
 * Subjects with no binding obligation still appear as columns so the gap is
 * visible. Rows are the resolved obligations, ordered per `order_rows_by`.
 */
export function buildImpactMatrix(canon: ComplianceCanon, config: ImpactViewConfig): ImpactMatrix {
  const index = buildComplianceIndex({
    requirements: canon.requirements,
    assertions: canon.assertions,
  });

  const obligations = orderRows(resolveObligations(config, index, canon.requirements), config.order_rows_by);

  const products = config.subjects.products ?? [];
  const processes = config.subjects.processes ?? [];
  const columns = [...products, ...processes];

  const allowedStatuses = new Set<AssertionStatus>(
    config.status_display?.show ?? ['compliant', 'partial', 'non_compliant', 'under_review', 'n_a'],
  );

  const rowIndex = new Set(obligations.map(r => r.id));
  const cells: ImpactCell[][] = obligations.map(() => columns.map(() => emptyCell()));

  // Walk the assertions index per subject and fill cells whose obligation is in scope.
  for (let c = 0; c < columns.length; c++) {
    const subject = columns[c];
    const subjectAssertions = index.assertionsBySubject.get(subject) ?? [];
    for (const a of subjectAssertions) {
      if (!rowIndex.has(a.about)) continue;
      if (!allowedStatuses.has(a.status)) continue;
      const rowIdx = obligations.findIndex(r => r.id === a.about);
      if (rowIdx < 0) continue;
      cells[rowIdx][c].assertions.push(a);
    }
  }

  // Resolve each cell to a status / kind.
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      const cell = cells[r][c];
      cell.assertions.sort(byId);
      if (cell.assertions.length === 0) {
        cell.kind = 'gap';
        cell.status = null;
        continue;
      }
      if (cell.assertions.every(a => a.status === 'n_a')) {
        cell.kind = 'n_a_only';
        cell.status = 'n_a';
        continue;
      }
      cell.kind = 'bound';
      cell.status = aggregateStatus(cell.assertions);
    }
  }

  return {
    viewId: config.id,
    viewName: config.name,
    description: config.description,
    snapshotAt: config.snapshot_at,
    rows: obligations,
    columns,
    cells,
    emptyLabels: {
      no_obligation_label: config.empty_cells?.no_obligation_label ?? DEFAULT_NO_OBLIGATION_LABEL,
      no_obligation_applies_label:
        config.empty_cells?.no_obligation_applies_label ?? DEFAULT_NO_OBLIGATION_APPLIES_LABEL,
    },
  };
}

function emptyCell(): ImpactCell {
  return { status: null, kind: 'gap', assertions: [] };
}

// ── Markdown rendering ──────────────────────────────────────────────────────

const STATUS_GLYPH: Record<AssertionStatus, string> = {
  compliant: 'OK',
  partial: 'PARTIAL',
  non_compliant: 'FAIL',
  under_review: 'REVIEW',
  n_a: 'N/A',
};

function escMd(s: string): string {
  return s.replace(/\|/g, '\\|');
}

/**
 * Render the matrix as a GitHub-flavoured markdown table.
 *
 * Cell display:
 *   - `bound`    → the §5.2 deterministic status label.
 *   - `n_a_only` → the "No obligation applies" label (or `view.empty_cells`
 *                  override).
 *   - `gap`      → the "No mapped obligation (current model)" label (or
 *                  override).
 */
export function renderImpactMarkdown(matrix: ImpactMatrix): string {
  const lines: string[] = [];
  lines.push(`# ${matrix.viewName}`);
  lines.push('');
  lines.push(`View ID: \`${matrix.viewId}\``);
  if (matrix.snapshotAt) lines.push(`Report snapshot: ${matrix.snapshotAt}`);
  if (matrix.description) {
    lines.push('');
    lines.push(matrix.description);
  }
  lines.push('');

  if (matrix.rows.length === 0) {
    lines.push('_No obligations in scope — the configured filter / include selected zero REQUIREMENTs._');
    return lines.join('\n') + '\n';
  }
  if (matrix.columns.length === 0) {
    lines.push('_No subjects in scope — `view.subjects` is empty._');
    return lines.join('\n') + '\n';
  }

  const header = ['Obligation', ...matrix.columns.map(escMd)];
  lines.push('| ' + header.join(' | ') + ' |');
  lines.push('|' + header.map(() => '---').join('|') + '|');

  for (let r = 0; r < matrix.rows.length; r++) {
    const row = matrix.rows[r];
    const rowLabel = `${row.id}${row.name && row.name !== row.id ? ` — ${row.name}` : ''}`;
    const cells = matrix.cells[r].map(cell => renderCell(cell, matrix.emptyLabels));
    lines.push('| ' + [escMd(rowLabel), ...cells].join(' | ') + ' |');
  }

  // Legend — the §5.3 distinction must be visible in the rendered output.
  lines.push('');
  lines.push('## Legend');
  lines.push('');
  lines.push('- **OK / PARTIAL / FAIL / REVIEW / N/A** — aggregated `ASSERTION.status` per §5.2.');
  lines.push(`- **${escMd(matrix.emptyLabels.no_obligation_label)}** — modelling gap; no admitted ASSERTION binds this (obligation, subject) pair.`);
  lines.push(`- **${escMd(matrix.emptyLabels.no_obligation_applies_label)}** — modelled fact; an admitted ASSERTION with status \`n_a\` excludes this pair.`);

  return lines.join('\n') + '\n';
}

function renderCell(cell: ImpactCell, labels: Required<ImpactEmptyCellLabels>): string {
  if (cell.kind === 'gap') return escMd(labels.no_obligation_label);
  if (cell.kind === 'n_a_only') return escMd(labels.no_obligation_applies_label);
  return STATUS_GLYPH[cell.status as AssertionStatus];
}
