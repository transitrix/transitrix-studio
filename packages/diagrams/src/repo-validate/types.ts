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

/** One resolved canon element, projected from a `RepoDoc` for a non-JS
 *  consumer (DSM's Go importer). The top-level fields below are a stable,
 *  minimal identity projection — kept for backward compatibility with
 *  consumers that only need `id`/`name`/`notation`/`type`/`layer`/`sourceFile`
 *  (mirrors DSM's `methodology_element` table). `data` carries the complete
 *  parsed element alongside it, so a consumer never needs an engine schema
 *  change to read a canon-authored field the engine already parsed (a goal's
 *  `level`/`parent`/`description`/`link`/`tags`, an action's scheduling and
 *  ownership fields, etc.) — the engine owns each notation's field set
 *  (ELEMENT_PRIMITIVES.md), so its output stays notation-shaped rather than
 *  growing a bespoke field list per consumer. This is the faithful-projection
 *  fallback: a typed per-notation shape may replace `data` later, but the
 *  contract must not be curated down to what one consumer currently needs. */
export interface ResolvedElementRecord {
  /** Canonical id, e.g. `DRIVER-COMP-1`. */
  id: string;
  /** `name` field; `''` when absent (should not happen for an admitted element). */
  name: string;
  /** The element TYPE's short name — the doc's `notation` field, e.g. `driver`, `goal`, `capability`. */
  notation: string;
  /** Subtype from the TYPE's controlled vocabulary (ELEMENT_PRIMITIVES.md §3), e.g. `internal`/`external` for DRIVER. Omitted when the doc has none. */
  type?: string;
  /** `motivation` / `business` / `application` / `technology` / `implementation`. Read from the doc's `layer` field when present, else derived from the `canon/elements/<NN>_<layer>/…` folder. */
  layer?: string;
  /** Source file path, relative to the scanned root. */
  sourceFile: string;
  /** The full parsed element document — every field its author supplied,
   *  unfiltered (including the admission/lifecycle envelope). The same
   *  `RepoDoc.data` the repo-scope validator already consumes, so this
   *  projection and the validation pass never see a different parse. */
  data: Record<string, unknown>;
}

/** One resolved canon relation, projected from a `RepoDoc`. Only
 *  emitted when both endpoints resolve to a non-empty id — an endpoint that
 *  fails to resolve is already surfaced as a referential-integrity finding by
 *  `validateRepoModel`; this projection does not duplicate that as a
 *  half-resolved record. */
export interface ResolvedRelationRecord {
  /** Canonical id, e.g. `REL-EMP-PERSON-OPS-1`. `''` when the relation doc has no `id`. */
  id: string;
  /** The relation's `type` field, e.g. `employment`, `realizes`. Omitted when the doc has none. */
  kind?: string;
  /** Resolved `from` (or legacy `source`) endpoint id. */
  source: string;
  /** Resolved `to` (or legacy `target`) endpoint id. */
  target: string;
  /** Source file path, relative to the scanned root. */
  sourceFile: string;
}

/** The resolved element/relation records for a repo-scope run —
 *  the shape `transitrix validate --scope=repo --json --include-model` adds
 *  alongside the validation findings. */
export interface ResolvedRepoModel {
  elements: ResolvedElementRecord[];
  relations: ResolvedRelationRecord[];
}
