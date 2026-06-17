# Changelog

## [Unreleased]

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
