# Transitrix Studio — changelog

## Unreleased

### Added

- **Unified text-in-block layout** (`entity-text-layout.ts`): shared wrapping, truncation, and vertical placement for Goals, DGCA/DGA, Nested Blocks, Activities, Process Blueprint, and Capability Map renderers.
- **Block size presets** (`compact` / `normal` / `wide`) via `transitrix.nodeSize.*` settings and the in-preview **Controls → Block size** row (Goals, DGCA/DGA, Activities). Smooth width/height sliders remain a documented follow-up idea.

## 2.2.0 — 2026-06-24

Custom BPMN renderer by default, DGCA/DGA notation rename, Blocks IDs, and BPMN preview layout polish from hand-testing.

### Added

- **BPMN preview — custom SVG renderer is the default.** `transitrix.bpmnRenderer` defaults to `"custom"` (built-in emitter with shared theme, zoom/pan). Set `"bpmn-io"` to revert to the legacy interactive viewer.
- **BPMN preview — `transitrix.bpmn.laneGap` setting.** Vertical spacing between swimlanes (0–200 px); toolbar **Spacing…** opens BPMN settings.
- **BPMN SVG renderer — default-flow marker, label wrap, lane clip.** Per BPMN 2.0, default outflows show a perpendicular slash; conditional flows are solid; below-element labels word-wrap; lane clip-path prevents label bleed into the header column.
- **Blocks preview — block IDs in the diagram.** Leaf blocks show name + ID; container blocks show `(ID)` in the header line.
- **Auto-open previews** for BPMN, compliance-impact, single law, and single product files on open (in addition to existing notations).
- **DGCA / DGA notation** (renamed from FGCA / FGA). New canonical file extensions `*.dgca.transitrix.yaml` and `*.dga.transitrix.yaml`; legacy `fgca` / `fga` keys still accepted with deprecation warnings through 1.x.
- **Driver terminology** in FGCA/DGCA column (factor → driver) — validator, types, and CSS class alignment.
- **BPMN preview — Save as PNG.** Export the rendered BPMN diagram to a `.png` file from the preview toolbar.
- **Entity IDs in diagram nodes.** FGCA/DGA, FGA/DGA, and Activities nodes show the entity ID below the name in grey.

### Fixed

- **BPMN preview title-bar action** uses `registerTextEditorCommand` so **Open Preview** works when focus is in the webview panel.
- **`.dgca.transitrix.yaml` routing** — goals/activities files open the correct preview by `notation:` header, not always the DGCA tree.
- **BPMN layout — compact pool/lane defaults** and **`laneContentLeftPad`** so start-event labels centre under the shape.
- **BPMN header captions** — wider pool band, end padding on rotated pool/lane titles, min lane height from caption length when the name is longer than the content row.
- **`transitrix.bpmn.laneGap` default is 0** (was 40 via settings override of layout).
- **CLI** — `dgca` / `dga` validator keys and help text.
- **BPMN cross-lane gateway flows — left-face entry** and same-lane routing kinks / `defaultFlow` XML attribute handling.
- **Activities diagram — unified node style** with Goal tree / DGCA / DGA previews.
- **Preview panel titles** — `[Type] Preview — filename` pattern; Process Blueprint PNG export layout restored.
- **BPMN DSL schema** — root `name` / `generated_at` (CONTRACT §1.1); lane/element `performed_by_role` and `supported_by_application`.
- **VSIX build** — `extension:prep` runs `build:diagrams` so packaged previews include fresh `@transitrix/diagrams` bundles.

### Changed

- **Tighter BPMN pool/lane geometry** — reduced outer padding and lane-name column; sequence-flow rendering no longer uses dashed condition styling.

## 2.1.1 — 2026-06-20

Activity Card layout polish, no-italic rule fully applied.

### Fixed

- **No-italic rule — complete.** Removed remaining `font-style: italic` from all previews and the JCEF webview bundle.
- **Activity Card — taller cells** for better readability: date fields, stakeholder slots, chain nodes, milestones each gained 6–12 px of vertical space.
- **Process-blueprint text alignment.** `dominant-baseline` converted to inline style across all `<text>` elements for reliable cross-renderer alignment.
- **`dominant-baseline:central` in CSS text classes.** Eliminating fragile per-element inline repetition and fixing Activity Card title baseline.

### Changed

- **GDPR remediation example.** Added explicit milestones for the DSR workflow, pre-audit clearance, and Art. 7 consent rework (Q3–Q4 2026).

## 2.1.0 — 2026-06-20

Activity Card motivation chain, stakeholder grid, live sliders, "Generated:" date label.

### Added

