// Standalone-element envelope checks — the error-severity subset of DSM's Go
// `Validate*Element` functions (`api02/internal/importer/{goal_element,
// action_element}.go` in transitrix-dsm), ported onto the standalone-element
// repo shape (`canon/elements/**`) that `validate --scope=repo` already
// loads. Sibling to `check-strategy-chain.ts` (which covers cross-element
// reference/cycle rules); this file covers the per-element envelope rules —
// id presence/grammar, name presence, and the ACTION type vocabulary +
// deprecated-alias warnings.
//
// DSM identifies "this file is a GOAL/ACTION element" by its folder location
// during the import walk (`canon/elements/01_motivation/goals/`,
// `canon/elements/05_implementation/actions/`) — the validator functions
// receive an already-typed struct, so a wrong `notation` value on that
// struct is still checkable (`GOAL-ELEM-001`/the notation branch of
// `ACTION-001`). This repo-scope model has no such pre-typing
// (`RepoModelInput.elements` is a flat, untyped list from `canon/elements/**`)
// — candidate selection here is content-based (the element's own `notation`
// field), same convention as `check-strategy-chain.ts`'s `collectByNotation`.
// That means a candidate is by construction already notation-correct, so
// GOAL-ELEM-001's and ACTION-001's "wrong notation" case can never fire here
// — tried an id-prefix-based candidate signal instead (matching on a `GOAL-`/
// `ACTION-` id TYPE prefix regardless of notation) to cover that case, but it
// produced false positives against this repo's own test fixtures, which
// reuse a `GOAL-`-prefixed id under a `goals/` path for an unrelated
// notation as a referential-integrity test double
// (`validate-repo.test.ts`'s `GOAL-OPS-1`/notation:'assessment' fixture) —
// there is no reliable, adopter-folder-layout-independent way to tell
// "misfiled element" from "id reused for something else" without DSM's own
// folder-based typing. Flagged for a decision, same as `GOALS-008`: skip
// permanently, or scope a follow-up once the repo-scope model gains
// path-aware typing.
//
// Rule codes are DSM's own — not invented here — so DSM can map a CLI
// finding straight back onto its import-log taxonomy (`RepoFinding.ruleId`).
//
// Ported (error-severity, blocking):
//   GOAL-ELEM-002   — GOAL element `id` is missing.
//   GOAL-ELEM-003   — GOAL element `name` is missing.
//   ACTION-001      — ACTION element `id` or `name` is missing.
//   ACTION-002      — ACTION element `type` is set but not one of
//                      Initiative | Strategic Initiative | Programme |
//                      Project | Task (Strategic Initiative is an accepted
//                      alias for Initiative). DSM treats this as fatal — the
//                      type vocabulary has real behavioural teeth downstream.
//
// Ported (warning-severity, advisory):
//   GOAL-ELEM-002   — GOAL element `id` does not match the canonical
//                      `GOAL-[<middle>-]<INTEGER>` grammar (non-fatal —
//                      DSM still imports it).
//   ACTION-001      — ACTION element `id` does not match the canonical
//                      `ACTION-[<middle>-]<INTEGER>` grammar.
//   ACTION-005      — ACTION element uses a deprecated alias: `notation:
//                      activity` (pre-2026-06-25), an `ACTIVITY-` id prefix,
//                      or the `activity_type` field (rename to `type`).
//
// Not ported: GOALS-007 (duplicate id) / ACT-004 (duplicate id) — already
// covered generically by `validate-repo.ts`'s `checkIdUniqueness`, which
// spans every canon element/relation id, not just GOAL/ACTION. Porting a
// second, notation-scoped duplicate check here would just double-report the
// same defect under two rule codes.

import { docId } from './validate-repo.js';
import type { RepoDoc, RepoFinding, RepoModelInput } from './types.js';

const PScope: RepoFinding['scope'] = 'repo';

const GOAL_ELEM_ID_RE = /^GOAL-([A-Z0-9]+-)*[0-9]+$/;
const ACTION_ELEM_ID_RE = /^ACTION-([A-Z0-9]+-)*[0-9]+$/;

/** ACTION scale-level vocabulary (elements/24-action.md §1). "Strategic
 *  Initiative" is an accepted alias for "Initiative", matching DSM's
 *  `actionTypeVocabulary` (action_element.go). */
const ACTION_TYPE_VOCABULARY = new Set([
  'Initiative',
  'Strategic Initiative',
  'Programme',
  'Project',
  'Task',
]);

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

interface ElementCandidate {
  id: string | undefined;
  doc: RepoDoc;
  data: Record<string, unknown>;
}

function collectCandidates(
  elements: RepoDoc[],
  matches: (data: Record<string, unknown>) => boolean,
): ElementCandidate[] {
  const out: ElementCandidate[] = [];
  for (const doc of elements) {
    if (!doc.data) continue;
    if (!matches(doc.data)) continue;
    out.push({ id: docId(doc) ?? undefined, doc, data: doc.data });
  }
  return out;
}

