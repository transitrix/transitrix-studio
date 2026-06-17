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
import type { ComplianceIndex, IndexAssertion, IndexRequirement, ObjectDetailInput, ObjectDetailDef, DeadlineStatus } from './types.js';

/** Filter selecting REQUIREMENTs by codex source (jurisdiction / regime keys
 *  are accepted for forward compatibility but not yet honoured — the canon
 *  projection does not carry those fields). */
export interface ImpactObligationFilter {
  derived_from_codex?: string[];
}

export interface ImpactSubjects {
  products?: string[];
  processes?: string[];
  capabilities?: string[];
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

// ── Column model (CV-3a) ────────────────────────────────────────────────────

/**
 * A matrix column descriptor.
 *
 * At the coarsest grain (`grouping.columns: 'product'`) a column maps to a
 * single subject: `{ subjectId, label: subjectId }`.
 *
 * At `grouping.columns: 'product-stage'` a column represents one (product,
 * stage) pair: `{ subjectId, stageId, label: subjectId + ':' + stageId }`.
 * A cell is populated when an ASSERTION has `subject === subjectId` and
 * `stageId ∈ assertion.realised_via` (or `realised_via` is absent, meaning
 * the assertion covers the entire subject — it then contributes to every
 * stage column for that subject).
 *
 * At `grouping.columns: 'product-stage-task'` a column represents one
 * (product, stage, task) triple: `{ subjectId, stageId, taskId,
 * label: subjectId + ':' + stageId + ':' + taskId }`. A cell is populated
 * when an ASSERTION's `realised_via` contains the `taskId` directly, OR
 * contains the `stageId` (stage-level claim applies to all tasks in that stage),
 * OR `realised_via` is absent (claim covers the entire subject).
 */
export interface ImpactColumn {
  /** Subject (product / process / capability) the column belongs to. */
  subjectId: string;
  /** Stage ID — present at product-stage and product-stage-task grain. */
  stageId?: string;
  /** Task ID — present only at product-stage-task grain. */
  taskId?: string;
  /** Human-readable column header. */
  label: string;
  /** Display name for the subject (product/process name, not the id). */
  subjectName?: string;
}

/**
 * Grouping options for matrix columns.
 *
 * `columns` controls the column grain (COMPIMP-004 validates the value set):
 *   - `'product'` (default) — one column per subject.
 *   - `'product-stage'`     — one column per (subject, stage) pair; pass
 *     `objectDetails` (from `extractObjectDetails`) into `buildImpactMatrix`.
 *   - `'product-stage-task'` — one column per (subject, stage, task) triple;
 *     pass `objectDetails` with stages that carry `tasks[]` (built via
 *     `extractObjectDetails` + `extractProcessFlowTasks` + `mergeStageTaskDetails`).
 */
export interface ImpactGrouping {
  columns: 'product' | 'product-stage' | 'product-stage-task';
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
  /**
   * Column grouping options.  Omit (or set `columns: 'product'`) for the
   * default single-column-per-subject behaviour.  Set `columns: 'product-stage'`
   * and pass `objectDetails` into `buildImpactMatrix` to expand each subject
   * into per-stage sub-columns.
   */
  grouping?: ImpactGrouping;
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
  /** Accept all active statuses + n_a in cell aggregation. */
  status_display: {
    show: ['compliant', 'partial', 'non_compliant', 'under_review', 'pending_owner', 'n_a'] as AssertionStatus[],
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
  subjects: { products: [] as string[], processes: [] as string[], capabilities: [] as string[] },
  /** Column grain: one column per subject (no stage/task decomposition). */
  grouping: { columns: 'product' as const },
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

  // Parse grouping.columns — accept spec-canonical values plus backward-compat aliases.
  const rawGrouping =
    v.grouping && typeof v.grouping === 'object' && !Array.isArray(v.grouping)
      ? (v.grouping as Record<string, unknown>)
      : null;
  const rawColumns = typeof rawGrouping?.columns === 'string' ? rawGrouping.columns : undefined;
  const VALID_COLUMNS = new Set<string>(['product', 'product-stage', 'product-stage-task']);
  const normalizedColumns: ImpactGrouping['columns'] | undefined =
    rawColumns === 'object-details' ? 'product-stage'   // backward-compat alias
    : rawColumns === 'object' ? 'product'               // backward-compat alias
    : VALID_COLUMNS.has(rawColumns ?? '') ? (rawColumns as ImpactGrouping['columns'])
    : undefined;

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
      capabilities: Array.isArray(subjects.capabilities)
        ? (subjects.capabilities as unknown[]).filter((x): x is string => typeof x === 'string')
        : [...COMPLIANCE_IMPACT_DEFAULTS.subjects.capabilities],
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
    grouping: normalizedColumns !== undefined ? { columns: normalizedColumns } : undefined,
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
  /**
   * CV-3 blueprint-lane decorations.
   *
   * `isNew`    — the row's REQUIREMENT was admitted after the report
   *              `snapshot_at` date (dashed-border decoration).
   * `isUrgent` — the cell is a gap AND the requirement has a deadline
   *              whose temporal status is `past_due` or `in_force`.
   * `deadlineStatus` — temporal distance to the deadline (or `'none'`).
   */
  decoration: {
    isNew: boolean;
    isUrgent: boolean;
    deadlineStatus: DeadlineStatus;
  };
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
  /**
   * Column dimension.
   *
   * At `grouping.columns: 'product'` (default) each entry has only `subjectId`
   * and `label`.  At `'product-stage'` entries additionally carry `stageId`.
   */
  columns: ImpactColumn[];
  /** Cells, indexed as `cell[rowIdx][colIdx]`. */
  cells: ImpactCell[][];
  /** Canonical empty-cell labels actually used (after defaults applied). */
  emptyLabels: Required<ImpactEmptyCellLabels>;
  /**
   * CV-3 derived obligations lane.
   *
   * For each column, the set of codex source IDs (`REQUIREMENT.derived_from`)
   * that appear in at least one non-gap cell in that column.  Renderers use
   * this to display a "laws lane" header above or below the matrix columns.
   * Empty array when no requirement in the column has a `derived_from`.
   */
  obligationsLane: string[][];
}

const DEFAULT_NO_OBLIGATION_LABEL = 'No mapped obligation (current model)';
const DEFAULT_NO_OBLIGATION_APPLIES_LABEL = 'No obligation applies';

// ── Deadline temporal status (CV-3) ─────────────────────────────────────────

/** Number of days within which a deadline is considered "in force" (imminent). */
const IN_FORCE_HORIZON_DAYS = 30;

/**
 * Classify a REQUIREMENT deadline relative to a reference date.
 *
 * @param deadline  ISO 8601 date string (YYYY-MM-DD), or undefined.
 * @param today     Reference date string (YYYY-MM-DD); defaults to today.
 */
export function computeDeadlineStatus(
  deadline: string | undefined,
  today: string = new Date().toISOString().slice(0, 10),
): DeadlineStatus {
  if (!deadline) return 'none';
  if (deadline < today) return 'past_due';
  const daysAway = Math.round(
    (new Date(deadline).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24),
  );
  return daysAway <= IN_FORCE_HORIZON_DAYS ? 'in_force' : 'upcoming';
}

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
 *  Precedence: non_compliant > partial > pending_owner > under_review > compliant > n_a.
 *  Assumes at least one assertion matches an allowed status; caller filters. */
function aggregateStatus(assertions: IndexAssertion[]): AssertionStatus {
  let sawPartial = false;
  let sawPendingOwner = false;
  let sawUnderReview = false;
  let sawCompliant = false;
  for (const a of assertions) {
    if (a.status === 'non_compliant') return 'non_compliant';
    if (a.status === 'partial') sawPartial = true;
    else if (a.status === 'pending_owner') sawPendingOwner = true;
    else if (a.status === 'under_review') sawUnderReview = true;
    else if (a.status === 'compliant') sawCompliant = true;
  }
  if (sawPartial) return 'partial';
  if (sawPendingOwner) return 'pending_owner';
  if (sawUnderReview) return 'under_review';
  if (sawCompliant) return 'compliant';
  return 'n_a';
}

// ── Column builder helpers (CV-3a) ──────────────────────────────────────────

function buildProductColumns(config: ImpactViewConfig, namedItems: { id: string; name: string }[]): ImpactColumn[] {
  const nameMap = new Map(namedItems.map(p => [p.id, p.name]));
  const subjects = [
    ...(config.subjects.products ?? []),
    ...(config.subjects.processes ?? []),
    ...(config.subjects.capabilities ?? []),
  ];
  return subjects.map(id => ({ subjectId: id, label: id, subjectName: nameMap.get(id) }));
}

function buildObjectDetailColumns(config: ImpactViewConfig, objectDetails: ObjectDetailInput[]): ImpactColumn[] {
  const detailMap = new Map<string, ObjectDetailDef[]>(objectDetails.map(d => [d.objectId, d.details]));
  const subjects = [
    ...(config.subjects.products ?? []),
    ...(config.subjects.processes ?? []),
    ...(config.subjects.capabilities ?? []),
  ];
  const cols: ImpactColumn[] = [];
  for (const subjectId of subjects) {
    const details = detailMap.get(subjectId);
    if (!details || details.length === 0) {
      cols.push({ subjectId, label: subjectId });
    } else {
      for (const detail of details) {
        cols.push({ subjectId, stageId: detail.id, label: `${subjectId}:${detail.id}` });
      }
    }
  }
  return cols;
}

/**
 * Build `product-stage-task` columns: one column per (subject, stage, task) triple.
 * Each stage in `objectDetails` that carries a `tasks[]` array is expanded to
 * per-task columns `{ subjectId, stageId, taskId, label: subjectId:stageId:taskId }`.
 * Stages with no tasks fall back to a single stage-grain column.
 */
function buildTaskColumns(config: ImpactViewConfig, objectDetails: ObjectDetailInput[]): ImpactColumn[] {
  const detailMap = new Map<string, ObjectDetailDef[]>(objectDetails.map(d => [d.objectId, d.details]));
  const subjects = [
    ...(config.subjects.products ?? []),
    ...(config.subjects.processes ?? []),
    ...(config.subjects.capabilities ?? []),
  ];
  const cols: ImpactColumn[] = [];
  for (const subjectId of subjects) {
    const stages = detailMap.get(subjectId);
    if (!stages || stages.length === 0) {
      cols.push({ subjectId, label: subjectId });
    } else {
      for (const stage of stages) {
        if (!stage.tasks || stage.tasks.length === 0) {
          // Stage with no tasks: fall back to stage-grain column.
          cols.push({ subjectId, stageId: stage.id, label: `${subjectId}:${stage.id}` });
        } else {
          for (const task of stage.tasks) {
            cols.push({
              subjectId,
              stageId: stage.id,
              taskId: task.id,
              label: `${subjectId}:${stage.id}:${task.id}`,
            });
          }
        }
      }
    }
  }
  return cols;
}

/**
 * Returns true when assertion `a` contributes to column `col`.
 *
 * At `'product'` grain: `a.subject` must match `col.subjectId`.
 * At `'product-stage'` grain: `a.subject` must match AND either
 * `a.realised_via` is absent (claim covers the whole subject) OR
 * `col.stageId` ∈ `a.realised_via`.
 * At `'product-stage-task'` grain: as above for stage, plus `col.taskId` ∈
 * `a.realised_via` counts as a match (task-level claim covers this task column).
 * A stage-level claim (`col.stageId` ∈ `a.realised_via`) covers all task columns
 * in that stage.
 */
function assertionMatchesColumn(a: IndexAssertion, col: ImpactColumn): boolean {
  if (a.subject !== col.subjectId) return false;
  if (!col.stageId) return true;
  if (!a.realised_via || a.realised_via.length === 0) return true;
  if (col.taskId) {
    // Task grain: match on taskId OR on stageId (stage claim covers all tasks).
    return a.realised_via.includes(col.taskId) || a.realised_via.includes(col.stageId);
  }
  return a.realised_via.includes(col.stageId);
}

/**
 * Build the matrix per §5.2.
 *
 * At the default `grouping.columns: 'product'` grain, one column per subject.
 *
 * At `grouping.columns: 'product-stage'`, pass `objectDetails` (from
 * `extractObjectDetails` on a process-blueprint) to expand each subject into
 * per-stage sub-columns.  Subjects with no stage mapping fall back to a single
 * product-grain column.
 *
 * At `grouping.columns: 'product-stage-task'`, pass `objectDetails` where each
 * stage carries a `tasks[]` array (combine blueprint stages and process-flow
 * tasks via `mergeStageTaskDetails`).  Each task becomes a
 * `(subject, stage, task)` column.  Stages with no tasks fall back to
 * stage-grain columns.
 *
 * Subjects are taken from `config.subjects.products`, `config.subjects.processes`,
 * and `config.subjects.capabilities` (in that order).  Subjects with no binding
 * obligation still appear as columns so the gap is visible.
 */
export function buildImpactMatrix(
  canon: ComplianceCanon,
  config: ImpactViewConfig,
  objectDetails?: ObjectDetailInput[],
): ImpactMatrix {
  const index = buildComplianceIndex({
    requirements: canon.requirements,
    assertions: canon.assertions,
  });

  const obligations = orderRows(resolveObligations(config, index, canon.requirements), config.order_rows_by);

  const grain = config.grouping?.columns ?? 'product';
  const hasDetails = objectDetails !== undefined && objectDetails.length > 0;
  const columns: ImpactColumn[] =
    grain === 'product-stage-task' && hasDetails
      ? buildTaskColumns(config, objectDetails!)
      : (grain === 'product-stage' || (grain as string) === 'object-details') && hasDetails
        ? buildObjectDetailColumns(config, objectDetails!)
        : buildProductColumns(config, [...(canon.products ?? []), ...(canon.subjects ?? [])]);

  const allowedStatuses = new Set<AssertionStatus>(
    config.status_display?.show ?? ['compliant', 'partial', 'non_compliant', 'under_review', 'pending_owner', 'n_a'],
  );

  const rowIndex = new Set(obligations.map(r => r.id));
  const cells: ImpactCell[][] = obligations.map(() => columns.map(() => emptyCell()));

  for (let c = 0; c < columns.length; c++) {
    const col = columns[c];
    const subjectAssertions = index.assertionsBySubject.get(col.subjectId) ?? [];
    for (const a of subjectAssertions) {
      if (!rowIndex.has(a.about)) continue;
      if (!allowedStatuses.has(a.status)) continue;
      if (!assertionMatchesColumn(a, col)) continue;
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

  // ── CV-3 decorations ────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  for (let r = 0; r < cells.length; r++) {
    const req = obligations[r];
    const deadlineStatus = computeDeadlineStatus(req.deadline, today);
    // "new" = requirement admitted after the snapshot date.
    const isNew =
      !!config.snapshot_at &&
      !!req.admitted_at &&
      req.admitted_at > config.snapshot_at;
    for (let c = 0; c < cells[r].length; c++) {
      const cell = cells[r][c];
      const isUrgent =
        cell.kind === 'gap' &&
        (deadlineStatus === 'past_due' || deadlineStatus === 'in_force');
      cell.decoration = { isNew, isUrgent, deadlineStatus };
    }
  }

  // ── CV-3 derived obligations lane ───────────────────────────────────────
  // For each column: collect codex source IDs from non-gap rows.
  const obligationsLane: string[][] = columns.map((_, c) => {
    const codexIds = new Set<string>();
    for (let r = 0; r < cells.length; r++) {
      if (cells[r][c].kind !== 'gap') {
        for (const src of obligations[r].derived_from ?? []) {
          codexIds.add(src);
        }
      }
    }
    return [...codexIds].sort();
  });

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
    obligationsLane,
  };
}

function emptyCell(): ImpactCell {
  return {
    status: null,
    kind: 'gap',
    assertions: [],
    decoration: { isNew: false, isUrgent: false, deadlineStatus: 'none' },
  };
}

// ── Process-blueprint / process-flow extractors (CV-3a) ─────────────────────

/**
 * Extract stage-level `ObjectDetailInput` from a raw (YAML-parsed)
 * process-blueprint document.
 *
 * Accepts both the bare document object and the wrapped form
 * (`{ process_blueprint: { id, stages: […] } }`).
 * Returns `null` when the document is not a recognisable process-blueprint or
 * has no `id` / `stages` array so callers can skip unrecognised files safely.
 *
 * Pass the returned value into `buildImpactMatrix` as part of the
 * `objectDetails` array when `grouping.columns: 'product-stage'` is configured.
 * For `grouping.columns: 'product-stage-task'`, combine with
 * `extractProcessFlowTasks` via `mergeStageTaskDetails`.
 */
export function extractObjectDetails(doc: unknown): ObjectDetailInput | null {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const top = doc as Record<string, unknown>;

  const bp: Record<string, unknown> | null =
    top.notation === 'process_blueprint'
      ? top
      : top.process_blueprint && typeof top.process_blueprint === 'object' && !Array.isArray(top.process_blueprint)
        ? (top.process_blueprint as Record<string, unknown>)
        : null;

  if (!bp) return null;
  const id = typeof bp.id === 'string' ? bp.id : null;
  if (!id) return null;
  if (!Array.isArray(bp.stages)) return null;

  const details: ObjectDetailDef[] = [];
  for (const s of bp.stages) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
    const sid = typeof s.id === 'string' ? s.id : null;
    if (!sid) continue;
    details.push({ id: sid, name: typeof s.name === 'string' ? s.name : sid });
  }

