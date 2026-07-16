/**
 * FGCA canon resolver — assembles a flat canonical FGCA document from a
 * view_config projection and a canon element/relation store (VP-3).
 *
 * Output shape matches the flat form that `parseCanonicalFGCA` expects:
 * top-level `factors[]`, `goals[]`, `changes[]`, `actions[]` with typed
 * string IDs.  Filesystem-free — callable from unit tests without vscode.
 */

export interface FGCAViewConfig {
  goals?: {
    filter?: 'all' | 'ids' | 'tags';
    ids?: string[];
    tags?: string[];
  };
  factors?: { surface?: 'derived' | 'all' };
  changes?: { surface?: 'derived' | 'all' };
  activities?: { surface?: 'derived' | 'all' };
  display?: { depth?: number | null; collapsed?: string[] };
}

export interface FGCACanonSources {
  elements: unknown[];
  relations: unknown[];
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

function collectByNotation(
  docs: unknown[],
  notation: string,
): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const doc of docs) {
    if (!isObject(doc)) continue;
    if (str(doc['notation']) !== notation) continue;
    const id = str(doc['id']);
    if (!id) continue;
    if (!out.has(id)) out.set(id, doc);
  }
  return out;
}

/**
 * Returns true when the parsed view document uses the canon-projection form
 * (`view_config` key present, no inline `factors[]` / `goals[]` arrays).
 * Used by the preview to decide whether to run the resolver or fall back to
 * direct `parseCanonicalFGCA` on the inline document.
 */
export function isFGCAViewDoc(parsed: unknown): boolean {
  if (!isObject(parsed)) return false;
  return 'view_config' in parsed && !('factors' in parsed) && !('goals' in parsed);
}

/**
 * Assemble a flat canonical FGCA document from the canon element store,
 * filtered by the view document's `view_config`.  The return value is ready
 * to pass to `parseCanonicalFGCA`.
 *
 * Cross-reference fields (`goal.factors[]`, `change.goals[]`,
 * `action.changes[]`) are carried from the canon elements unchanged; the
 * resolver decides which elements to include, not how they are shaped.
 */
export function resolveFGCA(
  viewDoc: unknown,
  sources: FGCACanonSources,
): Record<string, unknown> {
  if (!isObject(viewDoc)) {
    return { notation: 'dgca', factors: [], goals: [], changes: [], actions: [] };
  }

  const vc = isObject(viewDoc['view_config']) ? viewDoc['view_config'] : {};
  const goalsConf = isObject(vc['goals']) ? vc['goals'] : {};
  const factorsConf = isObject(vc['factors']) ? vc['factors'] : {};
  const changesConf = isObject(vc['changes']) ? vc['changes'] : {};
  const activitiesConf = isObject(vc['activities']) ? vc['activities'] : {};

  const factorElemsLegacy = collectByNotation(sources.elements, 'factor');
  const factorElemsNew = collectByNotation(sources.elements, 'driver');
  const factorElems = new Map([...factorElemsLegacy, ...factorElemsNew]);
  const goalElems = collectByNotation(sources.elements, 'goal');
  const changeElems = collectByNotation(sources.elements, 'change');
  // `action` is canonical since methodology 1.0; `activity` is the deprecated
  // pre-rename alias, still accepted (elements/24-action.md §"Deprecated alias").
  const activityElemsLegacy = collectByNotation(sources.elements, 'activity');
  const activityElemsNew = collectByNotation(sources.elements, 'action');
  const activityElems = new Map([...activityElemsLegacy, ...activityElemsNew]);

  // 1. Select goal set
  const goalsFilter = str(goalsConf['filter']) ?? 'all';
  let selectedGoals: Array<Record<string, unknown>>;
  if (goalsFilter === 'ids') {
    const ids = strArray(goalsConf['ids']);
    selectedGoals = ids.flatMap((id) => { const g = goalElems.get(id); return g ? [g] : []; });
  } else if (goalsFilter === 'tags') {
    const tags = strArray(goalsConf['tags']);
    selectedGoals = [...goalElems.values()].filter((g) =>
      strArray(g['tags']).some((t) => tags.includes(t)),
    );
  } else {
    // 'all' — include every goal element in the canon store
    selectedGoals = [...goalElems.values()];
  }
  const selectedGoalIds = new Set(
    selectedGoals.map((g) => str(g['id'])).filter((x): x is string => x !== undefined),
  );

  // 2. Select factors: derived follows goal.factors[]; all = every factor
  let selectedFactors: Array<Record<string, unknown>>;
  if (str(factorsConf['surface']) === 'all') {
    selectedFactors = [...factorElems.values()];
  } else {
    const refIds = new Set<string>();
    for (const g of selectedGoals) for (const fid of strArray(g['factors'])) refIds.add(fid);
    selectedFactors = [...refIds].flatMap((id) => { const f = factorElems.get(id); return f ? [f] : []; });
  }

  // 3. Select changes: derived = changes referencing ≥1 selected goal
  let selectedChanges: Array<Record<string, unknown>>;
  if (str(changesConf['surface']) === 'all') {
    selectedChanges = [...changeElems.values()];
  } else {
    selectedChanges = [...changeElems.values()].filter((c) =>
      strArray(c['goals']).some((gid) => selectedGoalIds.has(gid)),
    );
  }
  const selectedChangeIds = new Set(
    selectedChanges.map((c) => str(c['id'])).filter((x): x is string => x !== undefined),
  );

  // 4. Select activities: derived = reference ≥1 selected change or goal (degenerate FGA link)
  let selectedActivities: Array<Record<string, unknown>>;
  if (str(activitiesConf['surface']) === 'all') {
    selectedActivities = [...activityElems.values()];
  } else {
    selectedActivities = [...activityElems.values()].filter((a) =>
      strArray(a['changes']).some((cid) => selectedChangeIds.has(cid)) ||
      strArray(a['goals']).some((gid) => selectedGoalIds.has(gid)),
    );
  }

  return {
    notation: 'dgca',
    id: viewDoc['id'],
    name: viewDoc['name'],
    spec_version: viewDoc['spec_version'],
    factors: selectedFactors,
    goals: selectedGoals,
    changes: selectedChanges,
    actions: selectedActivities,
  };
}
