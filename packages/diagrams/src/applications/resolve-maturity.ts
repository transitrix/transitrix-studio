// Render-time resolution of the applications-catalogue's sidecar-bound
// time_varying fields (owner_role, vendor, maturity — notations/views/
// 10-applications.md §5a, CONTRACT.md §9.4). VERSIONED-004 rejects these
// inline on an admitted catalogue entry, so a compliant document never
// carries them — a renderer that only reads the document straight shows
// blank cells for every field the maturity decision moved out.
//
// Pure: no I/O, no repo walk. The host (VS Code extension, IntelliJ/JCEF,
// CLI) already owns loading canon/elements/** (canon-loader.ts's shared FS
// layer) — this module only knows how to pick sidecars out of that pool and
// resolve them at a date.
//
// Per the 2026-08-05 hub decision (proposal #1022): this is a read model,
// never storage. Callers render an augmented, ephemeral copy of the
// application row and must never serialise it back — the sidecar stays the
// only place these fields are written.

import { parseSidecar, resolveAttributes } from '../versioned-attribute/index.js';
import type { Application } from './types.js';

export interface ResolvedApplicationAttributes {
  owner_role?: string;
  vendor?: string;
  maturity?: number;
}

/** Pick every sidecar out of a raw canon/elements/** doc pool and resolve
 *  owner_role/vendor/maturity at `atDate`, keyed by the sidecar's target id
 *  (== an application's `app_id`, per the notation's element-file pairing). */
export function resolveApplicationAttributes(
  rawElementDocs: unknown[],
  atDate: string,
): Map<string, ResolvedApplicationAttributes> {
  const byAppId = new Map<string, ResolvedApplicationAttributes>();
  for (const doc of rawElementDocs) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) continue;
    const sidecar = parseSidecar(doc as Record<string, unknown>);
    if (!sidecar) continue;
    const resolved = resolveAttributes(sidecar, atDate);
    const entry: ResolvedApplicationAttributes = {};
    if (typeof resolved['owner_role'] === 'string') entry.owner_role = resolved['owner_role'];
    if (typeof resolved['vendor'] === 'string') entry.vendor = resolved['vendor'];
    if (typeof resolved['maturity'] === 'number') entry.maturity = resolved['maturity'];
    if (Object.keys(entry).length > 0) byAppId.set(sidecar.target, entry);
  }
  return byAppId;
}

/** Merge resolved sidecar values into a rendering copy of an application row.
 *  An inline value would win if present, but VERSIONED-004 already forbids
 *  that on an admitted document — this is a display fallback, not a
 *  migration tool. The returned object is a plain copy; nothing here writes
 *  it anywhere. */
export function withResolvedAttributes(
  app: Application,
  resolved: Map<string, ResolvedApplicationAttributes>,
): Application {
  const r = resolved.get(app.app_id);
  if (!r) return app;
  return {
    ...app,
    owner_role: app.owner_role ?? r.owner_role,
    vendor: app.vendor ?? r.vendor,
    maturity: app.maturity ?? r.maturity,
  };
}