  return { objectId: id, details };
}

/**
 * Extract task-type steps from a raw (YAML-parsed) PROCESS element document.
 *
 * Reads `notation: process` documents with an inline `flow.steps[]` array.
 * Filters for task-type nodes (`task`, `userTask`, `serviceTask`) — start/end
 * events and gateways are excluded.  Returns a flat `ObjectDetailInput` where
 * `details` are the extracted task steps in declaration order.
 *
 * Returns `null` when the document is not a recognisable process element or
 * has no `id` / `flow.steps` array.
 *
 * Use the returned value with `mergeStageTaskDetails` to embed tasks into
 * blueprint stages for `grouping.columns: product-stage-task`.
 */
export function extractProcessFlowTasks(doc: unknown): ObjectDetailInput | null {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const top = doc as Record<string, unknown>;
  if (top.notation !== 'process') return null;
  const id = typeof top.id === 'string' ? top.id : null;
  if (!id) return null;
  const flow =
    top.flow && typeof top.flow === 'object' && !Array.isArray(top.flow)
      ? (top.flow as Record<string, unknown>)
      : null;
  if (!flow || !Array.isArray(flow.steps)) return null;

  const TASK_TYPES = new Set(['task', 'userTask', 'serviceTask', 'scriptTask',
    'receiveTask', 'sendTask', 'manualTask', 'businessRuleTask', 'callActivity', 'subProcess']);
  const details: ObjectDetailDef[] = [];
  for (const step of flow.steps) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
    const s = step as Record<string, unknown>;
    const stepId = typeof s.id === 'string' ? s.id : null;
    if (!stepId) continue;
    if (!TASK_TYPES.has(s.type as string)) continue;
    details.push({ id: stepId, name: typeof s.name === 'string' ? s.name : stepId });
  }

