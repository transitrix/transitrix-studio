// Strategy-chain semantic checks (vkgeorgia/strategy#719, epic #28) — the
// error-severity subset of DSM's Go `Validate*` functions
// (`api02/internal/importer/{goals,activities,fgca}.go` in transitrix-dsm),
// ported onto the standalone-element repo shape (`canon/elements/**`) that
// `validate --scope=repo` already loads, so DSM can drop those Go functions
// per #705 without regressing the checks they enforce today.
//
// Rule codes are DSM's own (`GOALS-010`, `ACT-006`..`009`, `FGCA-008`..`011`)
// — not invented here — so DSM can map a CLI finding straight back onto its
// import-log taxonomy (`RepoFinding.ruleId`, vkgeorgia/strategy#719).
//
// Scope — only DSM's ERROR-severity rules are ported. DSM's own taxonomy
// splits every rule error|warn (`Issue.Severity` in the Go source). Porting
// only the error half is deliberate, not an oversight:
//
//   - `RepoFinding` has no severity field. The richer finding taxonomy stays
//     "DEFERRED until a real consumer needs it" (types.ts), and every
//     existing repo-scope check is implicitly blocking — `validate
//     --scope=repo` exits non-zero on ANY finding (docs/validation.md). A
//     warn-severity DSM rule surfaced here would silently become a blocking
//     one, which is a bigger behaviour change than #719 asked for.
//   - Several of DSM's warn rules flag states that are normal, not bugs, once
//     adapted to the standalone-element shape — confirmed against
//     `organizations/acme_corp`, this repo's own parity fixture:
//       - GOALS-009/011 (orphan / missing parent): GOAL's `parent` is
//         declared "v0.x transitional" (methodology ELEMENT_PRIMITIVES.md
//         §7.2) — its canonical home is a `goal_parent` REL file or the
//         goals-tree view's inline `parent`, not the element. acme_corp's
//         GOAL-CUST-1 / GOAL-OPS-1 are exactly this shape (level 1, no
//         `parent` on the element, parent carried by the view per their own
//         file comments) — flagging that as a repo-scope error would fail
//         this repo's reference fixture for doing nothing wrong.
//       - GOALS-008 (type/level mismatch): DSM's error case ("type not
//         declared in goal_types") needs a catalogue this repo shape doesn't
//         carry (`goal_types[]` lives on the goals-tree view, not on the
//         element) — only DSM's *warning* case is even adaptable here, so
//         under the ERROR-only policy above it is not ported.
//       - ACT-005 (orphan predecessor/parent) and FGCA-012/013/014
//         (unreferenced driver/goal/change) are advisory-by-design in DSM
//         ("import anyway, record the warning") — the same reasoning as
//         GOALS-009/011.
//
//   Promoting these warn-severity rules to repo-scope findings is future
//   work, gated on `RepoFinding` growing a severity field.
//
// Ported (error-severity, blocking):
//   GOALS-010 — GOAL `parent` chain contains a cycle.
//   ACT-006   — ACTION `predecessors` graph contains a cycle.
//   ACT-007   — ACTION lists itself as its own predecessor.
//   ACT-008   — ACTION `start_date`/`end_date` unparseable, or end before start.
//   ACT-009   — ACTION numeric field (`duration`/`duration_days`, `labor_cost`,
//               `resources_cost`, `effort`, `score`) is negative.
//   FGCA-008  — GOAL.factors references an undefined DRIVER.
//   FGCA-009  — CHANGE.goals references an undefined GOAL.
//   FGCA-010  — ACTION.delivers_changes references an undefined CHANGE.
//   FGCA-011  — ACTION.goals references an undefined GOAL.

import { docId } from './validate-repo.js';
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

/** FGCA-008..011 — inline strategy-chain cross-references must resolve within
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
          ruleId: 'FGCA-008',
          message: `FGCA-008: goal '${g.id}' references undefined driver '${f}'.`,
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
          ruleId: 'FGCA-009',
          message: `FGCA-009: change '${c.id}' references undefined goal '${g}'.`,
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
          ruleId: 'FGCA-010',
          message: `FGCA-010: action '${a.id}' references undefined change '${c}'.`,
        });
      }
    }
    for (const g of readStringArray(a.data, 'goals')) {
      if (!goalIds.has(g)) {
        findings.push({
          scope: PScope,
          id: a.id,
          ruleId: 'FGCA-011',
          message: `FGCA-011: action '${a.id}' references undefined goal '${g}'.`,
        });
      }
    }
  }
}

/**
 * Run the strategy-chain semantic checks (GOALS-010, ACT-006..009,
 * FGCA-008..011) over the loaded element set and append findings. Called from
 * `validateRepoModel` after the structural phases. Pure, deterministic order.
 */
export function checkStrategyChainSemantics(input: RepoModelInput, findings: RepoFinding[]): void {
  const goals = collectByNotation(input.elements, isGoalNotation);
  const actions = collectByNotation(input.elements, isActionNotation);
  const drivers = collectByNotation(input.elements, isDriverNotation);
  const changes = collectByNotation(input.elements, isChangeNotation);

  checkGoalParentCycle(goals, findings);
  checkActionSelfPredecessor(actions, findings);
  checkActionPredecessorCycle(actions, findings);
  checkActionDates(actions, findings);
  checkActionNegativeNumbers(actions, findings);
  checkStrategyChainReferences(goals, actions, drivers, changes, findings);
}
