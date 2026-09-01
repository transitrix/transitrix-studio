# Changelog

## [3.6.2] — 2026-09-01

### Added

- **DGCA and DGA previews filter the chain by column.** Scope replaces the single root-goal selector with Driver, Goal, Change, and Activity dropdowns (labelled D / G / C / A). Each defaults to All; chosen values combine with AND, and neighbouring lists shrink to the remaining thread. DGA, and DGCA with the Changes layer off, hide the Change selector. Goals preview keeps Root and Level. (#614)
- **Goals, DGCA, and DGA previews offer Straight, Bezier, and Polyline arrow paths.** The curvature slider remains for Bezier only. Action preview is unchanged. (#614)

### Packages

- `@transitrix/diagrams` 1.12.1 → 1.12.2 — column chain scope on DGCA/DGA, preview edge path styles.
- `@transitrix/cli` 2.8.1 → 2.8.2 — rebundles diagrams (no compiler source change in this span).

## [3.6.1] — 2026-08-31

### Fixed

- **Preview resolves the canon root from the adopter manifest under the normative layout.** This release ships the fix described in 3.6.0's release notes but missing from that VSIX. Opening a projection view at `views/<notation>/*.yaml` now finds its canon store by locating `transitrix.yaml` and then `canon/` as its sibling, instead of walking up looking for an ancestor literally named `canon`. Files under `canon/elements/` keep resolving under the legacy layout, and all nine preview modules that share this resolver pick up the fix. (transitrix-hq#457, #600)
- **Goal-tree and capability-map collapse toggle is visible on expanded parents.** The ± button on a node with children was gated on `hasHiddenChildren`, which is only true after the subtree is already hidden — so a fully expanded tree never showed the control. The toggle now appears whenever the node has children (minus to collapse, plus to expand), matching the static capability-tree SVG renderer.

## [3.6.0] — 2026-08-31

### Added

- **DGCA chain view shows the ACTION scale level as a badge.** Action nodes display their type (Initiative / Programme / Project / Task), read from the activity's `type` field, as a small label in the node's top-right corner; nodes without a `type` render unchanged. (#601)
- **Goal-scoped DGCA projections tolerate catalogue references outside the selected scope.** When an action or change references a goal that exists in the catalogue but falls outside the current goal filter, the validator no longer reports it as an error; the render output adds a caption explaining the scope limitation. Full-chain views (`goals.filter: all`) are unaffected. (#604)
- **Goals diagrams support a `minimizeCrossings` layout mode.** Siblings are deterministically reordered by ID before placement, producing fewer edge crossings than the default arbitrary order on tangled trees. Opt in per notation via `transitrix.layoutMode.<notation>`; the existing layout stays the default. (#595)
- **A notation the validator cannot read now fails loudly.** Skipped notation files are reported as `NOTATION-SKIP-001` warnings; the new `--strict` flag treats them as errors instead. The `ACT-011` message now clarifies it applies to Gantt/CPM rendering only, not the network view. (#593)

### Changed

- **Listing demonstration transitions to Goals tree.** The recording scenario and fixture now demonstrate a Goals tree with a child goal being added, showing the live preview updating when the YAML is saved. This replaces the prior Blocks demonstration. The GIF itself (`extension/docs/listing.gif`) is ready to be recorded with the updated scenario and fixture. (transitrix-hq#330)
- **Published CLI emits `DGCA-012`/`DGCA-013` instead of retired `FGCA-012`/`FGCA-013` codes.** Per-file DGCA validator codes align with methodology's vocabulary. The driver-reference check now walks the assessment chain (`assessment_influences_goal` relations) in addition to inline `factors`, so a driver linked via an assessment that influences a referenced goal is no longer reported as unreferenced. (#378)
- **Repo-scope strategy-chain rule codes adopt scope prefix `DGCA-REPO-008..014`.** Previously the same codes as per-file DGCA rules, now distinguished with the `REPO` scope. Old `FGCA-008..014` codes remain accepted as deprecated aliases until version 5.0.0 for backwards compatibility. Validation output and `docs/validation.md` reference the new codes; the semantic checks are unchanged. (transitrix-hq#409)
- **Per-file `dgca` validator emits `DGCA-001..015` codes matching the closed vocabulary.** Codes are derived from `notations/vocabulary.yaml`, the authoritative published source; old `FGCA-*` codes remain accepted as aliases until version 5.0.0. `docs/validation.md` now agrees with the vocabulary on every code it prints. (transitrix-hq#417)
- **CLI help and validator output text say `views/` instead of `canon/views`.** Wording in `impact`, `validate --scope=repo` output, and inline comments now matches the normative layout landed in 3.5.0; behavior is unchanged. (#598)

### Fixed

- **`ACT-013` no longer flags parented activities as structurally orphan.** The orphan check now counts a `parent` reference as a valid structural connection, alongside predecessors, successors, and goal links. (#592)
- **Preview resolves the canon root from the adopter manifest under the normative layout.** Opening a projection view at `views/<notation>/*.yaml` now finds its canon store by locating `transitrix.yaml` and then `canon/` as its sibling, instead of walking up looking for an ancestor literally named `canon`. Files under `canon/elements/` keep resolving under the legacy layout, and all nine preview modules that share this resolver pick up the fix. (transitrix-hq#457, #600)
- **Validator reports no longer omit warnings when there are no errors.** Human-readable output prints warning sections whenever findings exist, reserving the single-line "validation passed" for runs with none; machine (`--format=json`) output splits findings into distinct `errors` and `warnings` arrays so downstream consumers can count errors without filtering by severity. (#602)

### Security

- **IntelliJ plugin's Gradle wrapper is integrity-checked.** `gradle-wrapper.properties` now pins `distributionSha256Sum` alongside `distributionUrl`; CI verifies the checksum is present and valid and that the download host stays pinned to `services.gradle.org` on every change to the wrapper properties, failing closed on a missing or invalid pin. (#603)

### Packages

- `@transitrix/diagrams` 1.11.0 → 1.12.0 — goal-scoped DGCA projections, ACTION scale badge, `minimizeCrossings` layout mode, DGCA vocabulary/repo-prefix code changes, `ACT-013` and `NOTATION-SKIP-001` fixes.
- `@transitrix/cli` 2.7.0 → 2.8.0 — `--strict` flag, independent errors/warnings reporting, `views/` wording.

## [3.5.0] — 2026-08-27

### Added

- **Repository-scope validation discovers root-level `views/`.** Methodology 4.1.0 made `views/` a sibling of `canon/` the normative layout. `validate --scope=repo` now scans `views/<notation>/` first and falls back to legacy `canon/views/<notation>/`. A tree that still has both layouts fails with `VIEWS-LAYOUT-001` instead of a silently empty Views section. Per-file `validate <path>` is unchanged. (transitrix-hq#340, #578 / #580)

### Fixed

- **Repo-wide compliance scans stay independent of the editor.** Opening a view under an organisation `canon/` tree no longer couples the workspace-wide dashboard walk to whichever file happens to be active. (#577)

### Changed

- **Listing description and footer attribution.** The extension description emphasizes editor-agnosticism by saying "live preview in your editor" instead of "live preview in VS Code". The footer link points to the author's personal GitHub profile (`github.com/vkgeorgia`) instead of the publisher namespace.

### Packages

- `@transitrix/cli` 2.6.0 → 2.7.0 — root-level `views/` discovery and `VIEWS-LAYOUT-001`. `@transitrix/diagrams` stays 1.11.0 (no production `packages/diagrams/src` change in this span).

## [3.4.2] — 2026-08-26

### Fixed

- **Compliance views scan `canon/` and `codex/`, not every YAML in the workspace.** Opening a view under an organisation `canon/` tree ingests that tree and its sibling `codex/` — the same roots the CLI uses. Palette-opened dashboards still search those folders and skip `node_modules`, `.archive`, `packages`, and test fixtures. Duplicate artefact ids are labelled as duplicates, not as unrecognized notation, and a compliance-impact preview uses the opened view file as its config.

## [3.4.1] — 2026-08-26

### Fixed

- **`@transitrix/cli` prepack keeps `@resvg/resvg-js` external.** BPMN PNG compile uses that native addon; esbuild has no `.node` loader, so the package declares the dependency and lets npm install it per platform.
- **Closing the Compliance Impact Matrix no longer reopens it immediately.** Auto-open treated the YAML becoming active again (the usual result of closing the webview) as a fresh file open. The matrix now opens beside the view-config file, and auto-open skips that same document until you switch away and back or reopen the tab. The toolbar Preview command is unchanged.

## [3.4.0] — 2026-08-25

### Added

- **`ACT-021` when an Action Schedule is scoped by `root_action`.** An ACTION the view would otherwise include that is not that root and not reachable from it via `parent` is omitted from the render with a warning that names both ids. The warning does not fire when `root_action` is absent. Duplicate-id `ACT-004` is unchanged.
- **BPMN presentation export.** A selectable `presentation` profile on BPMN compile / SVG / PNG export lays the diagram out automatically for a 1780 px frame with a 20 px label floor. It is not the live preview — default layout and typography stay as they are.
- **Process Blueprint catalogued columns render from the PROCESS element, and the compliance lane joins on that process (or a STEP of it).** A `PROCESS-…` column header and goal / result come from the child process (`name`, optional `goal` / `result`); restated view fields are ignored. Sketch `STAGE-…` columns keep their authored copy. The compliance overlay pins an assertion when `realised_via` names that process or a step whose home is that process, and no longer treats a sketch `STAGE-…` id as a join key. The STAGE-only fulfilment blueprint still renders as before.
- **Process Blueprint validators admit catalogued `PROCESS-` columns.** A column id may be a document-local `STAGE-…` sketch or an admitted `PROCESS-…`; sketch columns still require `name` / `goal` / `result` on the view (`BP-005`), catalogued columns must not restate those fields (`BP-013`) and must resolve to a `PROCESS` element (`BP-012`). Aspect `stages: […]` arrays accept either form. Composition stays the `process_parent` relation (`PROCESS` → `PROCESS`): self-reference is `REL-007`, a cycle is `REL-008` (warning), and a named parent process with a `PROCESS-` column and no in-effect parent link is `BP-014` (warning — a sketch overlay and a shared subprocess remain well-formed). Existing `STAGE-` only blueprints keep validating.
- **Requirement–Verification Matrix in the editor.** A Command Palette command opens a repository-wide table of every requirement with its direct parent, related test result, and recorded outcome — including an explicit coverage gap when there is no result (`REQ-VERIF-COVERAGE-001`) or only an unresolved one (`REQ-VERIF-COVERAGE-002`). Saving a requirement or verification file refreshes an open table. Export CSV writes the same rows, in the same order, as the view.

### Changed

- **`.ttrs` headers use `recipe_id` / `recipe_version`.** Fixtures, the document renderer, and `transitrix render` follow methodology 4.0.0: the header fields and the identifiers that carry them (`recipeId`, `parseRecipe`, `recipePath`) no longer use `template` as the name of this object. The vendored renderer is pinned to `v4.0.0`.

### Fixed

- **DGCA projection follows `delivers_changes`.** An Action that links to a Change only through the canonical `delivers_changes` field is included when `view_config.actions.surface` is `derived`, and the preview builds Change-to-Action edges from that field. The older `changes` field and `view_config.activities` remain aliases.
- **DGA-mode DGCA omits the Changes column.** A `dgca` document with `view_config.layers.changes: off` (and no `changes:` key) renders Driver → Goal → Action. A four-layer DGCA is unchanged.
- **Release-draft VSIX attach resolves unpublished drafts and uploads through the release-upload host.** The attach job no longer looks up a tag that does not exist until the draft is published, and assets go via `gh release upload` rather than the API host that cannot receive them.

### Packages

- `@transitrix/diagrams` 1.10.0 → 1.11.0 — process-blueprint `PROCESS-` columns, requirement–verification matrix, `ACT-021`, DGCA `delivers_changes` / DGA omit-changes.
- `@transitrix/cli` 2.5.0 → 2.6.0 — paired bump; BPMN presentation export and `.ttrs` `recipe_id` render path.

## [3.3.0] — 2026-08-24

### Added

- **Listing demonstration GIF.** `extension/docs/listing.gif` shows source YAML beside a live Blocks preview; an edit redraws the diagram. The demonstration source is `extension/docs/listing.blocks.transitrix.yaml`.

### Changed

- **Open VSX publish consumes the release-attached VSIX instead of rebuilding.** Creating a release draft now builds the universal VSIX once and attaches it, with its SHA-256, as a release asset; the Open VSX publish job downloads and verifies that exact file rather than repackaging at publish time. The VS Code Marketplace publish workflow no longer triggers automatically on a release — it runs by `workflow_dispatch` only.
- **`ELEM-CANDIDATE-FIELD-001` renamed to `ADMIT-009`.** The candidate-only-field-on-admitted-canon check was Studio-authored under a placeholder code (`ELEMENT_PRIMITIVES.md` §7.29) since methodology had not yet registered one of its own. `transitrix/methodology#505` (merged 2026-08-19) registered `ADMIT-009` for the same rule; Studio's check, tests and docs now use that code. No functional change.
- **Listing demonstration wired into both READMEs.** `extension/README.md` and the repository root `README.md` now reference `extension/docs/listing.gif` by the same absolute `raw.githubusercontent.com` URL, replacing the old `preview.png` reference. A new hygiene check (`scripts/ci-hygiene-image-refs.mjs`) fails the build if a consuming README references a packaged image by a relative path — the cause of the 1.4.3 broken-image regression.

## [3.2.0] — 2026-08-10

### Added

- **`.ttrs` document sources participate in `validate --scope=repo`'s extension and placement checks.** A document source is prose with `{{ … }}` directives rather than a YAML mapping, so it carries no `notation:` field and never reached the per-notation dispatch — a `.ttrs` file could be named or placed any way at all and produce zero findings. New `src/validate-document-source.ts` holds it to the same `HDR-003` extension/content-match rule every other notation is already under (`CONTRACT.md` §3): the filename must be `<basename>.<kind>.ttrs`, and the file must sit in `canon/views/documents/`. The `.trs` near-miss — one keystroke away, and a different, widely used format — is named in words rather than reported as an unknown file. The header's `kind:` must agree with the filename's kind segment (`TTRS-013`), kept under its own code so a kind disagreement never reads as a wrong extension. Kinds (`mrd`/`srs`/`sdd`/…) are the middle segment of the filename, not notations of their own, so there is one registration with a kind check inside it and deliberately no closed kind list to fall out of step with the methodology's.
- **`DRIVER` element-envelope validation wired into `validate --scope=repo`.** The `driver` notation's per-notation validator (`FACTOR-001..004`) existed in `@transitrix/diagrams` but had no caller anywhere in the CLI or extension — a hand-authored `DRIVER-*.yaml` file missing envelope fields produced zero findings. Also fixed: the id-grammar check still required the pre-rename `FACTOR-` prefix, rejecting every current `DRIVER-…` id it was actually run against. First of the ten dead per-notation envelope validators to be wired in and fixed; the rest follow one notation per change.
- **`ACTOR` element-envelope validation wired into `validate --scope=repo`.** The `actor` notation's per-notation validator (`ACTOR-001..003`) existed in `@transitrix/diagrams` but had no caller anywhere in the CLI or extension — a hand-authored `ACTOR-*.yaml` file missing envelope fields produced zero findings. One of the ten dead per-notation envelope validators being wired in, one notation per change.
- **`CHANGE` element-envelope validation wired into `validate --scope=repo`.** The `change` notation's per-notation validator (`CHANGE-001..003`) existed in `@transitrix/diagrams` but had no caller anywhere in the CLI or extension — a hand-authored `CHANGE-*.yaml` file missing envelope fields produced zero findings. One of the ten dead per-notation envelope validators being wired in, one notation per change.
- **`STAKEHOLDER` element-envelope validation wired into `validate --scope=repo`.** The `stakeholder` notation's per-notation validator (`STAKE-001..003`) existed in `@transitrix/diagrams` but had no caller anywhere in the CLI or extension — a hand-authored `STAKEHOLDER-*.yaml` file missing envelope fields or an unresolved `actor` reference produced zero findings. One of the ten dead per-notation envelope validators being wired in, one notation per change.
- **`REQUIREMENT` → `VERIFICATION` coverage surfaced as an obligation.** New `VERIFICATION` element (`canon/verifications/`, `VERIF-001..006`) — the engineering V&V analogue of `ASSERTION`. The reverse-trace completeness rules `REQ-VERIF-COVERAGE-001` (no verification targets a requirement) and `-002` (every verification against it is still unresolved) are computed cross-cuttingly and surfaced in `validate --scope=repo`'s `compliance` findings. The Requirement Trace preview renders a "Verification" section labelled "Not verified" / "Unresolved" for a gap rather than a blank section; the Compliance Gap Dashboard lists every affected requirement repo-wide (both re-scan on save of any `VERIFICATION-*.yaml` file).
- **`BUSINESS_SERVICE` element-envelope validation wired into `validate --scope=repo`.** The `business-service` notation's per-notation validator (`BSV-001..004`) existed in `@transitrix/diagrams` but had no caller anywhere in the CLI or extension — a hand-authored `BUSINESS_SERVICE-*.yaml` file missing envelope fields produced zero findings. One of the ten dead per-notation envelope validators being wired in, one notation per change.
- **`VERSIONED-004` now covers the applications catalogue.** `owner_role`/`vendor`/`maturity` on an `applications[]` entry (`notations/views/10-applications.md` §5a) are rejected inline, same as capability's `current_maturity`. Unlike capability's element-file check, a catalogue entry has no file of its own to check, so this instance lives in the per-file `applications` notation validator rather than the repo-scope element sweep — see `docs/validation.md`. The `acme_corp` worked example's `eu-portfolio` catalogue and the two `APPLICATION-*` elements it references migrate their `owner_role`/`vendor`/`maturity` into `.history.yaml` sidecars; the standalone `notation-corpus` fixture (no element pairing to sidecar against) drops the fields instead. Not resolved here: neither `render-applications.ts` nor `render-capability-map.ts` reads a current value back from the sidecar at render time — both still read the field straight off the document.
- **Capability-map preview resolves maturity from its sidecar at render time.** A nested capability-map entry references its `CAPABILITY-*` primitive by `id`, so `current_maturity`/`target_maturity`/`owner_role`/`target_date` now resolve through that primitive's `.history.yaml` sidecar (the 2026-08-05 packages decision) — a display fallback only, an inline value on the document still wins, and nothing is written back. New `capability-map/resolve-maturity.ts` (host-neutral, no I/O); `render-capability-map.ts` takes an optional resolution; the VS Code preview (`extension/src/capability-map-preview.ts`, both "cards" and "tree" view modes) is the host that actually reads `canon/elements/**` and resolves, states the as-of date. Pairs with the applications-catalogue render-time resolution already on main.
- **`transitrix validate <file> --fix` completes missing envelope fields on a hand-authored `actor`/`change`/`driver`/`stakeholder`/`target-state`/`location`/`business-service`/`integration`/`node`/`technology-service` file.** Targeted text insertion immediately after the file's `id:` line — not a parse-mutate-dump round trip, since this repo has no comment-preserving YAML writer and the diff is the product. Inserts only what it can derive (`zone`, `admitted_at`, `valid_from`, `valid_to`, `admitted_by` via `--author` or `git config user.name`); never corrects a field already present, even if invalid. `gate_checks` is only filled once the id doesn't collide elsewhere in canon and the fix leaves the document with no other unresolved finding — a real check, not a constant `pass`. Reports every field filled and every field it couldn't determine; idempotent; `--dry-run` previews without writing.
- **`TARGET_STATE` element-envelope validation wired into `validate --scope=repo`.** The `target-state` notation's per-notation validator (`TSTATE-001..003`) existed in `@transitrix/diagrams` but had no caller anywhere in the CLI or extension — a hand-authored `TARGET_STATE-*.yaml` file missing envelope fields produced zero findings. One of the ten dead per-notation envelope validators being wired in, one notation per change.
- **`LOCATION` element-envelope validation wired into `validate --scope=repo`.** The `location` notation's per-notation validator (`LOC-001..003`) existed in `@transitrix/diagrams` but had no caller anywhere in the CLI or extension — a hand-authored `LOCATION-*.yaml` file missing envelope fields produced zero findings. One of the ten dead per-notation envelope validators being wired in, one notation per change.
- **`INTEGRATION` element-envelope validation wired into `validate --scope=repo`.** The `integration` notation's per-notation validator (`INT-001`, `INT-002`) existed in `@transitrix/diagrams` but had no caller anywhere in the CLI or extension — a hand-authored `INTEGRATION-*.yaml` file missing envelope fields, or asserting `interface_semantics: true` without its conditionally required fields, produced zero findings. One of the ten dead per-notation envelope validators being wired in, one notation per change.
- **Agreement axis (`agreement`/`agreed_by`/`agreed_at`, CONTRACT.md §6.3) carried into `REQUIREMENT`, `CONSTRAINT`, and `NEED`.** AGREE-001..003 are reported at `validate --scope=repo`'s usual error severity alongside each notation's existing shape checks — a closed `draft`/`agreed`/`disputed` vocabulary, `agreed_by` required whenever the axis is present, and `agreement: agreed` refused when `agreed_by` reads as a tool identity rather than a human one. `transitrix new constraint`/`transitrix new requirement` gain `--agreement`/`--agreed-by`/`--agreed-at`; passing `--agreement agreed` is refused outright at scaffold time — a tool must never write `agreed` (AGREE-002) — with `draft`/`disputed` rendered normally.
- **Link suspicion and agreement lapse (CONTRACT.md §16) surfaced in `validate --scope=repo`.** A derived, never-stored signal answering "has the thing this record points at changed since the record last looked at it?" — computed fresh from git history on every run, informational only (`severity: warning`, never blocking, never filtering anything out of any other check). Covers every `REL` (`from`/`to`), `ASSERTION` (`about`), `VERIFICATION` (`verifies`), and `VALIDATION` (`validates`) endpoint, plus agreement lapse on a `REQUIREMENT`/`CONSTRAINT`/`NEED` carrying `agreement: agreed` whose statement changed since the agreement fields were last set. Content identity (§16.1) excludes the administrative envelope, not a curated field list, so reformatting or reassigning `admitted_by` never fires a finding. A declared `migrations/<slug>/TRANSFORM.yaml` manifest (§16.3) is independently replay-verified before it suppresses suspicion — a manifest that under- or over-states its edit gets no exemption. New `@transitrix/diagrams` module `link-suspicion.ts` (pure content-identity/verdict logic, ported from methodology's reference `scripts/check-link-suspicion.mjs`); the git plumbing and repo walk live in `src/repo-validate.ts`.
- **`NODE` element-envelope validation wired into `validate --scope=repo`.** The `node` notation's per-notation validator (`NOD-001`, `NOD-002`) existed in `@transitrix/diagrams` but had no caller anywhere in the CLI or extension — a hand-authored `NODE-*.yaml` file missing envelope fields, or with an invalid `type`, produced zero findings. One of the ten dead per-notation envelope validators being wired in, one notation per change.
- **`TECHNOLOGY_SERVICE` element-envelope validation wired into `validate --scope=repo`.** The `technology-service` notation's per-notation validator (`TSVC-001`, `TSVC-002`, `TSVC-003`) existed in `@transitrix/diagrams` but had no caller anywhere in the CLI or extension — a hand-authored `TECHNOLOGY_SERVICE-*.yaml` file missing envelope fields, or with an invalid `type`, produced zero findings. Last of the ten dead per-notation envelope validators being wired in.
- **RISK/METRIC/NEED vocabulary and the VALIDATION claim type land in the validator registry**, plus `REQUIREMENT` gains `level` (`REQ-005`), `kind` (`REQ-006`) and `serves` (`REQ-SERVES-001`) tracing a requirement back to the `NEED` it satisfies — methodology 3.1.0's motivation-layer additions (`ELEMENT_PRIMITIVES.md` §7.26–§7.28, `28-validation.md`) (#459). New single-artefact validators (`packages/diagrams/src/{risk,metric,need,validation}`) follow the existing `validate<Notation>(input, { catalog })` shape; cross-cutting reverse-trace coverage (`NEED-COVERAGE-001`, `NEED-VALIDATION-COVERAGE-001`/`002`) joins the existing `REQ-VERIF-COVERAGE-*` rules in the compliance reverse-index, and `RISK-COVERAGE-001` is a single-file check inline in the risk validator. The Compliance Gap Dashboard is not yet extended to render the new `needsWith*` fields — flagged in `docs/validation.md`, not silently dropped.
- **`transitrix new driver/constraint/requirement`** extend the envelope-computed scaffolding `transitrix new goal` already had to the other standalone motivation-layer TYPEs (#465) — admission record and lifecycle computed by the tool, per-TYPE required fields validated, cross-references checked against canon before writing. `transitrix new constraint` defaults `status: active` when `--status` is omitted, since this repo's own `CONST-001` validator requires the field even though methodology doesn't.
- **Versioned-attribute sidecar validation** (`VERSIONED-001..005`, `CONTRACT.md` §9) wired into repo-scope validate (#466). New notation-agnostic `packages/diagrams/src/versioned-attribute/` parses a `<primitive_id>.history.yaml` sidecar and resolves an attribute's current value at a date (§9.2's "largest `valid_from <= date`" rule); `VERSIONED-004` at this point enforces only capability `current_maturity`/`owner_role`/`target_date`, the fields already `time_varying` on methodology's then-merged spec. The native `capability-map` view document's own single-file validator is untouched — it has no separate element file to hold a co-located sidecar.
- **"Transitrix: New Goal Element" command** in the editor (#467) — the extension had no element-creation command at all; it calls the same `src/scaffold.ts` functions the CLI uses so the two paths can't drift on what "computed" means.
- **"New Driver/Constraint/Requirement Element" commands** join the Goal one (#470), reusing the same scaffold functions the CLI's `transitrix new driver|constraint|requirement` calls; the id/name/admitted_by prompt flow and the write/report tail are factored into shared helpers so the four per-type commands stay thin.
- **`.ttrs` document templates register as a VS Code language** (#500) — syntax highlighting via a new TextMate grammar covering the four slot kinds (fixed text, model-object reference, figure, instruction slot), plus a file icon. The grammar matches the `CAPABILITY-V/H` dotted-id form ahead of the generic reference pattern, and the `.ttrs` extension pattern doesn't match the `.trs` near-miss. Syntax highlighting / file recognition only — live preview of resolved content lands separately (#505 below).
- **`each`/`trace`/row-reference constructs highlighted in the `.ttrs` grammar** (#502) — `{{# each TYPE [where …] [order by field] }} … {{/ each }}`, `{{ .field }}` (meaningful only inside an `each` body), and `{{ trace from = TYPE to = TYPE via = relation }}` (`DIRECTIVE_LANGUAGE.md` §3.3–§3.4) previously fell through as unstyled plain text. Both are part of the language regardless of renderer support, so they get ordinary valid-syntax scopes rather than an implementation-status scope.
- **Methodology's closed-vocabulary artefact is vendored** (`vendor/methodology/vocabulary.yaml`, pinned by tag/version/SHA-256 in `VENDORED.json`) and checked at build time against this repo's own vocabulary constants (#504, `tests/vocabulary-drift.test.ts`) — fails closed on a missing/malformed pin, unparseable YAML, a missing section, a content-hash mismatch, or a version contradiction. Four divergence kinds are distinguished: `missing`, `extra`, `unbound`, `version-mismatch`. `scripts/vendor-methodology-vocabulary.mjs --check` reports what would change without writing; refreshing rejects a branch ref or a tag whose artefact declares a different version.
- **`.ttrs` documents get a live preview** (#505) — `TtrsPreview` calls the vendored `@transitrix/document-renderer` pass-1 resolver (vendored from methodology v3.3.0, `vendor/methodology/document-renderer/`, integrity-checked the same way as the vocabulary artefact) as a real library call. All four resolver states (unresolved / not admitted / out of validity / no repository) are named distinctly; `each`/`trace` report "recognised, not implemented in this pass" rather than as a syntax error; link suspicion is always shown as not-computed with its reason. Blocks-notation figures and `.svg` assets render inline; every other view notation shows a labelled "not rendered in this preview" note.
- **`transitrix impact [--root <dir>] [--json]`** (#507) — first slice: checks a *staged* (not committed) `canon/elements/**` change against the three canon-projection view notations with a static resolver (`goals`, `dgca`/`fgca`, `action`), naming any resolvable view that reads a changed/deleted element id. Total silence when nothing is staged or nothing resolvable is affected; every other `canon/views/**` document is reported under a distinct "coverage not determined" line rather than silently claimed unaffected. `.ttrs` document coverage and regeneration wiring are deliberately out of scope for this slice.
- **`transitrix impact` covers `.ttrs` document sources** (#508), unblocked by #505's vendored Pass 1 resolver landing. Reads a document's referenced ids directly off `parseTemplate()`'s AST — inline `{{ ID }}`/`{{ ID.field }}` references and an instruction slot's `inputs:` list — rather than running full Pass 1 resolution, since this check only needs to know which ids a document cites. A document holding an `each`/`trace`/row-`.field` construct is reported "coverage not determined", the same honesty rule already applied to an unresolvable view; the `.trs` near-miss extension is skipped.
- **`scripts/render-compliance-impact.mjs`'s persisted Markdown output carries a provenance stamp** (#511) — canon-root path, view-config path, source commit (flagged when the canon root's working tree is dirty), generator, generation time — embedded in the artefact itself, no sidecar. Also fixed in passing: the script imported the diagrams package's root barrel, which re-exports webview React components pulling in `reactflow/dist/style.css` — unloadable under plain `node`, and presumably why the script had no test coverage before now.
- **Preview refresh is documented as save-triggered** (not per-keystroke), in both READMEs, with the recommended `files.autoSave: afterDelay` config (#512) — every document-bound notation preview's shared toolbar (`buildDiagramFrame`) now carries an "as of last save" note.
- **`transitrix export-compliance --format md` gains the same provenance stamp #511 added to `render-compliance-impact.mjs`** (#513) — both the CV-6 `--report` path and the legacy `--scope` path. `--format pdf` is not stamped in this slice — an HTML-comment banner doesn't survive a WeasyPrint-rendered PDF, and stamping it needs a visible-footer design change to the shared compliance HTML renderers.

### Changed

- **Work-item references use the neutral `HUB-NNN` form** across comments, READMEs and docstrings (54 files). Not the hash form — a bare `#84` auto-links to this repository's own issue 84, rendering as a working link to an unrelated item.
- **Public-surface hygiene gains a pattern slot and a full-tree pass** (`scripts/ci-hygiene-tree.mjs`). The diff check only sees what a PR adds, so anything already committed was invisible to it; the tree pass reads every tracked text file. Scoped to the new slot alone so it fails on the change under review, not on pre-existing content. Patterns stay in repository secrets; output is `file:line` only.
- **The declared methodology version now names the release this build actually targets.** `transitrix.methodologyVersion` (`package.json`) and the `SCHEMA_VERSION` constant it is pinned to both read `0.5.0` — a release this repository moved past long ago, left behind because nothing but their own lockstep test read either value. Both now read `3.1.0`: the notation vocabulary and rule coverage on this branch implement that release's additions in full (`RISK-001..004`, `METRIC-001..004`, `NEED-001..002`, `VALID-001..006`, `REQ-005`/`REQ-006`) and none of the additions from the release after it. The accompanying comments no longer restate "the current methodology release" as a literal — that was the fact that went stale, and the constant does not track it. Two hardcoded vocabulary literals are known to lag `3.1.0` and are deliberately not changed here: `target-state/types.ts` carries no `type: base | target` field, and the cross-reference id grammar in `blocks/validate.ts` diverges from the one in `typed-id.ts` — its terminal `\d+` admits the leading-zero ids that `IDS_AND_REFERENCES.md` §1 rejects, and its uppercase-only middle segments miss the mixed-case ids that do occur in canon. Correcting the declaration is what makes those two visible as drift rather than as a wrong baseline.
- **A PR contributes its `CHANGELOG.md` entry as its own fragment file, not a hand-edit of the shared `## [3.3.0] — 2026-08-24` section.** Two PRs to `diagrams/src` that each edited the head of `CHANGELOG.md` collided by construction, whatever their code touched. `node scripts/new-changelog-fragment.mjs <section> <slug>` scaffolds a fragment under `changelog/fragments/`; `node scripts/assemble-changelog.mjs` — run as the first step of release prep (`docs/internal/release-runbook.md`) — folds every fragment into `## [3.3.0] — 2026-08-24` in the same section/order/wording convention a hand-edit would have produced, then deletes the fragments it consumed. Existing `CHANGELOG.md` history is untouched; the mechanism applies going forward only.
- **Package version bumps are checked at release time, not on every PR.** A PR
  touching `packages/diagrams/src` no longer has to bump
  `packages/diagrams/package.json` or `packages/cli/package.json`, so two such
  PRs opened from the same base commit no longer collide on those version
  fields. `npm-publish.yml` now gates both publish steps on a `version-guards`
  job (`scripts/check-release-versions.mjs`) that compares the release against
  the previous `v*` tag and fails it, naming the package, when
  `@transitrix/diagrams` would ship under a version that doesn't carry its
  source changes, or when `@transitrix/diagrams` moved and `@transitrix/cli`
  did not.
- **A scheduled workflow calls the shared "simple docs/chore PR auto-merge" reusable workflow** (hosted in `transitrix/templates`) against this repo's open PRs, plus `workflow_dispatch` for a manual run (#510). `DRY_RUN` defaults to true — a scheduled run only logs what it would do; nothing merges or labels until a human runs it with `dry_run: false`.

### Fixed

- **BPMN-exported SVG text used the browser's default serif fallback.** `bpmn-lane-label`, `bpmn-task-name`, `bpmn-pool-label`, `bpmn-event-label`, `bpmn-gateway-label` declared no `font-family` — invisible while the webview's ambient stylesheet was present, exposed once export left the editor (#509). Now declares the same `var(--vscode-font-family, system-ui, -apple-system, sans-serif)` fallback the other notations' text classes already carry.

### Packages

- `@transitrix/diagrams` 1.8.21 → 1.9.0 — the V&V coverage rules; supersedes the interim 1.8.22 comment-only bump.
- `@transitrix/cli` 2.3.0 → 2.4.0 — paired bump per `cli-diagrams-alignment`; supersedes the interim 2.3.1.
- `@transitrix/diagrams` 1.9.1 → 1.9.2 — RISK/METRIC/NEED/VALIDATION vocabulary registration.
- `@transitrix/cli` 2.4.1 → 2.4.2 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.2 → 1.9.3 — versioned-attribute sidecar (`VERSIONED-001..005`).
- `@transitrix/cli` 2.4.2 → 2.4.3 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.4 → 1.9.5 — applications-catalogue `VERSIONED-004`.
- `@transitrix/cli` 2.4.4 → 2.4.5 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.5 → 1.9.6 — `DRIVER` id-grammar fix.
- `@transitrix/cli` 2.4.5 → 2.4.6 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.6 → 1.9.7 — `ACTOR` envelope validation wired in.
- `@transitrix/cli` 2.4.6 → 2.4.7 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.7 → 1.9.8 — capability-map render-time maturity resolution.
- `@transitrix/cli` 2.4.7 → 2.4.8 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.8 → 1.9.9 — `CHANGE` envelope validation wired in.
- `@transitrix/cli` 2.4.8 → 2.4.9 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.9 → 1.9.10 — `STAKEHOLDER` envelope validation wired in.
- `@transitrix/cli` 2.4.9 → 2.4.10 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.10 → 1.9.11 — `TARGET_STATE` envelope validation wired in.
- `@transitrix/cli` 2.4.10 → 2.4.11 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.11 → 1.9.12 — `LOCATION` envelope validation wired in.
- `@transitrix/cli` 2.4.11 → 2.4.12 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.12 → 1.9.13 — `BUSINESS_SERVICE` envelope validation wired in.
- `@transitrix/cli` 2.4.12 → 2.4.13 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.13 → 1.9.14 — `INTEGRATION` envelope validation wired in.
- `@transitrix/cli` 2.4.13 → 2.4.14 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.14 → 1.9.15 — `SCHEMA_VERSION` corrected to the targeted methodology release.
- `@transitrix/cli` 2.4.14 → 2.4.15 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.15 → 1.9.16 — agreement axis + link suspicion.
- `@transitrix/cli` 2.4.15 → 2.4.16 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.16 → 1.9.17 — `NODE` envelope validation wired in.
- `@transitrix/cli` 2.4.16 → 2.4.17 — paired bump per `cli-diagrams-alignment`.
- `@transitrix/diagrams` 1.9.17 → 1.9.18 — `TECHNOLOGY_SERVICE` envelope validation wired in.
- `@transitrix/cli` 2.4.17 → 2.4.18 — paired bump per `cli-diagrams-alignment`.

## [3.1.3] — 2026-07-29

### Fixed

- **`@transitrix/cli` on npm shipped a stale diagrams bundle** (#426). Published `@transitrix/cli@2.2.0` still carried the pre-#421 `BL-006` TYPE registry, so `npx @transitrix/cli validate` rejected current TYPE-prefixed block ids (`HAZARD-*`, `RISK_CONTROL-*`, …) that the extension accepted. Root cause: the idempotent npm publish step compared only the CLI's own version — if diagrams bumped without a matching CLI bump, the publish silently no-oped. Fix: bump CLI to `2.3.0`, record the bundled diagrams version in `dist/diagrams-version.json`, expose it via `transitrix --version`, and add a PR-level CI guard (`cli-diagrams-alignment.yml`) that fails a diagrams bump without a matching CLI bump.
- **Residual Cervin identifiers scrubbed** (#427). Internal class names, localStorage keys, dev-UI plugin names, debug-script fixture paths, test variables, and stale comments still referencing the pre-rename `cervin`/`Cervin*` identifier — replaced with Transitrix equivalents. Removed the unused `@deprecated CompileCervinOptions` type alias. Migration guards and CHANGELOG history are kept per the task's "must keep" list.

### Packages

- **Transitrix Studio extension** 3.1.2 → 3.1.3
- **`@transitrix/cli`** 2.2.0 → 2.3.0 — rebundled with `@transitrix/diagrams` 1.8.21, `transitrix --version` now reports the bundled diagrams version.
- **`@transitrix/diagrams`** 1.8.20 → 1.8.21 — Cervin identifier cleanup in compliance HTML renderer.

## [3.1.2] — 2026-07-29

### Fixed

- **Network/PSND skip-edge bows could climb into the title block** (#420). Follow-up to #418: the top-pad floor used the canvas edge (`y=0`), so the arc could still rise through the "Network view — …" heading. `computeNetworkTopPad` now floors against the diagram's own node bounds, so bows stay in the diagram area and leave the title zone alone.
- **Blocks `BL-006` TYPE allowlist was stale vs the methodology registry** (#421). `REGISTERED_ELEMENT_TYPES` still accepted retired TYPEs (`UNIT`/`EMPLOYEE`/`ISSUE`, plus never-canonical `STAGE`) and rejected current ones adopters need (`HAZARD`, `RISK_CONTROL`, `REQUIREMENT`, `VERIFICATION`, …). Now matches `IDS_AND_REFERENCES.md` §3.1 exactly (plus `VERIFICATION` from §3.7), with a CI-pinned expected-set test so the next drift fails loudly.

### Changed

- **Compliance status colours use functional `--ts-status-*` tokens** (#422) instead of hardcoded purple / `#b45309`-class hexes for `pending_owner`, severity-medium, pending, dangling, and unresolved. Coverage-metric RAG middle-band copy renamed to "Warning".
- **Compliance Impact preview adopts the shared `buildDiagramFrame` chrome** (#423), including a framed loading state (Theme…/Refresh present) instead of a bare body.
- **BPMN preview toolbar vocabulary aligned** with the shared frame (#424).

### Packages

- **Transitrix Studio extension** 3.1.1 → 3.1.2
- **`@transitrix/diagrams`** 1.8.19 → 1.8.20 — skip-edge title-zone floor (#420) and BL-006 TYPE registry sync (#421).

## [3.1.1] — 2026-07-27

### Fixed

- **Network/PSND view could draw a skip edge as a straight line directly through an intermediate node** (#418). When a multi-predecessor activity's nearer predecessor and an in-between column shared the same row, the straight-tangent cubic connecting them degenerated into a flat horizontal line crossing that node's box. Skip edges now detect the collision and arc above the obstacle instead, growing the canvas's top padding so the arc is never clipped. Shared by the webview renderer and the VS Code extension preview (`renderActivitiesNetworkBody`).

### Packages

- **`@transitrix/diagrams`** 1.8.18 → 1.8.19 — the skip-edge routing fix above.

## [3.1.0] — 2026-07-27

### Added

- **`validate --scope=repo --json --include-model` emits the resolved element/relation model** (#406, #407). Opt-in flag adds a `model: { elements, relations }` key — id/name/notation/type/layer per element, id/kind/source/target per relation — reusing the same canon walk the repo-scope validator already does, for a non-JS consumer (DSM's Go backend) that wants the parsed model without re-implementing the notation schema. #407 adds a `data` field carrying the complete parsed element document alongside the minimal projection, so callers can read notation-specific fields (a goal's `level`/`parent`, an action's scheduling fields, …) without an engine schema change. Existing `--scope=repo --json` output is unchanged when `--include-model` is omitted.
- **`validate --scope=repo` computes the error-severity subset of DSM's Go strategy-chain semantic rules** (#409): `GOALS-010` (goal parent-chain cycle), `ACT-006`..`009` (action predecessor cycle/self-predecessor/date validity/order/negative numerics), `FGCA-008`..`011` (dangling strategy-chain cross-references — `GOAL.factors`→DRIVER, `CHANGE.goals`→GOAL, `ACTION.delivers_changes`→CHANGE, `ACTION.goals`→GOAL). `RepoFinding.ruleId` is un-frozen (now optional) so a downstream consumer can map a finding back onto its own rule taxonomy.
- **`RepoFinding` gains an optional `severity` field** (`'error' | 'warning'`, defaulting to `'error'`), and six DSM strategy-chain rules held back from #409 for lack of a non-blocking tier are now ported at warning severity (#410): `GOALS-009`/`011` (orphan/backlog goal parent), `ACT-005` (orphan action predecessor/parent), `FGCA-012`..`014` (driver/goal/change unreferenced by the strategy chain). `validate --scope=repo` now only exits non-zero on an error-severity finding — every pre-existing check is unaffected since it never set `severity`. `GOALS-008` stays unported at either severity (needs a `goal_types` catalogue outside this validator's input scope).
- **The `blocks` matrix subset (`grid:` root) is validated** (#411). `transitrix validate` recognises the single-layer rectangular matrix form alongside the existing `nested_blocks` tree form, enforcing `BL-020`..`BL-025`: root-form exclusivity, `columns`/`rows` well-formedness, id uniqueness across the two namespaces, and `assign` keys referencing a declared column.
- **Template-level cell invariants via `--template`** (#411). A template built on the matrix subset can plug its own cell-value rule on top of the shared validator through a closed `GridRule` mechanism, so the base notation does not have to fix what `assign` values mean. First entry: `transitrix validate --template raci` enforces `RACI-001` — exactly one column per row assigned `"A"` — so a RACI row with two Accountable owners, or none, fails validation instead of rotting silently.
- **The `blocks` matrix subset (`grid:` root) is rendered** (#413). New `layoutGrid` + `renderGridSvg`/`renderGridLayoutSvg` render the single-layer rectangular matrix form (e.g. a RACI matrix) — column/row headers wrap long labels, body cells show the `assign` value. The VS Code blocks preview now dispatches on `grid` vs `nested_blocks` via the existing root-dispatcher instead of failing validation with "missing nested_blocks". Layers, arbitrary (non-rectangular) cell sets, and nested sub-grids remain out of scope.
- **DSM element-hygiene and capability-lifecycle rules ported** (#414): `GOAL-ELEM-002`/`003` and `ACTION-001`/`002`/`005` over standalone `canon/elements/**` GOAL/ACTION elements (new `check-element-hygiene.ts`); `HDR-001`/`002` and `LIFECYCLE-001`/`004` into the `capability-map` view document's own validator alongside its existing `CMAP-*` codes. `ACT-020`/`DGCA-DEPR` (DSM's non-fatal leniency for the pre-2026-06-25 `activities` alias) deliberately not ported — Studio already removed that leniency, as an error, in #320.

### Packages

- **Transitrix Studio extension** 3.0.9 → 3.1.0
- **`@transitrix/cli`** 2.0.1 → 2.1.0 (#408, enables `--include-model` from #407) → 2.2.0 (#411 — the `grid:` validator and the `--template raci` flag).
- **`@transitrix/diagrams`** 1.8.11 → 1.8.18 — grid-matrix rendering (#413) and the repo-validate rule additions above (#409, #410, #414).

## [3.0.9] — 2026-07-17

### Added

- **Canon-projection support for Action Schedule, DGCA, and Goals Tree** (#401, #402, #403). A `view_config`-only document (no inline element data — the methodology's Full-tier projection form) now resolves correctly against `canon/elements/**` in the VS Code preview and `transitrix validate --scope=repo`; single-file `transitrix validate <file>` (which has no canon context to resolve against) now gives a clear "run --scope=repo instead" notice rather than a raw schema error. DGCA's own single-file/repo-scope CLI paths never ran this resolution at all before #402 — confirmed broken against methodology's own official example (`notations/examples/dgca/strategy-2026.dgca.transitrix.yaml`), not just adopter files.

### Fixed

- **DGCA canon-projection documents authored with the canonical `notation: action`** silently resolved to zero actions — the resolver only recognized the deprecated `notation: activity` alias (#404).
- **`transitrix validate --scope=repo` silently ignored `view_config.scope.valid_at`** for any canon element with an unquoted date field — js-yaml parses those as native `Date` objects, which the date-window filter's string check treated as absent, so a lapsed element stayed included with no error (#404).
- **Goals Tree's synthesized level table could disagree between the CLI and the VS Code preview** for identical canon content, since it depended on unsorted directory-enumeration order; level is now computed deterministically from the parent-chain structure instead (#404).
- **Action Schedule's `scope.goals` filter never consulted `action_goal` relations**, only the transitional inline `goals[]` field, unlike the sibling DGCA resolver (#404).
- **`transitrix validate --scope=repo` walked the canon tree twice** on any repo with at least one canon-projection document (#404).

### Packages

- **Transitrix Studio extension** 3.0.8 → 3.0.9
- **`@transitrix/diagrams`** 1.8.8 → 1.8.11 — new `activities/resolver.ts` + `goals/resolver.ts`, `notation: action` alias fix in `fgca/resolver.ts`, new shared `canon-resolver-utils.ts`
- **`@transitrix/cli`** 2.0.0 → 2.0.1 — the `transitrix validate` fixes above ship here

## [3.0.8] — 2026-07-15

### Fixed

- **PlantUML preview now uses the shared preview shell** (#399). Save/Copy as SVG and PNG, the zoom control, the Theme… selector, and the title toggle — previously missing entirely, so there was no way to get a rendered PlantUML diagram out of Studio — now work the same way they do for every other notation. Exported PNGs get a real background instead of inheriting whatever VS Code color theme happens to be active.
- **`@transitrix/diagrams` 1.8.7 → 1.8.8** — the published npm package's compiled `dist/` output now uses fully-specified ESM import/export specifiers (e.g. `./index.js` instead of `./index`), fixing `Module not found` errors for consumers under strict Node/webpack ESM resolution. No runtime behavior change for existing bundler-based consumers.

## [3.0.7] — 2026-07-14

### Changed

- **One unified Preview button, everywhere** (#395). Every notation (BPMN, Goals, DGCA/DGA, Blocks, Capability Map, Process Blueprint, PlantUML, and the rest) now shares a single "Transitrix: Open Preview" command and editor-title button carrying the monochrome Transitrix mark, instead of 20+ near-identical per-notation preview commands. Compliance Matrix and Gap Dashboard keep their own commands since they're repo-wide dashboards, not tied to one open file.
- **`@transitrix/diagrams` 1.8.6 → 1.8.7** — the published npm package no longer includes test fixtures (`__tests__/`, `*.test.ts(x)`) or stray source maps in `dist/` or `src/`; package size roughly halved. No runtime behavior change.

### Fixed

- **PlantUML preview no longer fails with a CSP/WebAssembly compile error** (#396). The webview's Content-Security-Policy had no eval-class permission, so `WebAssembly.instantiate()` inside the bundled PlantUML engine couldn't compile. Added the narrow `'wasm-unsafe-eval'` token to `script-src` — permits WebAssembly compilation only, not general JS eval.

## [3.0.6] — 2026-07-13

### Added

- **Live preview for `.puml` / `.plantuml` files**, powered by `@plantuml/core` — the official PlantUML engine (Arnaud Roques), compiled to JavaScript via TeaVM, MIT-licensed (#390). Runs entirely in the webview: no Java, no Graphviz binary, works in `vscode.dev` and browser-based Codespaces. Forces `!pragma layout smetana` on every render to eliminate Graphviz layout variance across machines, auto-injects the Transitrix theme when `diagrams/transitrix-theme.puml` exists in the workspace, and replaces raw PlantUML error text with a titled, hinted friendly error card. Same editor UX as every other Transitrix notation preview (editor title icon, auto-open on file focus, refresh on save).

## [3.0.5] — 2026-07-11

### Fixed

- **DGCA/DGA column headers no longer render as boxes** (#387). Drivers/Goals/Changes/Actions headers were styled identically to entity nodes (filled rect, node stroke), which read as meaningful boxes rather than plain labels; now bare text, same font.
- **Doubled the gap between the SVG title block and the diagram body** (14px → 28px), across every vector preview (#387).
- **Long edges in the Action Network view no longer bow excessively.** A tall, narrow-column edge's curve-handle length grew unbounded with the vertical span, so its control points could overshoot each other in x and produce an exaggerated S-curve; capped the growth so only extreme spans are affected — short and medium edges are unchanged (#388).
- **Critical path (Action Network + Gantt) now differs from the regular path by color only**, not stroke width — critical nodes/edges previously rendered with a heavier stroke than everything else (#388).

### Changed

- **Unified webview chrome across every notation and report/compliance preview** (#385). All previews now share a single `buildDiagramFrame` HTML shell — toolbar, buttons, error/warning blocks, title area — instead of five separate `complianceShell` duplicates and two fully custom shells (`compliance-matrix`, `coverage-metric`). No visual change intended.
- **Marketplace gallery banner set to Transitrix petrol** (#386).
- **`@transitrix/diagrams` 1.8.4 → 1.8.6** — unboxed DGCA/DGA headers, capped edge-curve handle length, unified critical-path stroke widths.

## [3.0.4] — 2026-07-10

### Added

- **Transitrix brand theme is now the default for diagram rendering** (#383). Petrol (`#004d67`) drives node/edge structure and hierarchy-depth fill tints (never a hue switch); amber/orange are reserved for author emphasis (e.g. the Activities critical path). Applies across Goals, DGCA/DGA, Nested Blocks, Activities, Process Blueprint, Capability Map, and BPMN.

### Fixed

- **Maturity Likert (L1–L5) badge colors harmonized into one WCAG-verified ramp** (#383) — the capability-tree badge previously used grey for L1 (the worst rating) and had white-label contrast as low as 1.07:1 in VS Code high-contrast mode; now a single red→green ramp shared by every maturity badge, verified ≥4.5:1 (AA) light/dark and ≥7:1 (AAA) high-contrast.

### Changed

- **`@transitrix/diagrams` 1.8.4** — brand theme tokens, maturity color ramp.

## [3.0.3] — 2026-07-10

### Fixed

- **Entity box text could render above the box's top border** (#380) — a 2-line name + type + id (e.g. a Strategic/Project Goal node) left almost no vertical padding in the default and compact **Size** presets; the shared text layout now enforces real edge padding and degrades to fewer name lines instead of overflowing. Applies to Goals, FGCA/DGCA, Activities, and Nested Blocks.
- **`@transitrix/diagrams` 1.8.3** — same fix; `entity-text-layout.ts` edge-padding rework.

### Changed

- **BPMN preview settings panel renamed "Display" → "Controls"** (#381), matching every other notation's panel. The swimlane spacing setting (`transitrix.bpmn.laneGap`) is now also adjustable directly in the panel, not just via the top-menu Settings link.

## [3.0.2] — 2026-07-10

### Fixed

- **Blocks / Process Blueprint / Capability Map previews didn't live-update on a node-size change** — an already-open panel kept the previous **Size** preset's dimensions/spacing until an unrelated theme toggle or save forced a rebuild.

### Changed

- **Extension 3.0.2** — unified `$(graph)` preview icon across every notation; auto-preview now follows the active editor instead of every background `openTextDocument` call, with a new `transitrix.preview.autoOpenOnFileOpen` setting to disable it.

## [3.0.1] — 2026-07-10

### Fixed

- **Goals tree node layout** (#377) — name and type labels no longer overlap; shared `layoutCenteredEntityText` vertical span fix.
- **Unified entity node Size presets** (#377) — Compact **200×72**, Normal **250×80**, Wide **320×96** across Goals, DGCA/DGA, Blocks, Activities, Capability Map; Process Blueprint scales from the same tier ratios.

### Changed

- **Extension 3.0.1** — in-preview control label **Size** (was "Block size").
- **`@transitrix/diagrams` 1.8.2** — `ENTITY_NODE_SIZE` ladder, layout default alignment.

## [3.0.0] — 2026-07-07

### Added

- **Unified text-in-block layout and block size presets** (#367) — shared wrapping/truncation for Goals, DGCA/DGA, Blocks, Activities, Process Blueprint, Capability Map; `transitrix.nodeSize.*` settings and Controls **Block size** row.
- **`@transitrix/diagrams` 1.8.1** — `entity-text-layout.ts`, `node-size-presets.ts`.

### Changed

- **Transitrix Studio extension 3.0.0** (#368) — removes remaining Cervin VS Code shims (`*.cervin.yaml`, `cervin.*` settings/commands). Migration guide in [`extension/CHANGELOG.md`](extension/CHANGELOG.md).
- **Documentation hygiene** (#369, #372) — consumer docs vs `docs/internal/` maintainer tree; updated CLI, notation, validation, repo layout guides.
- **`@transitrix/cli` 2.0.0** — npm package major bump; bundles current compiler sources.

### Removed

- **Overdue Cervin deprecated shims (P5 cleanup, #371).** Grace period stated at 2.0.0 has long elapsed. Dropped:
  - `src/cervinrc.ts` re-export shim module.
  - `loadCervinrc()` from `transitrixrc.ts` — use `loadTransitrixrc()`.
  - `DEFAULT_CERVIN_FILE_EXTENSIONS` from `cli-parse.ts` — use `DEFAULT_TRANSITRIX_FILE_EXTENSIONS`.
  - `compileCervinYaml` / `compileCervinYamlWithLayout` from `compiler.ts` — use `compileTransitrixYaml` / `compileTransitrixYamlWithLayout`.
  - `CervinrcConfig` type alias from `validator-types.ts` — use `TransitrixrcConfig`.
  - `schemas/cervinrc.schema.json` (root, extension, and `@transitrix/cli` copies).

  **Breaking:** any consumer still importing the dropped names or referencing `@transitrix/cli/schemas/cervinrc.schema.json` must migrate before upgrading CLI.

## [2.10.0] — 2026-07-06

### Added

- **Compliance validators in CLI and repo-scope scan (#518).** `transitrix validate`
  now covers the compliance notation family end-to-end:
  - **Requirement, Assertion, Compliance-impact, Coverage-metric** — per-notation
    validators wired into `validate-notation` and `transitrix validate --scope=repo`
    (#360).
  - **Codex** — `CODEX-*` element validator plus a `codex/**` sweep in repo-scope
    (#361).
  - **Canon catalogue + cross-document checks** — `CanonCatalog` builds a typed
    element index; repo-scope validates `derived_from` / `about` / `realised_via`
    cross-references and compliance-matrix build-time invariants (#362).
  - **Constraint** — `CONSTRAINT-*` primitive validator (`CONST-001` … `CONST-005`)
    (#363).

- **Requirement traceability + hierarchy view.** A new
  `transitrixStudio.previewRequirementTrace` command opens a script-less
  webview for any `REQUIREMENT-*.yaml` or `CONSTRAINT-*.yaml` file. The view
  shows two halves, both origin-agnostic (`legislative` / `process-product` /
  `project-product`):
  - **Trace chain** — `derived_from` codex sources → the element itself → any
    `ASSERTION` targeting it (`about`) → the asserted `subject` +
    `realised_via` elements. Every id is click-to-open. `REQ-COVERAGE-001` is
    surfaced inline when no assertion targets the requirement.
  - **Hierarchy** — the `parent` chain (immediate parent to root, per the new
    `parent` field on REQUIREMENT / CONSTRAINT) plus direct children of the
    element.

  Assertion coverage is REQUIREMENT-only per `16-assertion.md` §1; a
  CONSTRAINT-side trace shows sources + hierarchy only and notes the v1 scope
  boundary inline. The extension activates on `REQUIREMENT-*.yaml`,
  `CONSTRAINT-*.yaml`, or `ASSERTION-*.yaml` in the workspace, and the
  editor-title bar surfaces a "Preview requirement trace + hierarchy" action
  when a REQUIREMENT or CONSTRAINT file is open. Under the hood,
  `@transitrix/diagrams` gains a pure `buildRequirementTrace` builder over
  the existing compliance reverse-index (extended with `requirementsByParent`).

- **Goals — optional `onFactorClick` callback on `GoalNode` / `GoalTreeView`.**
  Host apps (e.g. DSM) can restore factor-badge navigation without the library
  hardcoding a route (#358).

### Fixed

- **DGCA — accept `ACTION-*` ids and DGA mode without a `changes` array.**
  Canonical action terminology from methodology 1.0 is recognised in DGCA/DGA
  validators and previews (#359).

- **Goals preview — canonical `GOAL-*` ids in diagram nodes.** Parsed goals
  retain `canonical_id` from YAML; SVG/React previews and scope root picker
  show `GOAL-REVENUE-1` instead of internal numeric ids (#364). Regresses the
  same class of bug fixed for FGCA in 2.6.0.

### Changed

- **`@transitrix/diagrams` 1.6.0 → 1.7.6** — compliance trace builder,
  repo-scope validation primitives, goals `canonical_id` display, DGCA action-id
  acceptance, and `onFactorClick` extension point.
- **`@transitrix/cli` 1.1.1 → 1.2.0** — bundles the compliance validator suite
  for `transitrix validate` / `validate --scope=repo`.

## [2.9.1] — 2026-07-03

### Added

- **Action preview — Tree view document root, export as Markdown.** The Tree
  tab's hierarchy now nests under a single synthetic root node labelled with
  the Action's own name (`doc.title`) instead of rendering a flat forest of
  independent top-level activities — matching the "virtual root" convention
  one level above Initiative (methodology `elements/24-action.md` §1), scaled
  to one document. A new "Export tree as .md" toolbar button
  (`transitrixStudio.exportActionTreeAsMarkdown`) saves the same hierarchy as
  a nested Markdown list.

### Fixed

- **BPMN — skip-level same-lane flows no longer force a shared vertex or
  detour the whole lane.** Four related routing fixes in
  `src/layout-routing.ts`: (1) `buildGrid` now also adds a per-element "hug"
  corridor row above/below each node, so a flow bypassing a single taller
  neighbour finds a short local detour instead of the lane's outer margin;
  that hug clearance is widened from the 6px minimum obstacle margin to a
  visually comfortable 20px. (2) A gateway with both a direct
  (adjacent-column) and a skip-level incoming flow no longer forces both onto
  the same entry point — the skip-level one gets its own top/bottom face.
  (3) The equivalent applies on the exit side: a gateway never crowds two or
  more forward flows onto one vertex while another sits free. (4) A
  gateway's own outgoing cross-lane flow no longer contends for a vertex an
  incoming skip-level flow already claimed.

- **Action preview — Gantt row labels no longer overlap.** The id/name pair
  in the label column was laid out side by side with only a fixed offset,
  which overflowed into the name text once the id got past a handful of
  characters. Labels now stack (name above, id below, matching the entity
  label convention used elsewhere) and the header reads "Actions" (Activity
  is reserved for the process domain).

## [2.9.0] — 2026-07-03

### Changed

- **BPMN — layout engine v2 (lane-aware Sugiyama placement + channel-routed
  orthogonal A\*).** The previous hybrid (global ELK pass for X, per-lane ELK
  passes for Y, per-flow routing heuristics) is replaced by a single coherent
  pipeline in `src/layout-placement.ts` / `src/layout-routing.ts`:
  cycle-broken longest-path columns shared by all lanes, barycenter row
  ordering aware of cross-lane edges, PAVA-based Y assignment (straight
  chains, symmetric gateway fans, spine on the lane axis), and a sparse-grid
  A\* router with bend/congestion/crossing penalties plus track nudging for
  parallel segments. Routed paths can no longer clip element shapes; corpus
  totals improve from 155 → 139 bends, 353 → 297 px median spine deviation
  and 2 → 1 port violations, with crossings at the structural minimum per
  diagram (see `docs/bpmn-routing.md`). Port conventions (right exit / left
  entry, gateway vertex distribution, top/bottom cross-lane gateway exits,
  left-face U-turn loops) are unchanged. `elkjs` is no longer used by the
  BPMN layout path.

### Fixed

- **Action preview — project node suppressed in Gantt and Tree views, Action
  name on its own header line.** The project-container suppression added for
  the Network view in 2.8.0 now also applies to the Gantt view (no more
  full-width phase rollup bar for the project container) and the Tree view
  (the project node no longer renders as the root tree block). The Action
  name renders as its own line immediately below the view heading instead of
  being merged into the heading text; SVG/PNG exports reserve 16 px for the
  extra line. (#341)

- **Blocks — name/ID text overlap fixed, entity-node style unified with
  Goals.** Leaf block nodes rendered the grey ID line 5 px into the last name
  line (`NAME_ID_GAP` 6 → 14). Block and Goals entity boxes now share the
  same corner radius via the new `notation-style.ts` constant
  `ENTITY_NODE_RX = 8`, removing the per-renderer style drift. (#342)

## [2.8.0] — 2026-07-01

### Added

- **BPMN — Title header.** BPMN diagram views now render a `.frame-header`
  title block sourced from `layout.process.name`, matching the title
  treatment already used by every other notation.

- **Network view (PSND) — project container node hidden by default.**
  Activities with `activity_type: project` are suppressed from the rendered
  node list in Network view; the diagram already represents the project
  scope, so the container added visual noise. Canonical parent linkage is
  unchanged — only the rendered list is narrowed, via a new
  `suppressProjectNodes` option (defaults to `true`) on `renderActivitiesSvg`.

- **Tree view — Action name in header.** The tree-view heading now shows the
  document's Action name (`doc.title`) when present, so the reader can
  identify which action they're viewing even when the project node is the
  root of the hierarchy. The project container itself stays visible in this
  view.

- **LOCATION primitive — validator + `unit_located_at` relation.** `LOCATION`
  is now a first-class business-layer element. `unit_located_at` validates the
  business-unit → LOCATION relation with `BLOC-001..003` and `LOC-001..003`
  rules; mismatched subject/target types produce a `layer_semantics` error.

- **BUSINESS_SERVICE primitive — validator + relation layer-semantics.**
  `BUSINESS_SERVICE` elements validate with `BSVC-001..003`; the `provides`
  and `used_by` relations enforce source/target type constraints.

- **INTEGRATION primitive — validator + `interface_semantics` enforcement.**
  `INTEGRATION` elements validate with `INTG-001..003`; the new
  `interface_semantics` relation kind enforces source/target constraints with
  `INTG-004..005` rules.

- **NODE + TECHNOLOGY_SERVICE primitives — validators + `hosts`/`uses` relations.**
  `NODE` and `TECHNOLOGY_SERVICE` validate with `NODE-001..003` /
  `TSVC-001..003`; the `hosts` and `uses` relations carry `TSVC-003`
  layer-semantics enforcement.

### Removed

- **Deprecated notation aliases `fgca`, `fga`, `activities`, `activity-card`.**
  The CLI validators now emit errors (not warnings) for these legacy notation
  values. Canonical replacements: `dgca`, `dga`, `action`, `action-card`.
  See [RELEASING.md](RELEASING.md) for migration steps.

- **Deprecated VS Code file-extension support for `*.fgca`, `*.fga`,
  `*.activities`, `*.activity-card`, `*.activities-tree`.** The extension no
  longer activates for these file patterns; preview commands, language entries,
  and activation events for the deprecated suffixes are removed. Use the
  canonical equivalents: `*.dgca`, `*.dga`, `*.action`, `*.action-card`,
  `*.actions-tree`.

- **Deprecated org canon examples and IntelliJ plugin notation entries.**
  `canon/views/fgca/` and `canon/views/fga/` removed; `canon/views/activities/`
  and `canon/views/activity-card/` renamed to `action/` and `action-card/`.
  IntelliJ plugin's deprecated suffix→kind mappings for `fgca`, `fga`,
  `activities`, `activity-card` removed; canonical `action` / `action-card`
  mappings added.

### Fixed

- **BPMN — fewer routing crossings and redundant bends.** Collinear
  intermediate waypoints (no direction change) are now stripped from routed
  edges, and converging S-curve flows into the same join element are routed
  via a shared approach column when their midpoints would otherwise
  interleave, avoiding crossings. Adds the `parallel-tracks` corpus fixture.

- **BPMN — equalize toggle now applies normalization.** The `ProcessPreview`
  lambda in the extension dropped the `opts` argument, so `uniformLaneHeight`
  never reached `layoutProcess` regardless of the equalize checkbox state.
  Opts now thread end-to-end through the compile path the extension uses.

- **Nested Blocks — no label overflow on container headers.** Container block
  headers now stack the name (`text-primary`) above the ID (`text-id`, grey)
  and truncate each line with `…` to fit within the block width, instead of
  appending the ID as a single inline suffix that could spill past the rect
  for long identifiers. Leaf blocks retain the 3-line name / 2-line ID
  wrapping rule with the same horizontal-margin guarantee.

### Internal

- **`FGCAPreview` → `DGCAPreview`, `FGAPreview` → `DGAPreview`.** Internal
  preview class names, webview panel IDs (`fgcaPreview` → `dgcaPreview`,
  `fgaPreview` → `dgaPreview`), and `when`-clause guards updated to canonical
  names.

- **Dead `fgca`/`fga` scope, view, and spacing-config settings removed** from
  the VS Code extension's internal types and `package.json` settings
  contributions, following the notation-alias removal above.

- **IntelliJ `until-build` widened to 262** for JetBrains 2026.2
  compatibility.

---

## [2.7.0] — 2026-06-26

### Added

- **DGCA/FGCA — automatic crossing minimisation.** The SVG layout engine now runs a single-pass left-to-right barycenter sweep before placing each column. Nodes in a column are sorted by the average y-centre of their left-hand predecessors, reducing visual edge tangles without any user action. Nodes with no predecessors sort last to avoid displacing connected nodes.

- **Goals — entity block with type label and ID.** Each node in the Goals SVG renderer now shows three rows: name (word-wrapped up to 2 lines, 30 chars each), goal type (e.g. `Strategic Goal`) in secondary colour, and the goal ID in grey below. Node height increased from 60 to 72 px.

- **Diagrams — unified entity block design.** All diagram nodes (Goals, FGCA, DGCA) follow a shared entity block layout: name centred and word-wrapped (≤ 30 chars / line, max 2 lines, truncated with `…`); entity ID rendered below in `text-id` (smaller, grey). Node height 72 px across all types.

- **Activity Card — inline stakeholders.** The resolver now reads a `stakeholders: [ID, …]` list directly from the Action element frontmatter in addition to `action_stakeholder` / `activity_stakeholder` REL files. REL entries take precedence (they carry a `role`) and dedup inline duplicates.

### Changed

- **Activity Card — Assessments section removed.** The card layout no longer renders an Assessments section. The motivation chain reads Drivers → Goals → Changes; assessments belong to driver-level analysis, not the card surface.

### Fixed

- **FGCA — canonical string IDs preserved in diagram nodes.** Node IDs were being coerced from the canonical string form during `parse-canonical`; they are now preserved as strings throughout so downstream renderers see the correct values.

- **Preview — Controls panel collapsed height aligned.** The Controls collapsible panel now collapses to the same height as the Warnings and Errors panels (one-line fix).

---

## [2.6.0] — 2026-06-26

### Added

- **Capability Map — Tree view.** Add `view: tree` to a `.capability-map.transitrix.yaml` file to render a depth-banded SVG node tree (250×64 px rounded nodes, pink/yellow/blue level fills, maturity badges). Nodes are collapsible/expandable via +/− buttons; a colour-coded legend band shows depth proportions. The default `view: cards` layout is unchanged.

- **ACTIVITY → ACTION notation — viewer support.** The extension now recognises `*.action.transitrix.yaml`, `*.action-card.transitrix.yaml`, `*.actions-tree.transitrix.yaml`, and `*.activities-tree.transitrix.yaml`. The validators and resolver accept the canonical `action` / `action-card` notation keys and the new root fields (`actions:`, `action_card:`, `action_type`, `action_goal`, `ACTION-*` IDs) alongside the deprecated `activities` / `activity-card` equivalents. Legacy files continue to open and now show a deprecation banner prompting migration.

---

## [2.5.0] — 2026-06-25

### Changed

- **DGCA — fourth column renamed Activity → Action.** The column header, preview heading, and schema key are now `actions` / "Action". The old `activities:` key is still accepted and produces a `DEPRECATED_NOTATION` warning; rename to `actions:` at your convenience.

### Fixed

- **Activities preview — Tree tab visual polish.** Node cards now show a border and background; child nodes are connected by a vertical branch line.

## [2.4.0] — 2026-06-25

### Added

- **Activities preview — Tree tab.** Third view alongside Network and Gantt. Renders ACTIVITY elements as a collapsible tree (Initiative → Programme → Project → Task) via the `parent` field. Each node shows name, ID below in monospace grey, `activity_type` badge colour-coded by level, owner, and date range. Initiative/Programme/Project nodes default-expanded; Tasks collapsed.

- **Process Blueprint — compliance legend in PNG/SVG export.** When the Legend toggle is enabled in the preview, exporting (Save PNG, Copy PNG, Save SVG) appends a four-chip legend strip at the bottom of the diagram. When the legend is hidden, export is unchanged.

- **BPMN Process — equalize lane heights toggle.** New checkbox in the BPMN Controls panel (`Display` section). When enabled, all swimlanes in a pool render at the same height (max of per-lane content heights). Matches standard BPMN tool behaviour; default off.

### Fixed

- **Compliance-impact — `report_type` enforcement (COMPIMP-011).** `ImpactViewConfig` gains `report_type?: 'product' | 'process' | 'combined'`. When set, `buildImpactMatrix` strips columns of the wrong subject type and emits `COMPIMP-011`. Prevents spurious cross-type columns in single-scope views.

- **Compliance-impact — subject-type column badges in combined views.** When both PRODUCT and PROCESS columns are present, each column header now shows a coloured chip (blue PRODUCT / green PROCESS), matching the §5.2 label invariant.

- **Compliance-impact — horizontal scrollbar at viewport edge.** The scrollbar now appears at the bottom of the visible viewport rather than mid-page inside a free-height container.

## [2.3.0] — 2026-06-24

### Added

- **`transitrix validate` — canonical notation extensions accepted without `--ext`.**
  All canonical file extensions (`.goals.transitrix.yaml`, `.dgca.transitrix.yaml`, etc.) are now in the default accepted list, derived automatically from the validator registry.
  When a file has a canonical extension but no `notation:` field, the CLI emits a targeted hint ("add `notation: dgca` to the file") instead of the generic extension error.
- **Compliance-impact — PRODUCT/PROCESS subject type label invariant (§5.2, COMPIMP-009/010).**
  `ImpactColumn` now carries `subjectType: 'product' | 'process' | 'capability'` end-to-end.
  Combined views (both `subjects.products` and `subjects.processes` set) render column headers with `[PRODUCT]` / `[PROCESS]` badges so subject types are always distinguishable.
  `ImpactGrouping.columns` accepts the three process-centric variants (`process`, `process-stage`, `process-stage-task`) for the §7.1 process compliance report.
  `ImpactMatrix.findings` carries COMPIMP-009 (warning) and COMPIMP-010 (error) structural diagnostics.

### Fixed

- **Activity Card — PC-001 diagnostic is now actionable.** When the project activity element is absent from the canon scope, the error message discloses the paths searched (`canon/elements/**` and `canon/views/activities/**`) and suggests the exact YAML fields to add.
- **IntelliJ plugin — version auto-derived from release tag.** The plugin version is no longer hardcoded; it is read from the `v2.x.y` release tag at build time. DGCA/DGA notation keys also registered.

## [2.2.0] — 2026-06-24

### Added

- **BPMN preview — custom SVG renderer is the default** (`transitrix.bpmnRenderer`: `"custom"`). Set `"bpmn-io"` to revert to the legacy bpmn.io viewer.
- **BPMN preview — `transitrix.bpmn.laneGap` setting** (0–200 px between swimlanes).
- **BPMN SVG renderer** — default-flow marker, word-wrapped below-element labels, lane clip-path; solid conditional sequence flows.
- **Blocks preview** — block IDs in nested block diagrams.
- **Auto-open previews** for BPMN, compliance-impact, single law, and single product files.
- **DGCA / DGA notation** (renamed from FGCA / FGA); legacy keys accepted with deprecation warnings through 1.x.
- **Driver terminology** (factor → driver) in DGCA column validators and rendering.
- **BPMN Save as PNG** from the preview toolbar.
- **Entity IDs** below node names in DGCA/DGA, FGA/DGA, and Activities diagrams.

### Fixed

- BPMN **Open Preview** from the editor title bar when webview has focus.
- DGCA files routed to the correct preview by `notation:` header.
- BPMN layout polish: compact pool/lane geometry, start-event label inset, rotated header caption padding, min lane height for long lane names, `laneGap` default 0.
- BPMN cross-lane routing, `defaultFlow` XML, Activities node styling, preview title pattern, Process Blueprint PNG export.
- BPMN DSL schema: `name`, `generated_at`, `performed_by_role`, `supported_by_application`.
- CLI `dgca` / `dga` validator keys; `extension:prep` runs `build:diagrams` before VSIX packaging.

## [2.1.1] — 2026-06-20

### Fixed

- **No-italic rule — complete.** `font-style: italic` removed from all rendering surfaces, including the JCEF webview bundle (`styles.css`). All previews and exports now use weight, size, or colour for visual hierarchy.
- **`dominant-baseline:central` in CSS text classes.** `.text-header`, `.text-primary`, `.text-secondary`, `.text-id`, and `.text-pill` in `themes.ts` now carry `dominant-baseline:central` directly — eliminating fragile per-element inline repetition and fixing the Activity Card title element's baseline.
- **Process-blueprint renderer.** `dominant-baseline="central"` SVG presentation attributes converted to `style="dominant-baseline:central"` inline styles on all `<text>` elements, consistent with the activity-card renderer.
- **Activity Card — taller cells.** `DATES_H`, `ROLES_H`, `CHAIN_NODE_H`, `MILESTONE_H`, and `INFO_ROW_BASE_H` increased by 6–12 px for better label/value spacing and readability.

### Changed

- **GDPR remediation example — three milestones.** `eu-gdpr-remediation.activity-card.transitrix.yaml` now carries explicit milestones for the DSR workflow go-live (2026-10-31), supervisory-authority pre-audit clearance (2026-10-31), and Art. 7 consent rework (2026-11-30).

### Internal

- **Test guard.** `resolver.test.ts` — `toBeUndefined()` stakeholder-role assertion now guarded with `expect(sh).toBeDefined()` to prevent vacuous passes on empty-stakeholder regressions.
- **`escXml` consolidation.** `extension/src/activity-card-preview.ts` now imports `escXml` from `render-util.ts` instead of maintaining a private copy.

## [2.1.0] — 2026-06-20

### Added

- **Activity Card — full motivation chain.** The card now resolves and displays the complete **Driver → Assessment → Goal → Change** chain from the canon element store. Empty sections render a "— not on file" gap indicator so authors see missing data. Each section header carries a concise subtitle question (e.g. *"What prompted this initiative?"*).
- **Activity Card — status and activity type badges.** `status` and `activity_type` fields on the Activity element are now shown as styled badges in the card header (`planned`, `in_progress`, `programme`, `project`, …).
- **Activity Card — stakeholder role slots.** `Initiator`, `Owner`, `Sponsor`, and `PM` slots are resolved from `activity_stakeholder` relations and rendered in a 2-column grid. Names are no longer truncated at 20 characters.
- **GDPR remediation example.** `organizations/acme_corp/` ships a complete `ACTIVITY-GDPR-REMEDIATION-1` programme with a full motivation chain, three workstream children, and an Activity Card view.
- **Preview live sliders.** Spacing and curvature sliders update the diagram immediately on drag.
- **`@transitrix/diagrams` npm publish CI workflow.**

### Changed

- **All previews — "Generated:" date label.** The date line in every diagram title block now reads `Generated: YYYY-MM-DD` to distinguish it from project date fields.
- **Activity Card — badge text vertically centred.** Uses `style="dominant-baseline:central"` (inline; specificity 1-0-0) so CSS class rules cannot override the alignment.
- **`ResolvedDriver` replaces `ResolvedFactor`** in `@transitrix/diagrams`. `ResolvedFactor` is kept as a deprecated alias and will be removed in 2.2.0. YAML corpus is unchanged (`notation: factor`, `goal.factors`).

### Internal

- **Cervin deprecation P5.** `src/transitrixrc.ts` is now the canonical module; `src/cervinrc.ts` is a thin re-export shim. `loadCervinrc()` and `CERVINRC_SCHEMA` deprecated aliases kept through 2.x.

## [2.0.0] — 2026-06-18

### Changed

- **Toolbar "Copy PNG" button renamed to "Copy image"** — cleaner label, avoids the all-caps acronym.

### Breaking changes

All `cervin` compatibility shims introduced in 1.x are removed in this release.
See the **Migration guide** section below for drop-in replacements.

- **`cervin` CLI binary removed.** The `cervin` command no longer exists. Use `transitrix`.
- **`cervin.*` VS Code settings removed.** `cervin.fileExtensions` and `cervin.exportEnabled` no longer exist. Use `transitrix.fileExtensions` / `transitrix.exportEnabled`.
- **`cervin.*` VS Code commands removed.** `cervin.openPreview`, `cervin.exportSvg`, `cervin.exportPng`, `cervin.exportBpmn` are gone. Use the `transitrix.*` equivalents. Any keybindings or macros that referenced `cervin.*` commands must be updated.
- **`.cervinrc` config file no longer read.** `loadTransitrixrc()` now reads only `.transitrixrc`. Rename `.cervinrc` → `.transitrixrc` (same JSON schema).
- **`cervin-yaml` VS Code language ID renamed to `transitrix-yaml`.** If you have `"[cervin-yaml]"` in your `settings.json` (e.g. for a formatter rule), change it to `"[transitrix-yaml]"`. `cervin-yaml` is listed as a legacy alias so existing syntax highlighting continues to work without action for most users.
- **`DEFAULT_CERVIN_FILE_EXTENSIONS` is now a deprecated alias of `DEFAULT_TRANSITRIX_FILE_EXTENSIONS`.** The default file extension list no longer includes `.cervin.yaml`; only `.bpmn.transitrix.yaml` is canonical.
- **BPMN `exporter` attribute changed from `cervin` to `transitrix`.** Exported `.bpmn` files now carry `exporter="transitrix"`. Existing files are unaffected; only newly compiled files change.

### Migration guide

| 1.x (removed) | 2.0 replacement |
|----------------|-----------------|
| `cervin <args>` | `transitrix <args>` |
| `cervin.fileExtensions` setting | `transitrix.fileExtensions` |
| `cervin.exportEnabled` setting | `transitrix.exportEnabled` |
| `cervin.openPreview` command | `transitrix.openPreview` |
| `cervin.exportSvg` command | `transitrix.exportSvg` |
| `cervin.exportPng` command | `transitrix.exportPng` |
| `cervin.exportBpmn` command | `transitrix.exportBpmn` |
| `.cervinrc` project config | `.transitrixrc` (identical JSON schema) |
| `"[cervin-yaml]"` in settings.json | `"[transitrix-yaml]"` |

**Note:** `*.cervin.yaml` files still open in the editor and the language server — the file-extension sunset is a separate methodology decision.

### Removed

- `cervin` bin entry from `package.json` / `bin` field
- `cervin.*` VS Code command registrations and Command Palette entries
- `cervin.*` VS Code setting enablement fallbacks
- `.cervinrc` fallback path in `loadTransitrixrc()`
- `CERVIN_DEPRECATION_NOTICE` / `invokedAsCervin()` from `cli-parse.ts`
- `cervinPackageVersion()` → replaced by `transitrixPackageVersion()`
- `cervin-export-` temp directory prefix → now `transitrix-export-`

## [1.6.0] — 2026-06-17

### Added
- **`transitrix.report.columnWidth` setting** — choose between Narrow (80 px), Normal (120 px, default), and Wide (200 px) column widths for all table-based compliance reports: compliance-impact, compliance-matrix, products, process-map, applications, scenarios, coverage-metric, and the FGCA chain table. Interactive reports (compliance-impact, compliance-matrix) expose a live dropdown in the toolbar that persists the choice to the workspace configuration; static reports pick it up at render time.
- **Product names in compliance-impact column headers.** Each law × subject column now shows the product's display name (e.g. "E-commerce Platform") with the product code in a smaller gray line below, instead of showing only the raw identifier. The name is sourced from the compliance canon product document.

### Changed
- **Skipped-notation scan diagnostic now surfaces file paths and notation values.** When the compliance scanner skips a YAML file whose `notation` value is not recognised, the preview toolbar now lists every distinct unrecognised notation string (e.g. `scenario`, `unknown-type`) with an expandable tooltip showing the workspace-relative paths of the affected files, replacing the previous bare file count.
- **Coverage-metric "Coverage Status" column** (was "RAG"). The last column in the coverage-metric report is renamed to avoid confusion with the RAG (Retrieval-Augmented Generation) term that is commonly used in AI-based documentation workflows. A tooltip on the header still explains the green / amber / red threshold semantics.

### Fixed
- **Coverage-metric parser aligned with the notation spec.** The parser previously expected `coverage_metric.scope.codex` (a key that does not exist in the spec, COVMET-001). It now accepts the canonical `view: { regimes: { include | filter }, subjects }` format. `regimes.include` takes an explicit list of codex IDs; `regimes.filter` resolves from the workspace canon by `jurisdiction` and/or `codex_type`; omitting `regimes` entirely enumerates all codex entries. The deprecated `coverage_metric:` wrapper is still accepted and its `scope.codex` is silently migrated to `regimes.include` (emits a `COVMET-DEPRECATED` warning). Fixture YAML files updated to `view:` + `spec_version: "0.2"`.

## [1.5.3] — 2026-06-17

### Fixed
- **Compliance-impact preview now renders the matrix grid.** `bodyHtml` (the obligation × subject table) was computed but never interpolated into the HTML template returned by `buildHtml` — the panel displayed the toolbar and filter controls but the body was completely absent. One-line fix inserts `bodyHtml` between the filters block and the script tag.

### Changed
- **Compliance-impact scan surfaces a skip-count diagnostic.** `scanComplianceCanon` now counts YAML files that carry both `id` and `notation` fields but aren't recognised as compliance artefacts (unrecognized notation value). The preview summary line shows a ⚠ warning with the count so users can diagnose an unexpectedly empty matrix rather than guessing.
- **Build scripts consolidated** — `build-extension.bat` / `build-extension.sh` replaced by `scripts/package-extension.mjs` (cross-platform Node.js, same `--bump` / `--target` flags). Shared esbuild constants extracted to `scripts/esbuild-helpers.mjs` to reduce duplication across the three bundle scripts.

## [1.5.2] — 2026-06-16

### Added
- **`transitrix.entryCurvature.<notation>` settings** — independent control over the arrow curvature at the point it enters a target node (`goals`, `fgca`, `fga`, `activities`). Previously the single `curvature` multiplier was applied symmetrically to both the exit and entry control handles; at low `curvature` values this caused the arrival curve to look cramped, especially on edges with large vertical spans. Setting `entryCurvature` higher than `curvature` (e.g. `curvature: 0.4`, `entryCurvature: 1.2`) gives a gentle exit while keeping the arrival smooth. Defaults to `1`; when equal to `curvature`, behaviour is identical to the previous release.

## [1.5.0] — 2026-06-16

### Added
- **Open VSX CI publish workflow** — `.github/workflows/openvsx-publish.yml` runs on every GitHub Release and publishes per-platform VSIXs to Open VSX in parallel across five runners (`linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `win32-x64`). Each runner installs the platform-specific `@resvg/resvg-js-*` native binary during `npm run extension:prep`, so every VSIX carries the correct binary for its target. `OVSX_PAT` is read from the repo Actions secret. A `workflow_dispatch` trigger allows manual re-runs. `win32-arm64` not yet in matrix (no GA GitHub-hosted Windows ARM runner). Runbook `docs/openvsx-publish-runbook.md` updated to document the CI path as the recommended sync procedure (strategy #184).
- **`.transitrixrc` project config** — canonical replacement for `.cervinrc`. `loadTransitrixrc()` reads `.transitrixrc` first and falls back to `.cervinrc` (one-time deprecation notice) when absent; ships `transitrixrc.schema.json` (root + extension `schemas/`). `.cervinrc` keeps working through 1.x (removed in 2.0.0). Fourth phase of the Cervin → Transitrix rename (CLAUDE.md §Cervin naming, P4).
- **`transitrix` CLI binary** — the primary command is now `transitrix`; it is added as a `bin` entry (and an `npm run transitrix` script) pointing at the same `dist/cli.js`. `--help` and usage text recommend `transitrix`.
- **VS Code settings `transitrix.fileExtensions` / `transitrix.exportEnabled`** — canonical replacements for the legacy `cervin.*` keys, registered in the extension's `contributes.configuration`.
- **VS Code commands `transitrix.openPreview` / `transitrix.exportSvg` / `transitrix.exportPng` / `transitrix.exportBpmn`** — canonical replacements for the `cervin.*` commands. The editor-title preview button now invokes `transitrix.openPreview`.

### Changed
- **`@transitrix/diagrams` prepared for first npm publish (1.0.0)** — `packages/diagrams/package.json` drops `private: true`, bumps to `1.0.0`, and adds `homepage`, `bugs`, and `repository` (with `directory`) fields per the release runbook prep step. Package now ships a `README.md` and `LICENSE` so the npm tarball is complete. No source or API change. Package is consumed only as a workspace inside this repo, so the version bump has no downstream effect; the actual `npm publish` is a manual maintainer action gated on the `transitrix` npm organisation (strategy #199).
- **`@transitrix/cli` slim package assembled for first npm publish (1.0.0)** — new `packages/cli/` workspace owning the slim publishable artefact: own `package.json` with `bin: { transitrix }` (no `cervin` alias — the package is born in the 2.0 era), `files` allowlist, runtime `dependencies` only, `engines.node >= 20`, plus `README.md` and `LICENSE`. New `scripts/build-cli-package.mjs` (wired into the workspace's `prepack` and the root `build:cli-package` script) esbuild-bundles `cli.ts`, `repo-validate.ts`, and `export-compliance.ts` into `dist/`, externalising the runtime npm deps, and copies `schemas/*.json` next to `dist/` so `dist/../schemas/bpmn-dsl.schema.json` resolves at runtime. `npm pack --dry-run --workspace packages/cli` ships exactly `dist/` (3 bundled files), `schemas/` (3 JSON schemas), `package.json`, `README.md`, `LICENSE` — ~40 kB tarball. End-to-end smoke (compile + validate on a corpus fixture) green from the bundle. The actual `npm publish` is a manual maintainer action gated on the `transitrix` npm organisation and on `@transitrix/diagrams@1.0.0` being live (strategy #199).

### Docs
- **Compliance fixture corpus re-labelled to Acme Corp** — the in-tree regression fixtures (`tests/fixtures/notation-corpus/compliance/`) that still carried `NorthBay Retail` labels and `northbay.example` evidence URLs are updated to the canonical `Acme Corp` identity. The `.archive/compliance-northbay-demo/` content was already in `acme_corp` (superseded per the DEMO.md note); this cleans the remaining branding artefact from the in-tree copy (strategy #239).
- **Stale `.archive/compliance-northbay-demo/` references removed from three tracked corpus files** — the retired-stub `coverage-metric` and `compliance-impact` examples in `tests/fixtures/notation-corpus/` and `tests/fixtures/notation-corpus/compliance/DEMO.md` no longer point at `.archive/compliance-northbay-demo/`. The canonical adopter compliance demo is the connected `transitrix/acme-corp` corpus (referenced from `transitrix/methodology` as `organizations/acme_corp/`); Studio's own `tests/fixtures/notation-corpus/compliance/` corpus stays as the in-tree regression fixture (strategy #239).
- **CLI usage outside VS Code** — new [`docs/cli.md`](docs/cli.md) and a rewritten README CLI section explain how to get the `transitrix` CLI on `PATH` from a clone (`npm install && npm run build && npm link`), how to run it without a global install, and how a script/skill should auto-detect it. Clarifies the CLI is not yet on npm and the VS Code extension does not ship a PATH binary (unblocks scripted/CI/skill use — strategy #187).
- **npm release runbook** — new [`docs/release-runbook.md`](docs/release-runbook.md) codifies the manual `npm publish` procedure for `@transitrix/diagrams` (first) and `@transitrix/cli` (second), per the 2026-06-10 publish decisions on strategy #199. Prerequisites, pre-flight checklist, per-package publish steps with `--access public` + 2FA, post-publish verification, tagging, and the unpublish/deprecate guidance. CI publish-on-tag automation is a deferred follow-up.
- **Open VSX (Cursor / VSCodium / Windsurf) publish runbook** — new [`docs/openvsx-publish-runbook.md`](docs/openvsx-publish-runbook.md) codifies the per-platform `ovsx publish` second-hop after every VS Code Marketplace release: namespace claim, `OVSX_PAT`, per-target VSIXs (the existing `npm run package-extension` artefacts), verification via the registry API and an in-editor install check, and the steady-state sync discipline. Root and `extension/` READMEs now list Cursor / VSCodium / Windsurf alongside VS Code; `docs/packaging.md` and `docs/release-runbook.md` cross-link the new runbook (strategy #184).

### Deprecated
- **`cervin` CLI is deprecated, use `transitrix`.** The `cervin` bin is kept as a compatibility alias (no removal in this release; slated for 2.0.0). Invoking the tool under the `cervin` name prints a one-line deprecation notice to stderr. First phase of the Cervin → Transitrix CLI rename (CLAUDE.md §Cervin naming, P1).
- **`cervin.*` extension settings are deprecated, use `transitrix.*`.** The legacy `cervin.fileExtensions` / `cervin.exportEnabled` keys are read as a fallback when their `transitrix.*` counterpart is unset (existing configs keep working) and are marked deprecated in the settings UI; removal is slated for 2.0.0. A one-time migration notice is shown on activation when a legacy key is in effect. Second phase of the Cervin → Transitrix rename (CLAUDE.md §Cervin naming, P2).
- **`cervin.*` extension commands are deprecated, use `transitrix.*`.** The four `cervin.*` commands are kept as aliases for one release so existing keybindings and macros survive; they are hidden from the Command Palette and labelled "(deprecated)", and invoking one logs a one-time deprecation notice before delegating to the canonical handler. Removal is slated for 2.0.0. Third phase of the Cervin → Transitrix rename (CLAUDE.md §Cervin naming, P3).
- **Corpus & examples convention — canonical `*.transitrix.yaml` only.** New notation files use the canonical suffixes (BPMN: `*.bpmn.transitrix.yaml`); the deprecated `*.cervin.yaml` suffix stays accepted by the compiler/editor but must not be used for new files. A CI guard (`npm run check:no-cervin-yaml`) fails the build on any tracked `*.cervin.yaml`. Documented in CONTRIBUTING.md. Sixth phase of the Cervin → Transitrix rename (CLAUDE.md §Cervin naming, P6).
- **Internal compiler/config API renamed `*Cervin*` → `*Transitrix*`.** `compiler.ts` now exports `compileTransitrixYaml` / `compileTransitrixYamlWithLayout` / `CompileTransitrixOptions`, and the config type is `TransitrixrcConfig`. The old `compileCervinYaml*`, `CompileCervinOptions` and `CervinrcConfig` names remain as `@deprecated` aliases for one minor (removed in 2.0.0). In-repo callers updated. Fifth phase of the Cervin → Transitrix rename (CLAUDE.md §Cervin naming, P5).

### Fixed
- **Marketplace listing preview image renders again (was a broken thumbnail in 1.4.2).** The README packaged into 1.4.2 carried a relative `docs/preview.png` link, which `vsce` rewrote to `https://github.com/transitrix/transitrix-studio/raw/HEAD/docs/preview.png` — a 404, because the file lives at `extension/docs/preview.png` and the rewrite drops the `extension/` prefix. Both the VS Code Marketplace and Open VSX (Cursor / VSCodium / Windsurf) rendered the 404 as a tiny broken-image pictogram. `main` already uses an absolute `https://raw.githubusercontent.com/.../main/extension/docs/preview.png` URL (HTTP 200) that `vsce` leaves untouched; this 1.4.3 bump cuts a republishable version carrying that fix (a published version cannot be overwritten in place).
- **`npm run compile:extension` is green again** — `process-blueprint/layout.ts` no longer types its option defaults as `Required<ProcessBlueprintLayoutOptions>` (which forced the opt-in `complianceLane` / `complianceInput` fields to be non-`undefined`). A `ResolvedLayoutOptions` type keeps the sizing fields required while leaving the compliance pair optional. Type-only change — no layout behaviour change. CI now runs `compile` + `compile:extension` so the type-check regression (introduced with the compliance lane, #129) can't reappear silently.

## [1.4.1] — 2026-06-09

### Fixed
- **VSIX packaging** — drop a retired preview source that was still under
  `extension/` and ship a `verify-extension-packaging` gate in build scripts and CI
  so non-runtime paths cannot re-enter the Marketplace artifact.

### Removed
- **Issues register notation retired.** The `issues` notation (`*.issues.transitrix.yaml`) — diagrams module, extension preview/commands/menus/language, activation event, and example — is removed, following the methodology decision to retire the model-side `ISSUE` type (architectural problems/risks are modelled as `ASSESSMENT`; team tracking uses Work Items). Breaking change for `@transitrix/diagrams` consumers importing the issues exports.

## [1.4.0] — 2026-06-05

### Added
- **`transitrix export-compliance --format pdf`** — PDF export of the compliance views (matrix / single-law / single-product / gap) via WeasyPrint. The HTML half (`renderComplianceHtml` in `@transitrix/diagrams/compliance`) builds a self-contained A4-portrait branded document; the CLI hands it to a `weasyprint` subprocess on PATH and surfaces a clear install hint when the binary is missing.

### Fixed
- **Process Blueprint goal/result cells now wrap their text** instead of truncating it to a single 32-character line. The layout word-wraps each cell to the column width and grows the goal/result rows to fit the tallest cell (capped at 6 lines with an ellipsis); both the VS Code preview and the JCEF webview renderer share the wrapped layout.

## [1.3.0] — 2026-06-02

### Added
- **Activity Card notation** (`*.activity-card.transitrix.yaml`) — `@transitrix/diagrams` types, cross-doc resolver, validator, layout, Studio preview, activation/build wiring, worked example. Save-as-SVG / PNG and copy-as-PNG commands.
- **Configurable preview spacing** — `transitrix.spacing.{goals,fgca,fga,activities}.{horizontalGap,verticalGap}` settings.
- **Configurable edge curvature** — `transitrix.curvature.{goals,fgca,fga,activities}` settings (0 = straight, 1 = default, higher = stronger arc).
- **Scope filters for Goals/FGCA/FGA** — `transitrix.scope.{goals,fgca,fga}.{rootId,maxLevel}` settings (scope to a single subtree or to a level cap).
- **Live in-preview controls** — spacing / curvature / scope adjustable from a toolbar inside the Goals, FGCA, FGA, and Activities previews (interactive webviews backed by a strict nonce-CSP).
- **FGCA / FGA tree↔table view toggle** — flatten the chain into a table with merged cells (`Factor | Goal | Change | Activity`, FGA: `Factor | Goal | Activity`). Persisted per notation via `transitrix.view.{fgca,fga}`.
- **Compliance notations** — Requirement and Assertion schemas + validators in `@transitrix/diagrams` (REQ-001..003, ASSERT-001..008).
- **Compliance matrix preview** — Products × Requirements grid with status colouring; toolbar filters by jurisdiction / severity / status. Command: `transitrixStudio.previewComplianceMatrix`.
- **Single-law compliance preview** — Law → Requirements → Assertions tree, triggered from any Codex file. Command: `transitrixStudio.previewSingleLaw`.
- **Single-product compliance preview** — Product → bound Requirements → status. Command: `transitrixStudio.previewSingleProduct`.
- **Compliance gap dashboard** — Requirements without Assertions, Assertions without evidence, stale Assertions past `next_review_at`; CSV export. Command: `transitrixStudio.previewGapDashboard`.
- **`transitrix export-compliance` CLI** — exports the compliance matrix as Markdown (`--format md`, `--scope law:<id>|product:<id>`, `--output <path>`).

### Changed
- Validators across `goals`, `fgca`, `capability-map`, `process-map`, `applications`, `products`, `scenarios`, `process-blueprint` now guard each array element with an "entry must be an object" check before reading fields — malformed YAML (e.g. `goals: [null]`) degrades to a structured error panel instead of crashing the preview.

### Fixed
- `goals/validate.ts` — `goal.level` is now type-checked numerically; a string or missing `level` produces a SCHEMA_INVALID error instead of silently slipping through.
- `goals/layout.ts` `placeSubtree` — adds a visited-set guard so a parent cycle / self-parent no longer overflows the stack when `layoutGoalTree` is called without prior validation.
- `fgca/layout.ts` — `activity_ids` accesses are nullish-guarded so a change with no `activity_ids` renders cleanly instead of throwing.
- `activities/validate.ts` ACT-008 — `start_date` / `end_date` are now format-checked against `YYYY-MM-DD` before lexicographic comparison.
- `serve-ui.ts` — `createReadStream` now attaches an `'error'` handler that destroys the socket cleanly instead of crashing the process on a mid-stream disk error.
- `serve-ui.ts` `isInsideRoot` — uses a direct path-prefix comparison so a candidate on a different Windows drive (`D:\` vs `C:\`) is correctly rejected.
- `extension/package.json` — `activationEvents` extended to cover all eleven notation suffixes (activities, blocks, applications, products, process-map, scenarios, capability-map, process-blueprint, activity-card, issues) so previews and editor-title buttons activate from a cold VS Code window.

### Docs
- New ADR "IntelliJ MVP Technology Choice" (0001) — records the rendering / validation technology choice for the upcoming IntelliJ IDEA extension MVP (JCEF + bundled `@transitrix/diagrams`). Tracking work only; no plugin code in this release.

## [1.2.1] — 2026-05-29

Marketplace re-package of 1.2.0. No user-facing changes; release-engineering only.

## [1.2.0] — 2026-05-27

### Added
- PNG export across previews — `Save as .png` and `Copy as PNG` commands for goals, FGCA, FGA, activities, blocks, process-blueprint, issues, activity-card.
- Refreshed Marketplace README and extension description (legacy "cervin" copy removed; native-binaries claim corrected).

### Changed
- Stopped tracking generated `extension/media/` assets in git.
- Locked flat-canon FGCA/FGA rendering; FGA parser consolidated.

## [1.1.0] — earlier 2026-05

Internal release between 1.0.0 and 1.2.0; see git history for details.

## [1.0.0] — earlier 2026-05

First **1.x** Marketplace release after the v0.4.x line. See `0.4.x` entries below for the prior history.

## [0.4.19] — 2026-05-21

### Added
- Notation coverage: process map, scenarios, and capability map (TX-020).
- Product portfolio preview.
- Application portfolio preview.
- `build-extension.bat` for packaging the VS Code extension.

### Changed
- Repository layout cleanup — archived legacy components, deduped backends, relocated webview (TX-037).
- Test execution unified — root `npm test` runs both core and diagrams suites; CI covers notation modules.

### Fixed
- FGA and Goals parsers aligned with canonical spec shapes.
- CI metrics-diff thresholds aligned with relaxed regression tests.

### Security
- **TX-R001** — reject shell metacharacters in `svgbobCommand` in the blocks backend to prevent command injection. `parseBlocksCompileJson` now validates the command via an allowlist (alphanumerics, hyphens, dots, path separators) and rejects whitespace, control characters, and shell metacharacters (`; | & $ ` ( ) < > ! " ' { } [ ] # ~ \`). Covered by `tests/blocks-backend.test.ts`.

## [0.4.0] — 2026-05-09

### Added
- Goals tree viewer for `*.goals.transitrix.yaml` files (VS Code webview + web UI tab).
- `@transitrix/diagrams` shared library (`packages/diagrams`) with goals and FGCA modules.
- esbuild extension bundling — VSIX is now self-contained, no `node_modules` needed.
- `extension/icon.png` (128×128).

### Changed
- Brand renamed to **Transitrix Studio** (was: Cervin / LiteEA BAT).
- Root package renamed to `transitrix-studio`; repository URLs updated to `github.com/transitrix/transitrix-studio`.
- All user-visible command titles updated to `Transitrix: …` prefix.
- `README.md` rewritten in English.
- `extension/README.md` rewritten as Marketplace listing page.
- Initial public release on the Microsoft VS Code Marketplace.

### Deferred (planned for v0.5)
- File extension migration (`.cervin.yaml` → `.bpmn.transitrix.yaml`).
- CLI binary rename (`cervin` → `transitrix-studio` or `tstudio`).
- Internal command ID rename (`cervin.*` → `transitrixStudio.*`).
