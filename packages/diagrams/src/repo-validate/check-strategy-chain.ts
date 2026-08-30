// Strategy-chain semantic checks — the error-severity subset of DSM's Go
// `Validate*` functions (`api02/internal/importer/{goals,activities,fgca}.go`
// in transitrix-dsm), ported onto the standalone-element repo shape
// (`canon/elements/**`) that `validate --scope=repo` already loads, so DSM
// can drop those Go functions without regressing the checks they enforce
// today.
//
// Rule codes are DSM's own (`GOALS-010`, `ACT-006`..`009`, `DGCA-REPO-008`..`014`)
// — not invented here — so DSM can map a CLI finding straight back onto its
// import-log taxonomy (`RepoFinding.ruleId`).
//
// Scope — DSM's full rule set is now ported except GOALS-008 (see below).
// `RepoFinding` grew a `severity` field precisely so DSM's warn-severity
// rules could land without becoming blocking: every finding from before that
// field existed stays implicitly `'error'` (`types.ts`), and the six rules
// below set `severity: 'warning'` explicitly, matching DSM's own
// classification (`Issue.Severity` in the Go source) and its "import
// anyway, record the warning" policy.
//
// GOALS-009/011 (orphan / missing parent) are ported at warning severity even
// though most standalone GOAL elements legitimately have no `parent` field —
// GOAL.parent is "v0.x transitional" (ELEMENT_PRIMITIVES.md §7.2; canonical
// home is a `goal_parent` REL file or the goals-tree view's inline `parent`).
// `organizations/acme_corp`'s GOAL-CUST-1/GOAL-OPS-1/GOAL-EU-1 are exactly
// this shape and do surface GOALS-011 warnings — that noise is the accepted
// cost of a *warning* level rule (non-blocking, advisory), unlike the ERROR
// tier this repo held the line on. This is a deliberate call, not an
// oversight: keep the coverage rather than drop it, now that it can be
// non-blocking.
//
// GOALS-008 (type/level mismatch) is still NOT ported, at either severity.
// Both of DSM's cases ("type not declared in goal_types" / "level doesn't
// match the type's declared level") need the `goal_types[]` catalogue, which
// lives on the goals-tree *view* (`canon/views/goals/**`,
// notations/views/04-goals.md §5.2) — a zone this validator's `RepoModelInput`
// does not load (only `canon/elements/**` and `canon/relations/**`, per
// `validate-repo.ts`). There is no standalone-element-shape data this rule
// could run against without the validator growing a third input zone — a
// bigger architectural change than adapting a predicate to data already in
// scope, unlike every other ported rule here. This is flagged for a
// per-rule call: skip it (status quo) or scope a follow-up that loads
// `canon/views/goals/**`'s `goal_types[]` into the repo-scope model.
//
// Ported (error-severity, blocking):
//   GOALS-010     — GOAL `parent` chain contains a cycle.
//   ACT-006       — ACTION `predecessors` graph contains a cycle.
//   ACT-007       — ACTION lists itself as its own predecessor.
//   ACT-008       — ACTION `start_date`/`end_date` unparseable, or end before start.
//   ACT-009       — ACTION numeric field (`duration`/`duration_days`, `labor_cost`,
//                   `resources_cost`, `effort`, `score`) is negative.
//   DGCA-REPO-008 — GOAL.factors references an undefined DRIVER.
//   DGCA-REPO-009 — CHANGE.goals references an undefined GOAL.
//   DGCA-REPO-010 — ACTION.delivers_changes references an undefined CHANGE.
//   DGCA-REPO-011 — ACTION.goals references an undefined GOAL.
//
// Ported (warning-severity, advisory):
//   GOALS-009     — GOAL.parent is set but does not resolve to a known GOAL (orphan).
//   GOALS-011     — GOAL has no `parent` and `level` >= 1 (backlog).
//   ACT-005       — ACTION.predecessors entry or ACTION.parent does not resolve
//                   to a known ACTION (orphan).
//   DGCA-REPO-012 — a DRIVER is not referenced by any GOAL.factors or assessment chain (unreferenced).
//   DGCA-REPO-013 — a GOAL is not referenced by any CHANGE.goals or ACTION.goals
//                   (unreferenced).
//   DGCA-REPO-014 — a CHANGE is not referenced by any ACTION.delivers_changes
//                   (unreferenced).
//
// Backward compatibility (read path only):
//   FGCA-008..014 — deprecated aliases for DGCA-REPO-008..014, removed at 5.0.0.

