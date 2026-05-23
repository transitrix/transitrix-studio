# Transitrix Studio — changelog

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