  return details.length > 0 ? { objectId: id, details } : null;
}

/**
 * Combine blueprint stage details (from `extractObjectDetails`) with
 * process-flow task details (from `extractProcessFlowTasks`) into a
 * stage-with-tasks hierarchy for `grouping.columns: product-stage-task`.
 *
 * All tasks from `taskInput.details` are distributed into their parent stage
 * by matching the `stageOwner` map: `stageId → taskId[]`.  If `stageOwner` is
 * omitted (no stage-to-task mapping is available), all tasks are placed into
 * every stage (`undefined` key `→` all tasks).
 *
 * When `taskInput` is `null` or its `objectId` does not match `stageInput`,
 * returns `stageInput` unchanged (callers can safely chain the result into
 * `buildImpactMatrix` — it will degrade to stage-grain columns).
 *
 * @param stageInput   Stage-level detail (from `extractObjectDetails`).
 * @param taskInput    Task-level detail  (from `extractProcessFlowTasks`).
 * @param stageOwner   Optional mapping `stageId → taskId[]`. When provided,
 *                     only tasks listed for a stage are embedded in it.
 */
export function mergeStageTaskDetails(
  stageInput: ObjectDetailInput,
  taskInput: ObjectDetailInput | null,
  stageOwner?: Record<string, string[]>,
): ObjectDetailInput {
  if (!taskInput || taskInput.objectId !== stageInput.objectId) return stageInput;
  const allTasks = taskInput.details;
  return {
    objectId: stageInput.objectId,
    details: stageInput.details.map(stage => {
      const stageTasks = stageOwner
        ? allTasks.filter(t => (stageOwner[stage.id] ?? []).includes(t.id))
        : allTasks;
      return stageTasks.length > 0 ? { ...stage, tasks: stageTasks } : stage;
    }),
  };
}

