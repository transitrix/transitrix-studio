/**
 * Goals Tree canon resolver — assembles a flat canonical Goals document from
 * a view_config projection and a canon element store (methodology
 * `notations/views/04-goals.md` §4 "Projection form (Full tier —
 * post-promotion)"). Mirrors `fgca/resolver.ts`'s `resolveFGCA`/`isFGCAViewDoc`
 * and `activities/resolver.ts`'s `resolveAction`/`isActionViewDoc` pattern
 * for the `goals` notation.
 *
 * Output shape matches the flat inline form `parseCanonicalGoals` expects:
 * top-level `goal_types[]` + `goals[]`. Filesystem-free — callable from unit
 * tests without vscode.
 *
 * `goal_types[]` synthesis: when `view_config.goal_types` is present it is
 * used as-is (the documented projection-form shape always includes it) and
 * each goal keeps its own authored `level`, validated against that table as
 * usual. When absent, §5.2 says the renderer "infers levels from the parent
 * chain depth (root goals at 0, each step deeper adds 1)" — this resolver
 * implements that literally (`parentChainDepth`), overriding each selected
 * goal's `level` with its structural depth, rather than trusting the
 * element's own stored `level` field. A stored `level` can't be trusted here:
 * nothing enforces cross-element consistency on it (ELEMENT_PRIMITIVES.md
 * §7.2: `type`/`level` are independent, both-optional per-element fields),
 * and worse, using it made the synthesized table's chosen level depend on
 * which element the canon loader happened to enumerate first — the CLI
 * (`readdirSync`, unsorted) and the VS Code preview
 * (`vscode.workspace.fs.readDirectory`, unsorted) can enumerate the same
 * canon store in different orders, so the two surfaces could disagree on
 * `GOALS-008` findings for identical input. Structural depth has no such
 * dependency. A goal with no `type` still surfaces as a genuine `GOALS-006`
 * finding — this resolver never synthesizes a type label to paper over one.
 */

import { isObject, str, strArray, descendantsOf, parentChainDepth, stripEnvelope } from '../canon-resolver-utils.js';

export interface GoalsViewConfig {
  scope?: {
    root_goal?: string | null;
    period?: string | null;
    type_filter?: string[] | null;
    valid_at?: string | null;
  };
  goal_types?: Array<{ name: string; level: number }>;
  display?: {
    depth?: number | null;
    collapsed?: string[];
  };
}

export interface GoalsCanonSources {
  elements: unknown[];
}

/** GOAL elements by id (`notation: goal`). */
function collectGoalElements(docs: unknown[]): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const doc of docs) {
    if (!isObject(doc)) continue;
    if (str(doc['notation']) !== 'goal') continue;
    const id = str(doc['id']);
    if (!id) continue;
    if (!out.has(id)) out.set(id, doc); // first definition wins
  }
  return out;
}

/**
 * Returns true when the parsed view document uses the canon-projection form
 * (`view_config` key present, no inline `goals[]`). Used by the preview and
 * CLI to decide whether to run the resolver or fall back to direct
 * `parseCanonicalGoals` on the inline document.
 */
export function isGoalsViewDoc(parsed: unknown): boolean {
  if (!isObject(parsed)) return false;
  return 'view_config' in parsed && !('goals' in parsed);
}

/**
 * Assemble a flat canonical Goals document from the canon GOAL element
 * store, filtered by the view document's `view_config.scope`. The return
 * value is ready to pass to `parseCanonicalGoals`.
 */
export function resolveGoals(
  viewDoc: unknown,
  sources: GoalsCanonSources,
): Record<string, unknown> {
  if (!isObject(viewDoc)) {
    return { notation: 'goals', goal_types: [], goals: [] };
  }

  const vc = isObject(viewDoc['view_config']) ? viewDoc['view_config'] : {};
  const scope = isObject(vc['scope']) ? vc['scope'] : {};

  const allGoals = collectGoalElements(sources.elements);

  // 1. Scope by root_goal (this goal + its descendants), or every goal when
  // omitted (§5.1: "Omit to show all root goals").
  const rootGoal = str(scope['root_goal']);
  let candidateIds: Set<string>;
  if (rootGoal) {
    candidateIds = allGoals.has(rootGoal) ? descendantsOf(rootGoal, allGoals) : new Set();
  } else {
    candidateIds = new Set(allGoals.keys());
  }

  // 2. Narrow by period — matched against the element's own `period` field
  // when present (the GOAL element schema, ELEMENT_PRIMITIVES.md §7.2, does
  // not define this field explicitly; treated as a forward-compatible tag).
  const period = str(scope['period']);
  if (period) {
    candidateIds = new Set(
      [...candidateIds].filter((id) => str(allGoals.get(id)?.['period']) === period),
    );
  }

  // 3. Narrow by type_filter — only goals of a listed type.
  const typeFilter = strArray(scope['type_filter']);
  if (typeFilter.length > 0) {
    candidateIds = new Set(
      [...candidateIds].filter((id) => {
        const t = str(allGoals.get(id)?.['type']);
        return t !== undefined && typeFilter.includes(t);
      }),
    );
  }

  // 4. Narrow by valid_at — only goals in effect on that date. Goals with no
  // valid_from are not lifecycle-tracked and are kept (permissive default,
  // matching the action/dgca resolvers' stance).
  const validAt = str(scope['valid_at']);
  if (validAt) {
    candidateIds = new Set(
      [...candidateIds].filter((id) => {
        const el = allGoals.get(id);
        const from = str(el?.['valid_from']);
        const to = str(el?.['valid_to']);
        if (from && validAt < from) return false;
        if (to && validAt > to) return false;
        return true;
      }),
    );
  }

  const explicitGoalTypes = Array.isArray(vc['goal_types'])
    ? (vc['goal_types'] as unknown[]).filter(isObject)
    : undefined;

  // Element fields map onto Goal fields unchanged — the admission/lifecycle
  // envelope fields carry no rendering meaning for `parseCanonicalGoals` and
  // are dropped.
  let selectedGoals: Array<Record<string, unknown>>;
  let goalTypes: Array<Record<string, unknown>>;

  if (explicitGoalTypes) {
    // Main-line case: goals keep their own authored `level`, validated
    // against the explicit table by parseCanonicalGoals as usual.
    selectedGoals = [...candidateIds].map((id) => ({ ...stripEnvelope(allGoals.get(id)!), id }));
    goalTypes = explicitGoalTypes;
  } else {
    // §5.2 fallback: level is the goal's structural depth in the parent
    // chain, not its (untrustworthy, order-dependent) stored `level` field.
    const depthMemo = new Map<string, number>();
    selectedGoals = [...candidateIds].map((id) => {
      const { level: _level, ...rest } = stripEnvelope(allGoals.get(id)!);
      return { ...rest, id, level: parentChainDepth(id, allGoals, depthMemo) };
    });
    const seen = new Map<string, number>();
    for (const g of selectedGoals) {
      const name = typeof g['type'] === 'string' ? g['type'] : undefined;
      if (name !== undefined && !seen.has(name)) {
        seen.set(name, g['level'] as number);
      }
    }
    goalTypes = [...seen.entries()].map(([name, level]) => ({ name, level }));
  }

  return {
    notation: 'goals',
    id: viewDoc['id'],
    name: viewDoc['name'],
    spec_version: viewDoc['spec_version'],
    description: viewDoc['description'],
    period: viewDoc['period'],
    goal_types: goalTypes,
    goals: selectedGoals,
  };
}