- **Activity Card — full motivation chain.** Resolves and displays the complete Driver → Assessment → Goal → Change chain from the canon element store. Empty sections show "— not on file". Section headers carry concise subtitles (e.g. *"What prompted this initiative?"*).
- **Activity Card — status and activity type badges** in the header (`planned`, `in_progress`, `programme`, `project`, …).
- **Activity Card — stakeholder role grid.** Initiator / Owner / Sponsor / PM slots resolved from `activity_stakeholder` relations; rendered in a 2-column grid so names are not truncated.
- **Preview live sliders.** Spacing and curvature sliders re-render the diagram immediately on drag, not only on release.
- **GDPR remediation example** in `organizations/acme_corp/` with full motivation chain and three workstream children.

### Changed

- **"Generated:" date label** on every diagram title block — distinguishes the render date from project date fields.
- **Activity Card badge text vertically centred** — fixes text floating above centre in "programme" / "in progress" badges.

## 1.6.0 — 2026-06-17

Column-width controls, product names in impact headers, coverage-metric spec fix.

### Added

- **Column width setting.** `transitrix.report.columnWidth` (Narrow / Normal / Wide) controls the data column width across all table-based reports. Compliance-impact and compliance-matrix offer a live dropdown in the toolbar; all other table reports pick the setting up at render time.
- **Product names in compliance-impact headers.** Each obligation × subject column now shows the product's display name with the product code below in gray.

### Changed

- **Skipped-notation diagnostic shows paths and notation values** (was a bare count).
- **Coverage-metric last column renamed to "Coverage Status"** (was "RAG") to avoid confusion with AI retrieval systems.

### Fixed

- **Coverage-metric parser now reads the canonical `view:` / `regimes` spec shape.** Files using the old `coverage_metric.scope.codex` shape still load (backward compat) and produce a deprecation warning.

## 1.5.3 — 2026-06-17

### Fixed

- **Compliance-impact preview now renders the matrix grid.** The obligation × subject table was computed but never inserted into the panel HTML — you saw the toolbar and filters but an empty body. Fixed.
- **Scan warns when files are silently skipped.** If the workspace contains YAML files with an `id` and `notation` field that the compliance scanner doesn't recognise, the preview summary now shows a ⚠ count instead of silently producing an empty view.

## 1.5.1 — 2026-06-16

Tidier preview strips: validation warnings now collapse, and the error strip folds in static previews too.

### Changed

- **Validation warnings now collapse.** The preview's non-fatal warning advisories (e.g. ACT-011 "no duration", ACT-019 "Gantt view will not render") are grouped into one collapsible strip with a count ("N warnings") and start **collapsed**, so they no longer crowd the diagram. Click the summary to expand. Folds with no scripting, like the error strip.

### Fixed

- **Error strip collapses in static previews.** The red "N errors" strip now folds when its summary is clicked in every notation preview; it previously stayed open in the `enableScripts: false` (static) previews because it relied on a native `<details>`.

## 1.5.0 — 2026-06-16

Sharper in-editor validation, a tidier error strip, and the Cervin → Transitrix settings/command rename.

### Added

- **Notation-aware inline validation.** Every diagram notation now surfaces in the preview the same errors the `transitrix validate` CLI reports — one validator per notation, shared between the editor and the command line, so the red strip shows exactly what an agent or CI run gets.
- **Per-element validators** for CHANGE / ACTOR / STAKEHOLDER / FACTOR / TARGET_STATE — clearer, element-specific messages when a canon element is malformed.
- **`.transitrixrc` project config** — canonical replacement for `.cervinrc`; `.cervinrc` is still read as a fallback through 1.x.

### Changed

- **The red error strip in previews is now collapsible** — fold it away once you've read it instead of having it sit on top of the diagram.
- **Settings renamed `cervin.*` → `transitrix.*`.** `transitrix.fileExtensions` and `transitrix.exportEnabled` are now the canonical keys. The legacy `cervin.fileExtensions` / `cervin.exportEnabled` keys are still read as a fallback when the new key is unset (so existing configs keep working), but are deprecated and will be removed in 2.0.0. A one-time migration notice is shown on activation when a legacy key is in effect.
- **Commands renamed `cervin.*` → `transitrix.*`.** `transitrix.openPreview`, `transitrix.exportSvg`, `transitrix.exportPng` and `transitrix.exportBpmn` are now the canonical commands (the editor-title preview button uses `transitrix.openPreview`). The legacy `cervin.*` commands remain as deprecated aliases for one release so existing keybindings and macros keep working — they're hidden from the Command Palette and invoking one shows a one-time deprecation notice. Removal in 2.0.0.

### Added

