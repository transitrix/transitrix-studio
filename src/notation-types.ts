// Types and pure helpers shared by every per-notation registration module
// under `src/validators/`. Deliberately side-effect-free (no filesystem, no
// dynamic import) and separate from `notation-registry.ts`'s discovery logic:
// each `src/validators/*.ts` file is bundled as its own esbuild entry
// (scripts/build-cli-package.mjs), and discovery's top-level `await` has I/O
// side effects esbuild cannot tree-shake away — importing it from here would
// embed a second, wrongly-rooted copy of the directory scan in every
// validator's own bundle. See notation-registry.ts for the discovery side.

import type { CanonCatalog } from '@transitrix/diagrams/typed-id.js';

/** The shape every notation validator returns: code/message findings split into
 *  blocking errors and advisory warnings. The concrete result types the
 *  underlying `@transitrix/diagrams` validators return carry extra fields
 *  (parsed model, etc.) — structurally assignable to this. */
export interface NotationValidationResult {
  valid: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}

export interface ValidateNotationOptions {
  /** Repo-relative or absolute path — used for codex folder-jurisdiction checks. */
  filePath?: string;
  /** Admitted canon catalogue — enables catalogue-aware checks (e.g. REQ-002, ASSERT-002..005). */
  catalog?: CanonCatalog;
  /**
   * In-effect `process_parent` edges (child → parent). Enables BP-014 on a
   * process-blueprint document when `validate --scope=repo` has the relation
   * catalogue loaded.
   */
  processParentEdges?: ReadonlyArray<{ from: string; to: string }>;
  /** Grid-template name (matrix subset, §6a) — e.g. "raci" — opts a `blocks`
   *  document into that template's extra GridRule checks. */
  template?: string;
}

export type NotationValidator = (
  input: unknown,
  options?: ValidateNotationOptions,
) => NotationValidationResult;

/** Wrap a validator that ignores `ValidateNotationOptions` (most package
 *  validators — they take only the parsed document). */
export function wrapValidator(fn: (input: unknown) => NotationValidationResult): NotationValidator {
  return (input, _options = {}) => fn(input);
}

/** Narrow an `@transitrix/diagrams` validator result (which may carry extra
 *  fields, e.g. a parsed model) down to the plain code/message shape. */
export function mapPackageResult(result: {
  valid: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}): NotationValidationResult {
  return {
    valid: result.valid,
    errors: result.errors.map((e) => ({ code: e.code, message: e.message })),
    warnings: result.warnings.map((w) => ({ code: w.code, message: w.message })),
  };
}

/** Which `canon/<dir>/**` repo-scope validate sweeps this notation's standalone
 *  element files from, applying the compliance-catalogue context — omitted for
 *  every view/diagram notation, which has no such sweep. */
export type ComplianceSweepDir = 'elements' | 'assertions' | 'verifications' | 'validations';

export interface ValidatorRegistration {
  /** The document's `notation:` field value this validator handles. */
  notation: string;
  validator: NotationValidator;
  /** Set when this notation's canonical on-disk form is `<name>.<notation>.transitrix.yaml`. */
  canonicalViewExtension?: true;
  /** Set when repo-scope validate sweeps this notation's standalone element
   *  files from `canon/<complianceSweepDir>/**` with the catalogue context. */
  complianceSweepDir?: ComplianceSweepDir;
}
