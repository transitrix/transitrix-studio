/**
 * Shared primitives for the per-notation canon-projection resolvers
 * (activities/resolver.ts, goals/resolver.ts — fgca/resolver.ts predates this
 * module and keeps its own copies). Each resolver assembles a flat document
 * from a canon element store filtered by a view_config.scope block; these
 * helpers are the parts that don't vary by notation.
 */

export function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** A non-empty string, trimmed. */
export function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

export function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/** `rootId` and every element reachable by following `parent` links downward,
 *  per the element map's own `parent` field. Used to scope a projection to a
 *  root element and its transitive descendants (WBS / goal hierarchy / etc). */
export function descendantsOf(
  rootId: string,
  all: Map<string, Record<string, unknown>>,
): Set<string> {
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

/** Depth of `id` in its `parent` chain within `all` (root = 0, each step up
 *  adds 1). Cycle-safe (a cycle resolves the entering node to depth 0) and
 *  memoized across calls via the shared `memo` map. */
export function parentChainDepth(
  id: string,
  all: Map<string, Record<string, unknown>>,
  memo: Map<string, number> = new Map(),
  visiting: Set<string> = new Set(),
): number {
  const cached = memo.get(id);
  if (cached !== undefined) return cached;
  if (visiting.has(id)) {
    memo.set(id, 0);
    return 0;
  }
  const el = all.get(id);
  const parent = el ? str(el['parent']) : undefined;
  if (!parent || !all.has(parent)) {
    memo.set(id, 0);
    return 0;
  }
  visiting.add(id);
  const level = parentChainDepth(parent, all, memo, visiting) + 1;
  visiting.delete(id);
  memo.set(id, level);
  return level;
}

/** The admission/lifecycle envelope fields (CONTRACT.md §6-7) every canon
 *  element carries but that carry no rendering/validation meaning once
 *  projected into a flat notation-specific document. */
const ENVELOPE_FIELDS = ['notation', 'zone', 'admitted_at', 'admitted_by', 'gate_checks', 'valid_from', 'valid_to'] as const;

/** `el` with the admission/lifecycle envelope fields removed. */
export function stripEnvelope(el: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...el };
  for (const field of ENVELOPE_FIELDS) delete rest[field];
  return rest;
}
