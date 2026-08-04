// Current-value resolution for a versioned attribute — CONTRACT.md §9.2.

import type { AttributeVersionEntry, VersionedAttributeSidecar } from './types.js';

/** Pick the entry with the largest `valid_from <= atDate`.
 *  Returns `undefined` when no entry has taken effect yet as of `atDate`
 *  (the attribute has not yet taken its first value — CONTRACT.md §9.2 rule
 *  4). Returns `null` when the resolved entry is itself a gap marker
 *  (`value: null` — attribute currently unset). */
export function resolveAttributeValue(
  entries: AttributeVersionEntry[] | undefined,
  atDate: string,
): unknown {
  if (!entries || entries.length === 0) return undefined;
  let best: AttributeVersionEntry | undefined;
  for (const entry of entries) {
    if (entry.valid_from <= atDate && (!best || entry.valid_from > best.valid_from)) {
      best = entry;
    }
  }
  return best ? best.value : undefined;
}

/** Resolve every attribute in a sidecar at `atDate`. An attribute with no
 *  entry yet in effect is omitted from the result (equivalent to
 *  `resolveAttributeValue` returning `undefined`) rather than reported as
 *  `null`, which is reserved for an explicit gap marker. */
export function resolveAttributes(
  sidecar: VersionedAttributeSidecar | null | undefined,
  atDate: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!sidecar) return out;
  for (const name of Object.keys(sidecar.attribute_versions)) {
    const value = resolveAttributeValue(sidecar.attribute_versions[name], atDate);
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/** Today, as a quoted-ISO-8601 date string — the default projection date
 *  every resolver/renderer falls back to when the caller supplies none. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