// ── Markdown rendering ──────────────────────────────────────────────────────

const STATUS_GLYPH: Record<AssertionStatus, string> = {
  compliant: 'OK',
  partial: 'PARTIAL',
  non_compliant: 'FAIL',
  under_review: 'REVIEW',
  pending_owner: 'PENDING',
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

  const header = ['Obligation', ...matrix.columns.map(col => escMd(col.label))];
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
  lines.push('- **OK / PARTIAL / FAIL / REVIEW / PENDING / N/A** — aggregated `ASSERTION.status` per §5.2.');
  lines.push(`- **${escMd(matrix.emptyLabels.no_obligation_label)}** — modelling gap; no admitted ASSERTION binds this (obligation, subject) pair.`);
  lines.push(`- **${escMd(matrix.emptyLabels.no_obligation_applies_label)}** — modelled fact; an admitted ASSERTION with status \`n_a\` excludes this pair.`);

  return lines.join('\n') + '\n';
}

function renderCell(cell: ImpactCell, labels: Required<ImpactEmptyCellLabels>): string {
  if (cell.kind === 'gap') return escMd(labels.no_obligation_label);
  if (cell.kind === 'n_a_only') return escMd(labels.no_obligation_applies_label);
  return STATUS_GLYPH[cell.status as AssertionStatus];
}
