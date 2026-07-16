/**
 * Action Schedule canon resolver — assembles a flat canonical Action document
 * from a view_config projection and a canon element store (methodology
 * `notations/views/07-action.md` §4 "Projection form (Full tier —
 * post-promotion)"). Mirrors `fgca/resolver.ts`'s `resolveFGCA`/`isFGCAViewDoc`
 * pattern for the `action` notation.
 *
 * Output shape matches the flat inline form `validateActivities` expects:
 * top-level `project` block + `actions[]`, with ACTION element fields carried
 * through unchanged except `type` → `activity_type` (the internal Activity
 * field name; `type` is the canonical element field per elements/24-action.md
 * §2). Filesystem-free — callable from unit tests without vscode.
 */

export interface ActionViewConfig {
  scope?: {
    root_action?: string;
    goals?: string[];
    type_filter?: string[];
    valid_at?: string | null;
  };
  schedule?: {
    start_date?: string;
    calendar?: {
      working_days?: string[];
      hours_per_day?: number;
      holidays?: string[];
    };
  };
  display?: {
    view?: 'network' | 'gantt' | 'both';
    depth?: number | null;
    collapsed?: string[];
  };
}

export interface ActionCanonSources {
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

/** ACTION elements by id. `notation: action` is canonical; `notation: activity`
 *  is the deprecated pre-2026-06-25 alias (elements/24-action.md §"Deprecated
 *  alias") — accepted the same way `collectByNotation` callers elsewhere do. */
function collectActionElements(docs: unknown[]): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const doc of docs) {
    if (!isObject(doc)) continue;
    const notation = str(doc['notation']);
    if (notation !== 'action' && notation !== 'activity') continue;
    const id = str(doc['id']);
    if (!id) continue;
    if (!out.has(id)) out.set(id, doc); // first definition wins
  }
  return out;
}

/**
 * Returns true when the parsed view document uses the canon-projection form
 * (`view_config` key present, no inline `actions[]`). Used by the preview and
 * CLI to decide whether to run the resolver or fall back to direct
 * `validateActivities` on the inline document.
 */
export function isActionViewDoc(parsed: unknown): boolean {
  if (!isObject(parsed)) return false;
  return 'view_config' in parsed && !('actions' in parsed);
}

/** `rootId` and every element reachable by following `parent` links downward
 *  (Initiative → Programme → Project → Task, elements/24-action.md §1). */
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
 * Assemble a flat canonical Action document from the canon ACTION element
 * store, filtered by the view document's `view_config.scope`. The return
 * value is ready to pass to `validateActivities`.
 */
export function resolveAction(
  viewDoc: unknown,
  sources: ActionCanonSources,
): Record<string, unknown> {
  if (!isObject(viewDoc)) {
    return { notation: 'action', actions: [] };
  }

  const vc = isObject(viewDoc['view_config']) ? viewDoc['view_config'] : {};
  const scope = isObject(vc['scope']) ? vc['scope'] : {};
  const schedule = isObject(vc['schedule']) ? vc['schedule'] : {};

  const allActions = collectActionElements(sources.elements);

  // 1. Scope by root_action (this action + its descendants), or the full
  // catalogue when omitted (§5.1: "Omit to include elements from the full
  // catalogue (or use goals/type_filter for other scoping)").
  const rootAction = str(scope['root_action']);
  let candidateIds: Set<string>;
  if (rootAction) {
    candidateIds = allActions.has(rootAction) ? descendantsOf(rootAction, allActions) : new Set();
  } else {
    candidateIds = new Set(allActions.keys());
  }

  // 2. Narrow by goals — only actions linked to at least one listed GOAL.
  const goalsFilter = strArray(scope['goals']);
  if (goalsFilter.length > 0) {
    candidateIds = new Set(
      [...candidateIds].filter((id) => strArray(allActions.get(id)?.['goals']).some((g) => goalsFilter.includes(g))),
    );
  }

  // 3. Narrow by type_filter — only actions of a listed type.
  const typeFilter = strArray(scope['type_filter']);
  if (typeFilter.length > 0) {
    candidateIds = new Set(
      [...candidateIds].filter((id) => {
        const el = allActions.get(id);
        const t = str(el?.['type']) ?? str(el?.['activity_type']);
        return t !== undefined && typeFilter.includes(t);
      }),
    );
  }

  // 4. Narrow by valid_at — only actions in effect on that date. Actions with
  // no valid_from are not lifecycle-tracked and are kept (permissive default,
  // matching the resolver's general "missing = not excluded" stance).
  const validAt = str(scope['valid_at']);
  if (validAt) {
    candidateIds = new Set(
      [...candidateIds].filter((id) => {
        const el = allActions.get(id);
        const from = str(el?.['valid_from']);
        const to = str(el?.['valid_to']);
        if (from && validAt < from) return false;
        if (to && validAt > to) return false;
        return true;
      }),
    );
  }

  // Element fields map onto Activity fields unchanged, except the canonical
  // `type` (elements/24-action.md §2) which becomes the internal `activity_type`
  // (types.ts `Activity.activity_type`) — the admission/lifecycle envelope
  // fields (zone, admitted_*, gate_checks, valid_from/valid_to) are dropped,
  // they carry no schedule/render meaning for `validateActivities`.
  const selectedActions = [...candidateIds].map((id) => {
    const el = allActions.get(id)!;
    const {
      notation: _notation,
      zone: _zone,
      admitted_at: _admittedAt,
      admitted_by: _admittedBy,
      gate_checks: _gateChecks,
      valid_from: _validFrom,
      valid_to: _validTo,
      type,
      activity_type,
      ...rest
    } = el;
    const resolvedType = type ?? activity_type;
    return {
      ...rest,
      id,
      ...(resolvedType !== undefined ? { activity_type: resolvedType } : {}),
    };
  });

  const project: Record<string, unknown> = {};
  const startDate = str(schedule['start_date']);
  if (startDate) project['start_date'] = startDate;
  if (isObject(schedule['calendar'])) project['calendar'] = schedule['calendar'];

  const out: Record<string, unknown> = {
    notation: 'action',
    id: viewDoc['id'],
    title: viewDoc['name'],
    spec_version: viewDoc['spec_version'],
    description: viewDoc['description'],
    actions: selectedActions,
  };
  if (Object.keys(project).length > 0) out['project'] = project;
  return out;
}
