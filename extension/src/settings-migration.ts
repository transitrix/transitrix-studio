// Cervin → Transitrix settings migration (CLAUDE.md §Cervin naming, P2).
//
// The canonical configuration keys are `transitrix.*`; the legacy `cervin.*`
// keys are kept as read-only fallbacks through the 1.x line (removed in 2.0.0).
// The pure resolver below has no `vscode` dependency so it can be unit-tested
// from the root vitest suite; the vscode-aware wiring lives in
// `source-files.ts` / `extension.ts`.

export interface ResolvedSetting<T> {
  value: T | undefined;
  /** true when the effective value came from the legacy `cervin.*` key. */
  usedCervinFallback: boolean;
}

/**
 * Prefer the canonical `transitrix.*` value; fall back to the legacy `cervin.*`
 * value only when the new key is unset or empty. `isEmpty` decides what "unset"
 * means for the setting's type (e.g. an empty array). `undefined` always counts
 * as unset.
 */
export function resolveCervinFallback<T>(
  transitrixValue: T | undefined,
  cervinValue: T | undefined,
  isEmpty: (v: T) => boolean = () => false,
): ResolvedSetting<T> {
  if (transitrixValue !== undefined && !isEmpty(transitrixValue)) {
    return { value: transitrixValue, usedCervinFallback: false };
  }
  if (cervinValue !== undefined && !isEmpty(cervinValue)) {
    return { value: cervinValue, usedCervinFallback: true };
  }
  return { value: transitrixValue ?? cervinValue, usedCervinFallback: false };
}

export const CERVIN_SETTINGS_DEPRECATION_NOTICE =
  'Transitrix Studio: `cervin.*` settings are deprecated and will be removed in 2.0.0 — ' +
  'rename them to `transitrix.*` (e.g. `transitrix.fileExtensions`, `transitrix.exportEnabled`).';
