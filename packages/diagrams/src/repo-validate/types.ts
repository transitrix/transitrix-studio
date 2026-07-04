// Repo-scope validation types (vkgeorgia/transitrix-studio#141).
//
// `validate --scope=repo` runs whole-model checks over a loaded `canon/` tree —
// referential integrity, atomicity, ID uniqueness, policy — the checks that the
// methodology's Python `.validators/lint.py` owns today. This converges those
// checks onto the shared TypeScript model so there is a single validation
// runtime (methodology ADR "Validation Two-Axis Model"; Studio decision
// "Validation Runtime Convergence").
//
// The finding shape is deliberately minimal — `{ scope, id, message }`. The
// richer `target` / `category` reporting taxonomy is explicitly DEFERRED per the
// ADR until a real consumer needs it; do not add it here.

/** A single repo-scope validation finding. Shape is frozen at `{ scope, id, message }`. */
export interface RepoFinding {
  /** Always `'repo'` — the execution axis this finding came from. */
  scope: 'repo';
  /**
   * The offending element/relation id, or `''` when the finding is not tied to
   * a single id (e.g. a YAML syntax error in a file with no parseable id).
   */
  id: string;
  /** Human-readable description of the violation. */
  message: string;
}

/** A parsed canon document fed to the repo validator. IO (the filesystem walk)
 *  lives in the CLI; the validator itself stays pure and testable. */
export interface RepoDoc {
  /** Source file path, relative to the scanned root — used in messages. */
  path: string;
  /**
   * The parsed top-level YAML mapping, or `null` when the file failed to parse.
   * A `null` data with a non-empty `parseError` produces a syntax finding.
   */
  data: Record<string, unknown> | null;
  /** Set when the YAML failed to parse; surfaced as a syntax finding. */
  parseError?: string;
}

/** The loaded repository model: element docs and relation docs, partitioned by
 *  canon zone exactly as `lint.py` partitions them (`canon/elements/**` vs
 *  `canon/relations/**`). */
export interface RepoModelInput {
  /** Documents found under `canon/elements/**`. */
  elements: RepoDoc[];
  /** Documents found under `canon/relations/**`. */
  relations: RepoDoc[];
}
