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
 * used as-is (the documented projection-form shape always includes it). When
 * absent, the spec allows a renderer to "infer levels from the parent chain
 * depth" — this resolver instead derives one `goal_types` entry per distinct
 * `type` name actually present on the selected GOAL elements (first-seen
 * `level` wins), a simpler and more honest choice: a GOAL element missing
 * `type`/`level` surfaces as a GOALS-006 finding from `parseCanonicalGoals`
 * rather than being silently papered over by structural inference.
 */

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

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
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

/** `rootId` and every element reachable by following `parent` links downward. */
function descendantsOf(rootId: string, all: Map<string, Record<string, unknown>>): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const [id, el] of all) {
    const parent = str(el['parent']);
    if (!parent) continue;
    const list = childrenByParent.get(parent) ?? [];
    list.push(id);
    childrenByParent.set(parent, list);
  }
  const result = new Set<string>();
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const child of childrenByParent.get(id) ?? []) queue.push(child);
  }
  return result;
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

  // Element fields map onto Goal fields unchanged — the admission/lifecycle
  // envelope fields (zone, admitted_*, gate_checks, valid_from/valid_to)
  // carry no rendering meaning for `parseCanonicalGoals` and are dropped.
  const selectedGoals: Array<Record<string, unknown>> = [...candidateIds].map((id) => {
    const el = allGoals.get(id)!;
    const {
      notation: _notation,
      zone: _zone,
      admitted_at: _admittedAt,
      admitted_by: _admittedBy,
      gate_checks: _gateChecks,
      valid_from: _validFrom,
      valid_to: _validTo,
      ...rest
    } = el;
    return { ...rest, id };
  });

  const explicitGoalTypes = Array.isArray(vc['goal_types'])
    ? (vc['goal_types'] as unknown[]).filter(isObject)
    : undefined;

  let goalTypes: Array<Record<string, unknown>>;
  if (explicitGoalTypes) {
    goalTypes = explicitGoalTypes;
  } else {
    const seen = new Map<string, number>();
    for (const g of selectedGoals) {
      const name = typeof g['type'] === 'string' ? g['type'] : undefined;
      const level = typeof g['level'] === 'number' ? g['level'] : undefined;
      if (name !== undefined && level !== undefined && !seen.has(name)) {
        seen.set(name, level);
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