/** GOAL-ELEM-002/003 — the GOAL element envelope: id presence + grammar,
 *  name presence. Candidate selection is content-based (`notation === 'goal'`)
 *  — see the module header for why `GOAL-ELEM-001` (wrong notation) isn't
 *  ported here. */
function checkGoalElements(elements: RepoDoc[], findings: RepoFinding[]): void {
  const candidates = collectCandidates(elements, (data) => data['notation'] === 'goal');

  for (const { id, data } of candidates) {
    const where = id ?? '';

    if (!id) {
      findings.push({
        scope: PScope,
        id: '',
        ruleId: 'GOAL-ELEM-002',
        message: 'GOAL-ELEM-002: GOAL element id is missing.',
      });
    } else if (!GOAL_ELEM_ID_RE.test(id)) {
      findings.push({
        scope: PScope,
        id,
        ruleId: 'GOAL-ELEM-002',
        severity: 'warning',
        message: `GOAL-ELEM-002: goal id '${id}' does not match GOAL-[<middle>-]<INTEGER>.`,
      });
    }

    if (!readString(data, 'name')) {
      findings.push({
        scope: PScope,
        id: where,
        ruleId: 'GOAL-ELEM-003',
        message: `GOAL-ELEM-003: GOAL element '${where || '(no id)'}' name is missing.`,
      });
    }
  }
}

/** ACTION-001/002/005 — the ACTION element envelope: id presence + grammar,
 *  name presence, type vocabulary, and the pre-2026-06-25 deprecated aliases
 *  (`notation: activity`, `ACTIVITY-` id prefix, `activity_type` field).
 *  Candidate selection is content-based (`notation === 'action'` or the
 *  deprecated `'activity'` alias) — see the module header for why
 *  `ACTION-001`'s "wrong notation" case isn't ported here. */
function checkActionElements(elements: RepoDoc[], findings: RepoFinding[]): void {
  const candidates = collectCandidates(
    elements,
    (data) => data['notation'] === 'action' || data['notation'] === 'activity',
  );

  for (const { id, data } of candidates) {
    const where = id ?? '';

    if (data['notation'] === 'activity') {
      findings.push({
        scope: PScope,
        id: where,
        ruleId: 'ACTION-005',
        severity: 'warning',
        message: `ACTION-005: element '${where || '(no id)'}' notation 'activity' is deprecated; migrate to 'action'.`,
      });
    }

    if (!id) {
      findings.push({
        scope: PScope,
        id: '',
        ruleId: 'ACTION-001',
        message: 'ACTION-001: ACTION element id is missing.',
      });
    } else if (id.startsWith('ACTIVITY-')) {
      findings.push({
        scope: PScope,
        id,
        ruleId: 'ACTION-005',
        severity: 'warning',
        message: `ACTION-005: id '${id}' uses the deprecated ACTIVITY- prefix; migrate to ACTION-.`,
      });
    } else if (!ACTION_ELEM_ID_RE.test(id)) {
      findings.push({
        scope: PScope,
        id,
        ruleId: 'ACTION-001',
        severity: 'warning',
        message: `ACTION-001: action id '${id}' does not match ACTION-[<middle>-]<INTEGER>.`,
      });
    }

    if (!readString(data, 'name')) {
      findings.push({
        scope: PScope,
        id: where,
        ruleId: 'ACTION-001',
        message: `ACTION-001: ACTION element '${where || '(no id)'}' name is missing.`,
      });
    }

    let actionType = readString(data, 'type');
    if (!actionType) {
      const legacy = readString(data, 'activity_type');
      if (legacy) {
        findings.push({
          scope: PScope,
          id: where,
          ruleId: 'ACTION-005',
          severity: 'warning',
          message: `ACTION-005: element '${where || '(no id)'}' field 'activity_type' is deprecated; migrate to 'type'.`,
        });
        actionType = legacy;
      }
    }
    if (actionType && !ACTION_TYPE_VOCABULARY.has(actionType)) {
      findings.push({
        scope: PScope,
        id: where,
        ruleId: 'ACTION-002',
        message: `ACTION-002: element '${where || '(no id)'}' type '${actionType}' is not one of Initiative, Programme, Project, Task.`,
      });
    }
  }
}

/**
 * Run the standalone-element envelope checks (GOAL-ELEM-001..003,
 * ACTION-001/002/005) over the loaded element set and append findings.
 * Called from `validateRepoModel` alongside `checkStrategyChainSemantics`.
 * Pure, deterministic order.
 */
export function checkElementHygiene(input: RepoModelInput, findings: RepoFinding[]): void {
  checkGoalElements(input.elements, findings);
  checkActionElements(input.elements, findings);
}
