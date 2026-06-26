# Changelog

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
- New ADR `docs/adr/0001-intellij-mvp-tech-choice.md` — records the rendering / validation technology choice for the upcoming IntelliJ IDEA extension MVP (JCEF + bundled `@transitrix/diagrams`). Tracking work only; no plugin code in this release.

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