- **Activity Card now shows Project goal, Stakeholders and Description.** The card preview paints three full-width fields under the dates band: the project's **Description** (the card's own summary), **Project goal** (the names of the goals the project directly serves, via `activity_goal` relations), and **Stakeholders** (resolved from `activity_stakeholder` relations in the canon relation store). Project goal and Stakeholders are always shown — they render a "—" placeholder when nothing is linked.

### Docs

- **Cursor / VSCodium / Windsurf install path.** The README now lists the [Open VSX Registry](https://open-vsx.org/extension/transitrix/transitrix-studio) alongside the VS Code Marketplace — the same VSIX ships to both. No code change; the artefact is identical.

## 1.4.3 — 2026-06-13

Fixes the broken listing preview image on the Marketplace and Open VSX.

### Fixed

- **Listing preview image renders again** — it showed as a tiny broken-image icon in 1.4.2 because the packaged README pointed at a relative path the publisher rewrote into a 404. The README now uses an absolute image URL that packaging leaves intact.

## 1.4.1 — 2026-06-09

### Removed

- **Issues register notation retired.** The `*.issues.transitrix.yaml` notation (preview, commands, menus, example) is removed, following the methodology decision to model architectural problems and risks as `ASSESSMENT` and track team work as Work Items.

### Fixed

- **VSIX packaging** — a retired preview source no longer slips into the published artifact; a packaging-verification gate guards against it reappearing.

## 1.4.0 — 2026-06-05

Adds PDF export for the compliance views and fixes Process Blueprint cells clipping their text.

### Added

- **PDF export for compliance views** — `transitrix export-compliance --format pdf` renders the matrix / single-law / single-product / gap views as a self-contained A4-portrait branded PDF via WeasyPrint (`pipx install weasyprint`); a clear install hint is shown when the binary is missing.

### Fixed

- **Process Blueprint goal/result cells now wrap their text** instead of cutting it off at ~32 characters with an ellipsis. Each cell word-wraps to the column width and the goal/result rows grow to fit the tallest cell (capped at 6 lines), so long stage goals and results stay readable.

## 1.3.0 — 2026-06-02

Adds the Activity Card notation, the compliance suite (matrix / single-law / single-product / gap dashboard + Markdown export), and live in-preview controls for spacing, curvature and scope.

### Added

- **Activity Card notation** (`*.activity-card.transitrix.yaml`) — full preview with Save-as-SVG / PNG and Copy-as-PNG.
- **Compliance views** — Products × Requirements **matrix** (filter by jurisdiction / severity / status), **single-law** tree (Law → Requirements → Assertions), **single-product** view (Product → bound Requirements → status), and a **gap dashboard** (requirements without assertions, assertions without evidence, stale assertions past review date; CSV export).
- **`transitrix export-compliance` CLI** — exports the compliance matrix as Markdown (`--format md`, `--scope law:<id>|product:<id>`, `--output <path>`).
- **Live in-preview controls** — spacing, edge curvature and scope are adjustable from a toolbar inside the Goals, FGCA, FGA and Activities previews, plus matching `transitrix.spacing.*` / `transitrix.curvature.*` / `transitrix.scope.*` settings.
- **FGCA / FGA tree↔table toggle** — flatten the chain into a merged-cell table (`Factor | Goal | Change | Activity`; FGA: `Factor | Goal | Activity`), persisted per notation.

### Changed

- Every notation validator now guards each array element with an "entry must be an object" check, so malformed YAML (e.g. `goals: [null]`) degrades to a clear error panel instead of crashing the preview.
- `activationEvents` extended to cover all eleven notation suffixes, so previews and editor-title buttons activate from a cold VS Code window.

### Fixed

- Goals `level` is type-checked numerically; cyclic / self-parent goal trees no longer overflow the stack; FGCA changes with no `activity_ids` render cleanly; Activity dates are format-checked before comparison.

## 1.2.1 — 2026-05-28

Patch release. Refreshes the Marketplace description that was bundled into 1.2.0 stale (the rewrite landed after publish), and adds the N+1 hierarchy validator for Goals trees.

### Added

- **GOALS-012 / GOALS-013** validation in the internal Goals validator — keyed on the document's declared `goal_types[]`, mirrors the methodology canon (`notations/04-goals.md` §6). `GOALS-013` rejects gaps in `goal_types[].level` (must be contiguous from 0); `GOALS-012` rejects a parent–child level gap > 1 (the parent must be exactly one level above the child).

### Changed

- Marketplace description refreshed to a value-first pitch + preview image. Notation list cleaned up — the "legacy `.cervin.yaml` also supported" mention dropped from the BPMN line (the legacy suffix is still accepted internally, just no longer surfaced in the user-facing list).

## 1.2.0 — 2026-05-27

Adds PNG export across every vector preview and brings the FGCA / FGA / Goals notations onto the canonical flat shape from `transitrix/methodology`, fixing the blank-FGCA / edgeless-FGA rendering on canonical examples.

### Added

- **PNG export** — every vector preview toolbar now has **Save .png** (rasterized, 2× for crisp output) and **Copy PNG** (clipboard) alongside **Save .svg**. Rendering uses a native rasterizer (`@resvg/resvg-js`); Copy-as-PNG ships on Windows (macOS/Linux save-to-file works, clipboard is a planned follow-up). The extension is now published per-platform.
- **Canonical flat-form input** for FGCA / FGA / Goals — typed string IDs (`FACTOR-1`, `GOAL-RET-1`, …), plural cross-references (`goal.factors[]`, `change.goals[]`, `activity.changes[]` / `activity.goals[]`), and per-notation validation codes (FGCA-001…015, FGA-001…011, GOALS-001…011).
- Bare (unquoted) `YYYY-MM-DD` dates are accepted everywhere — they are coerced to ISO strings at the YAML parse boundary, so a date written without quotes no longer trips validation.

### Changed

- BPMN sources are recognised under `.bpmn.transitrix.yaml` (the legacy `.cervin.yaml` suffix still works).
- Bundled demo examples migrated to the canonical ID grammar from `IDS_AND_REFERENCES.md` and synced from the methodology canon.

### Fixed

- **FGCA preview no longer renders blank and FGA edges now draw** on the canonical flat-form examples — the flat cross-references are mapped to the internal edge fields the renderer consumes.
- Goal trees with non-contiguous `goal_types` levels (e.g. 0, 2, 4) render with even column spacing instead of wide gaps from phantom empty columns.

## 1.1.0 — 2026-05-26

Closes the 1.0.0 "Nested blocks needs Python + svgbob" known limitation with a native TS renderer, and adds the **Issues register** notation. The blocks notation moves to a structured-YAML schema with a new file extension — breaking for the small `.blocks.transitrix.txt` corpus that existed before 1.1.0.

### Breaking

- **`.blocks.transitrix.txt` is no longer recognised.** Nested blocks moved to `.blocks.transitrix.yaml` with a structured YAML schema (`nested_blocks:` root, recursive `block` tree carrying `id`, `name`, optional `children`).
  - **Migration:** rewrite the diagram in the new form. The spec is canonical at [transitrix/methodology — `08-blocks.md`](https://github.com/transitrix/methodology/blob/main/notations/08-blocks.md); the worked example ships at [`examples/blocks/architecture.blocks.transitrix.yaml`](./examples/blocks/architecture.blocks.transitrix.yaml).
- **Settings removed:** `transitrix.pythonPath` and `transitrix.svgbobPath`. They configured the now-deleted Python + svgbob backend and are no longer read.
- **`cervin serve` API:** the `/api/blocks/compile` endpoint is gone — the dev UI's "Nested blocks (Svgbob)" tab and its server route both depended on the Python backend.

### Added

- **Issues register** — `.issues.transitrix.yaml` — new vector notation: nested issue tree (parent → child via the `parent:` field) with colour-coded status badges (`open` / `in_progress` / `blocked` / `resolved` / `closed`). Validation codes `ISS-001 … 006`. Save-as-SVG works like every other vector preview.
- `npm run sync-examples` — developer tooling that mirrors `notations/examples/` from a local `transitrix/methodology` checkout into Studio's `examples/`. Dry-run by default; `--apply` copies added / changed files, `--apply --delete-stale` is strict mirror.

### Changed

- **Nested blocks** — structured YAML schema replaces the ASCII art form. Renders natively in TypeScript via `@transitrix/diagrams/blocks` — no external binaries. Validation codes `BL-001 … 009`.
- `extension/README.md` and root `README.md` refreshed for the post-1.0 notation set: Issues bullet added, Nested blocks bullet rewritten without svgbob, repo-layout diagram drops the deleted Python-backend folder, CLI port corrected from `3000` to `8765`, install command bumped to 1.1.0.
- Removed the duplicate `examples/bpmn/order-processing.bpmn.yaml` (byte-identical to `order-fulfillment.bpmn.yaml`; the methodology repo's `NOTATIONS_VALIDATION.md` §2.4 had flagged it).

### Removed

- `backends/blocks/` — Python + svgbob backend (`blocks_stdio.py`, `diagram_generator.py`, README, Makefile, tests, requirements.txt).
- `src/blocks-backend.ts` — Node-side wrapper around the Python backend.
- `tests/blocks-backend.test.ts` and the corresponding `handleBlocksCompile` test block in `tests/serve-ui.test.ts`.
- `.github/workflows/python-backend.yml` — the only Python CI job; nothing Python-dependent remains in the codebase.
- Pre-release review items closed by removal: TX-R001 `svgbobCommand` external-process surface; the `should-fix` missing-timeout on the `svgbob` subprocess; the dead `try/catch` nit in the old `blocks-preview.ts`; the CI-gap should-fix where the Python backend was untested.

## 1.0.0 — 2026-05-24

First marketplace release. The full Transitrix notation set previews in VS Code with a unified visual contract, in-SVG title blocks, a per-preview toolbar, and `.svg` export.

### Added

- **Process Blueprint** — `.process-blueprint.transitrix.yaml` — new vector notation: stage-by-stage process design with aspects (systems, actors, equipment, information entities).
- **Capability Map** — `.capability-map.transitrix.yaml` — new HTML-catalogue notation: vertical / horizontal capabilities with current vs target maturity, depth-indented trees, application links.
- **Process Map** — `.process-map.transitrix.yaml` — new HTML-catalogue notation: process landscape grouped by operating / supporting / management, per-process maturity and status.
- **Scenarios** — `.scenarios.transitrix.yaml` — new HTML-catalogue notation: scenario planning with factor view and cross-references across the model.
- **Activity Network — Gantt view** — `.activities.transitrix.yaml` now ships both the PSND network and a Gantt timeline, switchable in-preview. Critical path highlighted in both.
- **Save .svg** toolbar button on every vector preview — exports a self-contained `.svg` that opens cleanly in any browser (theme + notation CSS embedded).
- **Title toggle** — toolbar checkbox to show / hide the diagram caption inline.
- **Zoom control** — discrete `50 / 75 / 100 / 150 / 200 %` steps in the toolbar, native browser zoom layout.
- **In-SVG title block** on every vector preview — diagram heading, filename, and `v{version} · {date}` from the document's front-matter. Travels with the exported `.svg`.
- **Shared visual contract** (TX-R008) — typography tokens, maturity colours, catalogue badge / table CSS lifted into one place; every preview reads the same theme.

### Changed

- Activities preview's edge routing uses adaptive cubic Béziers — handles grow with both spans so the arrowhead always sits flush against a horizontal lead-in, and per-target L-elbows replace the trunk routing when every forward target has room (no more decorative back-steps).
- Network view edges sort critical-last in SVG order so the orange critical path always paints on top of crossing gray edges.
- Goals and FGA previews now consume the canonical FLAT schema (provisional for FGA; tracked for methodology-level reconciliation post-1.0.0).
- Preview shell is a full-height flex column — every preview's canvas fills the panel and scrolls as one region, no mid-panel scrollbars.
- `prepareSvgForExport` accepts a `notationCss` argument so notation-specific styles (`.act-node`, `.gantt-bar`, `.critical-edge`, …) travel with the saved `.svg`.
- Activity Save .svg asks which view (Network or Gantt) to export when both are populated; output filename suffixed `-network` / `-gantt`.

### Fixed

- Body always fills the iframe; the dark / white strip below short diagrams that previously read as a "two-page" split is gone (html bg pinned per theme, body min-height 100vh, then the full-height flex chain on top).
- Arrow tips on every vector notation sit exactly on the node's edge — marker `refX` matched to `markerWidth`; the previous overshoot inside the rectangle is gone.
- Network nodes draw before edges so the arrow tip is never clipped by the rectangle fill.
- Activity node labels are vertically centred in their rectangles.
- Process Blueprint stage / legend cells use the right typography class (`.text-header` / `.text-primary` / `.text-secondary` / `.text-pill`) instead of inline `font-*` attributes.
- Goals preview reads the canonical `goal_types[]` + `goals[]` schema — previously rejected valid examples with `MISSING_ROOT`.

### Removed

- Bottom `.diagram-caption` figcaption — every vector preview now carries its title block inside the SVG, the bottom caption was redundant.

### Known limitations

- **Copy as PNG / Save as PNG** — deferred to a later release. Vector previews export to `.svg` only; PNG export will live in the shared `@transitrix/diagrams` library so all Transitrix tools share one implementation.
- **Ctrl+wheel zoom** — declined for the 1.0.0 release (would require enabling scripts in the webview). The discrete zoom control covers the same need.
- **Nested blocks (`.blocks.transitrix.txt`)** — requires Python 3 + `svgbob_cli` on the user's machine. A native TypeScript renderer is on the roadmap.
