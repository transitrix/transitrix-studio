# Changelog

## [Unreleased]

### Added
- **`transitrix` CLI binary** — the primary command is now `transitrix`; it is added as a `bin` entry (and an `npm run transitrix` script) pointing at the same `dist/cli.js`. `--help` and usage text recommend `transitrix`.
- **VS Code settings `transitrix.fileExtensions` / `transitrix.exportEnabled`** — canonical replacements for the legacy `cervin.*` keys, registered in the extension's `contributes.configuration`.
- **VS Code commands `transitrix.openPreview` / `transitrix.exportSvg` / `transitrix.exportPng` / `transitrix.exportBpmn`** — canonical replacements for the `cervin.*` commands. The editor-title preview button now invokes `transitrix.openPreview`.

### Deprecated
- **`cervin` CLI is deprecated, use `transitrix`.** The `cervin` bin is kept as a compatibility alias (no removal in this release; slated for 2.0.0). Invoking the tool under the `cervin` name prints a one-line deprecation notice to stderr. First phase of the Cervin → Transitrix CLI rename (CLAUDE.md §Cervin naming, P1).
- **`cervin.*` extension settings are deprecated, use `transitrix.*`.** The legacy `cervin.fileExtensions` / `cervin.exportEnabled` keys are read as a fallback when their `transitrix.*` counterpart is unset (existing configs keep working) and are marked deprecated in the settings UI; removal is slated for 2.0.0. A one-time migration notice is shown on activation when a legacy key is in effect. Second phase of the Cervin → Transitrix rename (CLAUDE.md §Cervin naming, P2).
- **`cervin.*` extension commands are deprecated, use `transitrix.*`.** The four `cervin.*` commands are kept as aliases for one release so existing keybindings and macros survive; they are hidden from the Command Palette and labelled "(deprecated)", and invoking one logs a one-time deprecation notice before delegating to the canonical handler. Removal is slated for 2.0.0. Third phase of the Cervin → Transitrix rename (CLAUDE.md §Cervin naming, P3).

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