import { docId, endpointId } from './validate-repo.js';
import type { RepoDoc, RepoFinding, RepoModelInput } from './types.js';

const PScope: RepoFinding['scope'] = 'repo';

function isGoalNotation(n: unknown): boolean {
  return n === 'goal';
}

function isActionNotation(n: unknown): boolean {
  // 'activity' is the deprecated pre-2026-06-25 alias (elements/24-action.md §5).
  return n === 'action' || n === 'activity';
}

function isDriverNotation(n: unknown): boolean {
  // 'factor' is the pre-rename notation value (Factor -> Driver rename, in progress).
  return n === 'driver' || n === 'factor';
}

function isChangeNotation(n: unknown): boolean {
  return n === 'change';
}

function readStringArray(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function readFiniteNumber(data: Record<string, unknown>, key: string): number | undefined {
  const v = data[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

interface ChainElement {
  id: string;
  doc: RepoDoc;
  data: Record<string, unknown>;
}

function collectByNotation(
  elements: RepoDoc[],
  matches: (notation: unknown) => boolean,
): ChainElement[] {
  const out: ChainElement[] = [];
  for (const doc of elements) {
    if (!doc.data) continue;
    if (!matches(doc.data['notation'])) continue;
    const id = docId(doc);
    if (!id) continue;
    out.push({ id, doc, data: doc.data });
  }
  return out;
}

/** DFS cycle detection over a single-parent edge (GOAL.parent), matching DSM's
 *  `findCycle` (goals.go): only walks an edge to a parent that itself resolves
 *  within the set — an edge into an unresolved (orphan) parent is not walked,
 *  so an orphan can never be mistaken for a cycle. Returns the id where a
 *  back-edge was hit, or `undefined` if the graph is acyclic. */
function findParentCycle(goals: ChainElement[]): string | undefined {
  const parentOf = new Map<string, string | undefined>();
  const known = new Set<string>();
  for (const g of goals) {
    known.add(g.id);
    parentOf.set(g.id, readString(g.data, 'parent'));
  }
  const UNVISITED = 0;
  const VISITING = 1;
  const DONE = 2;
  const state = new Map<string, number>();

  function walk(id: string): string | undefined {
    const s = state.get(id) ?? UNVISITED;
    if (s === DONE) return undefined;
    if (s === VISITING) return id;
    state.set(id, VISITING);
    const parent = parentOf.get(id);
    if (parent && known.has(parent)) {
      const hit = walk(parent);
      if (hit) return hit;
    }
    state.set(id, DONE);
    return undefined;
  }

  for (const g of goals) {
    const hit = walk(g.id);
    if (hit) return hit;
  }
  return undefined;
}

/** DFS cycle detection over a multi-predecessor edge list (ACTION.predecessors),
 *  matching DSM's `findActivityCycle` (activities.go). Unresolved predecessors
 *  are skipped, same rationale as `findParentCycle`. */
function findPredecessorCycle(actions: ChainElement[]): string | undefined {
  const predsOf = new Map<string, string[]>();
  const known = new Set<string>();
  for (const a of actions) {
    known.add(a.id);
    predsOf.set(a.id, readStringArray(a.data, 'predecessors'));
  }
  const UNVISITED = 0;
  const VISITING = 1;
  const DONE = 2;
  const state = new Map<string, number>();

  function walk(id: string): string | undefined {
    const s = state.get(id) ?? UNVISITED;
    if (s === DONE) return undefined;
    if (s === VISITING) return id;
    state.set(id, VISITING);
    for (const p of predsOf.get(id) ?? []) {
      if (!known.has(p)) continue;
      const hit = walk(p);
      if (hit) return hit;
    }
    state.set(id, DONE);
    return undefined;
  }

  for (const a of actions) {
    const hit = walk(a.id);
    if (hit) return hit;
  }
  return undefined;
}

/** GOALS-010 — the GOAL `parent` chain must not contain a cycle. */
function checkGoalParentCycle(goals: ChainElement[], findings: RepoFinding[]): void {
  const cyc = findParentCycle(goals);
  if (cyc) {
    findings.push({
      scope: PScope,
      id: cyc,
      ruleId: 'GOALS-010',
      message: `GOALS-010: parent chain contains a cycle involving goal '${cyc}'.`,
    });
  }
}

/** GOALS-009 / GOALS-011 — GOAL `parent` resolution (warning). Mirrors DSM's
 *  goals.go: the two are mutually exclusive per goal — a goal with no
 *  `parent` is checked for GOALS-011 (backlog, level >= 1); a goal with a
 *  `parent` is checked for GOALS-009 (orphan, parent unresolved) instead. */
function checkGoalParentResolution(goals: ChainElement[], findings: RepoFinding[]): void {
  const knownIds = new Set(goals.map((g) => g.id));
  for (const g of goals) {
    const parent = readString(g.data, 'parent');
    if (!parent) {
      const level = readFiniteNumber(g.data, 'level');
      if (level !== undefined && level >= 1) {
        findings.push({
          scope: PScope,
          id: g.id,
          ruleId: 'GOALS-011',
          severity: 'warning',
          message: `GOALS-011: goal '${g.id}' (level ${level}) has no parent; treated as backlog until attached.`,
        });
      }
      continue;
    }
    if (!knownIds.has(parent)) {
      findings.push({
        scope: PScope,
        id: g.id,
        ruleId: 'GOALS-009',
        severity: 'warning',
        message: `GOALS-009: goal '${g.id}' parent '${parent}' does not resolve to a known goal; treated as orphan.`,
      });
    }
  }
}

/** ACT-007 — an ACTION cannot list itself as its own predecessor. */
function checkActionSelfPredecessor(actions: ChainElement[], findings: RepoFinding[]): void {
  for (const a of actions) {
    if (readStringArray(a.data, 'predecessors').includes(a.id)) {
      findings.push({
        scope: PScope,
        id: a.id,
        ruleId: 'ACT-007',
        message: `ACT-007: action '${a.id}' lists itself as a predecessor.`,
      });
    }
  }
}

/** ACT-006 — the ACTION `predecessors` graph must not contain a cycle. */
function checkActionPredecessorCycle(actions: ChainElement[], findings: RepoFinding[]): void {
  const cyc = findPredecessorCycle(actions);
  if (cyc) {
    findings.push({
      scope: PScope,
      id: cyc,
      ruleId: 'ACT-006',
      message: `ACT-006: predecessor graph contains a cycle involving action '${cyc}'.`,
    });
  }
}

/** ACT-005 — an ACTION `predecessors` entry or `parent` that does not resolve
 *  to a known ACTION is an orphan reference (warning — advisory in DSM, same
 *  as the goal-parent orphan checks above). */
function checkActionOrphanReferences(actions: ChainElement[], findings: RepoFinding[]): void {
  const knownIds = new Set(actions.map((a) => a.id));
  for (const a of actions) {
    for (const p of readStringArray(a.data, 'predecessors')) {
      if (!knownIds.has(p)) {
        findings.push({
          scope: PScope,
          id: a.id,
          ruleId: 'ACT-005',
          severity: 'warning',
          message: `ACT-005: action '${a.id}' predecessor '${p}' does not resolve to a known action.`,
        });
      }
    }
    const parent = readString(a.data, 'parent');
    if (parent && !knownIds.has(parent)) {
      findings.push({
        scope: PScope,
        id: a.id,
        ruleId: 'ACT-005',
        severity: 'warning',
        message: `ACT-005: action '${a.id}' parent '${parent}' does not resolve to a known action.`,
      });
    }
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a strict ISO `YYYY-MM-DD` date, rejecting calendar-invalid dates
 *  (e.g. `2026-02-30`) the way Go's `time.Parse(dateLayout, …)` does — a
 *  regex match alone accepts those. Returns `undefined` when invalid. */
function parseIsoDate(value: string): Date | undefined {
  if (!ISO_DATE_RE.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return undefined;
  }
  return dt;
}

/** ACT-008 — `start_date`/`end_date` must be valid ISO dates, and `end_date`
 *  must not be before `start_date` (equal is allowed — e.g. a milestone). */
function checkActionDates(actions: ChainElement[], findings: RepoFinding[]): void {
  for (const a of actions) {
    const startRaw = readString(a.data, 'start_date');
    const endRaw = readString(a.data, 'end_date');
    let start: Date | undefined;
    let end: Date | undefined;

    if (startRaw !== undefined) {
      start = parseIsoDate(startRaw);
      if (!start) {
        findings.push({
          scope: PScope,
          id: a.id,
          ruleId: 'ACT-008',
          message: `ACT-008: action '${a.id}' start_date '${startRaw}' is not a valid YYYY-MM-DD date.`,
        });
      }
    }
    if (endRaw !== undefined) {
      end = parseIsoDate(endRaw);
      if (!end) {
        findings.push({
          scope: PScope,
          id: a.id,
          ruleId: 'ACT-008',
          message: `ACT-008: action '${a.id}' end_date '${endRaw}' is not a valid YYYY-MM-DD date.`,
        });
      }
    }
    if (start && end && end.getTime() < start.getTime()) {
      findings.push({
        scope: PScope,
        id: a.id,
        ruleId: 'ACT-008',
        message: `ACT-008: action '${a.id}' end_date '${endRaw}' is before start_date '${startRaw}'.`,
      });
    }
  }
}

/** ACT-009 — numeric scheduling/cost fields must not be negative. `duration`
 *  and `duration_days` are both checked — the canonical field is `duration`
 *  (elements/24-action.md §2), but `duration_days` is an accepted alias in
 *  this codebase's document-form validator (activities/validate.ts) and is
 *  the field acme_corp's own ACTION elements actually use. */
function checkActionNegativeNumbers(actions: ChainElement[], findings: RepoFinding[]): void {
  const fields = ['duration', 'duration_days', 'labor_cost', 'resources_cost', 'effort', 'score'] as const;
  for (const a of actions) {
    for (const field of fields) {
      const v = readFiniteNumber(a.data, field);
      if (v !== undefined && v < 0) {
        findings.push({
          scope: PScope,
          id: a.id,
          ruleId: 'ACT-009',
          message: `ACT-009: action '${a.id}' field '${field}' is negative (${v}).`,
        });
      }
    }
  }
}

/** DGCA-008..011 — inline strategy-chain cross-references must resolve within
 *  the repo: GOAL.factors -> DRIVER, CHANGE.goals -> GOAL, ACTION.goals ->
 *  GOAL, ACTION.delivers_changes -> CHANGE (ELEMENT_PRIMITIVES.md §7.1-§7.4). */
function checkStrategyChainReferences(
  goals: ChainElement[],
  actions: ChainElement[],
  drivers: ChainElement[],
  changes: ChainElement[],
  findings: RepoFinding[],
): void {
  const driverIds = new Set(drivers.map((d) => d.id));
  const goalIds = new Set(goals.map((g) => g.id));
  const changeIds = new Set(changes.map((c) => c.id));

  for (const g of goals) {
    for (const f of readStringArray(g.data, 'factors')) {
      if (!driverIds.has(f)) {
        findings.push({
          scope: PScope,
          id: g.id,
          ruleId: 'DGCA-REPO-008',
          aliases: ['FGCA-008'],
          message: `DGCA-REPO-008: goal '${g.id}' references undefined driver '${f}'.`,
        });
      }
    }
  }
  for (const c of changes) {
    for (const g of readStringArray(c.data, 'goals')) {
      if (!goalIds.has(g)) {
        findings.push({
          scope: PScope,
          id: c.id,
          ruleId: 'DGCA-REPO-009',
          aliases: ['FGCA-009'],
          message: `DGCA-REPO-009: change '${c.id}' references undefined goal '${g}'.`,
        });
      }
    }
  }
  for (const a of actions) {
    for (const c of readStringArray(a.data, 'delivers_changes')) {
      if (!changeIds.has(c)) {
        findings.push({
          scope: PScope,
          id: a.id,
          ruleId: 'DGCA-REPO-010',
          aliases: ['FGCA-010'],
          message: `DGCA-REPO-010: action '${a.id}' references undefined change '${c}'.`,
        });
      }
    }
    for (const g of readStringArray(a.data, 'goals')) {
      if (!goalIds.has(g)) {
        findings.push({
          scope: PScope,
          id: a.id,
          ruleId: 'DGCA-REPO-011',
          aliases: ['FGCA-011'],
          message: `DGCA-REPO-011: action '${a.id}' references undefined goal '${g}'.`,
        });
      }
    }
  }
}

/** DGCA-012..014 — a DRIVER/GOAL/CHANGE defined but never referenced
 *  downstream in the strategy chain is unreferenced (warning — advisory in
 *  DSM, mirroring the orphan-reference checks above). */
function checkStrategyChainOrphans(
  goals: ChainElement[],
  actions: ChainElement[],
  drivers: ChainElement[],
  changes: ChainElement[],
  findings: RepoFinding[],
  allElements: RepoDoc[],
  relations: RepoDoc[],
): void {
  const referencedDrivers = new Set<string>();

  // Direct references: GOAL.factors
  for (const g of goals) {
    for (const f of readStringArray(g.data, 'factors')) referencedDrivers.add(f);
  }

  // Indirect references through assessment chain: GOAL ← ASSESSMENT → DRIVER
  // First, collect which goals are referenced by changes/actions
  const referencedGoals = new Set<string>();
  for (const c of changes) {
    for (const g of readStringArray(c.data, 'goals')) referencedGoals.add(g);
  }
  for (const a of actions) {
    for (const g of readStringArray(a.data, 'goals')) referencedGoals.add(g);
  }

  // Build a map: assessmentId -> driverId (via assessment.assesses field)
  const driverByAssessment = new Map<string, string>();
  for (const doc of allElements) {
    if (!doc.data) continue;
    const notation = doc.data['notation'];
    if (notation !== 'assessment') continue;
    const assessmentId = docId(doc);
    if (!assessmentId) continue;
    const driverId = readString(doc.data, 'assesses');
    if (driverId) {
      driverByAssessment.set(assessmentId, driverId);
    }
  }

  // For each referenced goal, find assessments that influence it via assessment_influences_goal relations
  const assessmentsByGoal = new Map<string, Set<string>>();
  for (const doc of relations) {
    if (!doc.data) continue;
    const relType = doc.data['type'];
    if (relType !== 'assessment_influences_goal') continue;
    const toId = endpointId(doc.data['to']) ?? endpointId(doc.data['target']);
    const fromId = endpointId(doc.data['from']) ?? endpointId(doc.data['source']);
    if (toId && fromId) {
      if (!assessmentsByGoal.has(toId)) {
        assessmentsByGoal.set(toId, new Set());
      }
      assessmentsByGoal.get(toId)!.add(fromId);
    }
  }

  // For each referenced goal, collect drivers from assessments that influence it
  for (const goalId of referencedGoals) {
    const assessments = assessmentsByGoal.get(goalId);
    if (assessments) {
      for (const assessmentId of assessments) {
        const driverId = driverByAssessment.get(assessmentId);
        if (driverId) {
          referencedDrivers.add(driverId);
        }
      }
    }
  }

  for (const d of drivers) {
    if (!referencedDrivers.has(d.id)) {
      findings.push({
        scope: PScope,
        id: d.id,
        ruleId: 'DGCA-REPO-012',
        severity: 'warning',
        aliases: ['FGCA-012'],
        message: `DGCA-REPO-012: driver '${d.id}' is not referenced by any goal.`,
      });
    }
  }

  const referencedGoals2 = new Set<string>();
  for (const c of changes) {
    for (const g of readStringArray(c.data, 'goals')) referencedGoals2.add(g);
  }
  for (const a of actions) {
    for (const g of readStringArray(a.data, 'goals')) referencedGoals2.add(g);
  }
  for (const g of goals) {
    if (!referencedGoals2.has(g.id)) {
      findings.push({
        scope: PScope,
        id: g.id,
        ruleId: 'DGCA-REPO-013',
        severity: 'warning',
        aliases: ['FGCA-013'],
        message: `DGCA-REPO-013: goal '${g.id}' is not referenced by any change or action.`,
      });
    }
  }

  const referencedChanges = new Set<string>();
  for (const a of actions) {
    for (const c of readStringArray(a.data, 'delivers_changes')) referencedChanges.add(c);
  }
  for (const c of changes) {
    if (!referencedChanges.has(c.id)) {
      findings.push({
        scope: PScope,
        id: c.id,
        ruleId: 'DGCA-REPO-014',
        severity: 'warning',
        aliases: ['FGCA-014'],
        message: `DGCA-REPO-014: change '${c.id}' is not referenced by any action.`,
      });
    }
  }
}

/**
 * Run the strategy-chain semantic checks (GOALS-009..011, ACT-005..009,
 * DGCA-REPO-008..014 except GOALS-008 — see the module header) over the loaded
 * element set and append findings. Called from `validateRepoModel` after the
 * structural phases. Pure, deterministic order.
 */
export function checkStrategyChainSemantics(input: RepoModelInput, findings: RepoFinding[]): void {
  const goals = collectByNotation(input.elements, isGoalNotation);
  const actions = collectByNotation(input.elements, isActionNotation);
  const drivers = collectByNotation(input.elements, isDriverNotation);
  const changes = collectByNotation(input.elements, isChangeNotation);

  checkGoalParentCycle(goals, findings);
  checkGoalParentResolution(goals, findings);
  checkActionSelfPredecessor(actions, findings);
  checkActionPredecessorCycle(actions, findings);
  checkActionOrphanReferences(actions, findings);
  checkActionDates(actions, findings);
  checkActionNegativeNumbers(actions, findings);
  checkStrategyChainReferences(goals, actions, drivers, changes, findings);
  checkStrategyChainOrphans(goals, actions, drivers, changes, findings, input.elements, input.relations);
}
