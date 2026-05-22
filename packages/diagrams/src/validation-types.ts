/**
 * Shared validation result shape across every notation module in this
 * package.
 *
 * Before this file existed, each notation declared its own
 * `ValidationError` / `ValidationWarning` / `ValidationResult` triple inside
 * its own `validate.ts`. The shapes happened to agree (or almost agree —
 * some had an optional `path` field, others didn't), but having N parallel
 * declarations made it easy to accidentally drift one of them, and made the
 * "what does our validator return?" answer fuzzier than it should be.
 *
 * The pre-release code review on 2026-05-21 called this out as a
 * `should-fix` cross-module concern; this is the canonical shape.
 *
 * Notations that historically exported PREFIXED type names — `FGCA…` and
 * `Activity…` — keep those names as type aliases re-exported from their own
 * modules, so existing consumers continue to compile.
 */
export interface ValidationError {
  code: string;
  message: string;
  /** Optional JSON-path-ish locator inside the source document. */
  path?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
