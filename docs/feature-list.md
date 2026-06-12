---
title: "Transitrix Feature List"
doc_type: living-design-doc
established_by: "Valerii Korobeinikov"
last_updated: "2026-06-10"
scope: "transitrix-methodology, transitrix-studio"
---

# Transitrix Feature List

Covers **Transitrix Methodology** (notation specs + CLI skills) and **Transitrix Studio** (VS Code extension + CLI + shared library). Current as of Studio v1.4.1 / Methodology HEAD.

---

## Transitrix Methodology

### Notation library — 15 view notations

| Notation | Purpose | Status |
|---|---|---|
| **BPMN** | BPMN 2.0 process flow — lanes, gateways, sequence flows | documented |
| **FGCA** | Full strategy-to-execution chain: Factor → Goal → Change → Activity | documented |
| **FGA** | Simplified chain: Factor → Goal → Activity (no Changes layer) | draft |
| **Goals** | Strategic goal hierarchy as a tree | documented |
| **Capability Map** | Capability hierarchy with CMMI V2.0 maturity and addressing | documented |
| **Process Map** | Top-level catalogue of processes (Operating / Supporting / Management) | draft |
| **Activities** | Project Schedule Network Diagram in Activity-on-Node (AoN) form | documented |
| **Blocks** | Multi-level container layout — recursive nested-boxes architecture overview | documented |
| **Products** | Inventory of products and services (catalogue view) | draft |
| **Applications** | Inventory of applications and integrations (catalogue view) | draft |
| **Scenarios** | Report-config view over `SCENARIO` elements | draft |
| **Process Blueprint** | Wide value-chain blueprint — stages, goals, results, systems, actors, equipment; **opt-in compliance lane** (derived obligation projection per stage with new/gap/deadline decorations; `lane_config.compliance: true`) | draft |
| **Activity Card** | Single-project narrative view — FGCA chain, dates, milestones, gate decisions | documented |
| **Compliance Impact** | Report-config view deriving the obligation × subject matrix from Assertions + process flow | draft |
| **Coverage Metric** | Report-config view measuring coverage of canon per jurisdiction | draft |

### Element notations — 8 standalone primitives

| Notation | Purpose | Status |
|---|---|---|
| **Codex** | External laws / regulations and internal policies / standards | documented |
| **Requirement** | Positive obligation derived from a codex source | documented |
| **Assertion** | Links a Requirement to a subject (Product / Process / Capability) | documented |
| **Relation** | First-class, time-aware relation between two canonical primitives | documented |
| **Actor** | Active-structure identity: person / business\_unit / system | draft |
| **Stakeholder** | Motivation-layer interest primitive with stake profile | draft |
| **Amendment** | Field-zone detection record that a watched codex source has been amended | draft |
| **Segment** | Field-zone extracted chunk of a codex source (article / clause / paragraph) | draft |

### Schema foundations

- **Flat top-level arrays with reference-based hierarchy** — universal form rule across all four strategy-chain notations (FGCA, FGA, Goals, Activities). Hierarchy expressed via `parent` / cross-layer ID references inside flat arrays; no nested wrapper keys.
- **Element aliases** — `aliases:` field on every element primitive (Option A, ADR 2026-06-06). Enables name-variant matching without duplicating elements.
- **Coverage Profiles** — adopter-level vocabulary scoping in `transitrix.yaml`. Three shipped presets: `minimal`, `core`, `full`. Custom profiles extend a preset by adding or removing TYPEs.
- **Data Quality model** — `confidence:` and `freshness:` fields on canon primitives per CONTRACT §11. Scored DQ-1..DQ-5 in Studio previews.
- **Deterministic TYPE → placement resolver** — automatic `canon/elements/<layer>/` placement from TYPE alone (ELEMENT_PRIMITIVES §4).
- **ID grammar enforcement** — ID-grammar violations surfaced at emit time (IDS §1).
- **ISSUE type retired** — architectural problems modelled as ASSESSMENT (ArchiMate-aligned); team tracking uses Work Items.
- **BUSINESS\_OBJECT replaces INFORMATION\_ENTITY** — ArchiMate-aligned rename.
- **EQUIPMENT** — first-class catalogued element in layer 04\_technology.

### Ingest CLI (`transitrix ingest`)

| Feature | Description |
|---|---|
| **Two-route ingestion** | Field route (raw docs → SEGMENT/AMENDMENT) and codex route (structured codex sources) |
| **Duplicate-source detection** | Detects re-admitted sources by `source_hash` (F1) |
| **Repo-check doctor** | Data-free health check before ingestion; `transitrix:repo-check` skill (F2) |
| **Suggest-profile discovery** | Auto-suggests a coverage profile from the repo's existing content (F3) |
| **Markitdown fallback** | Tries `python -m markitdown` when the primary binary is absent (F6) |
| **Cross-source entity resolution** | Name / alias matching across sources (F8) |
| **Codex source artefact resolution** | Review-queue resolves codex source artefacts (F13) |
| **ID-grammar enforcement at emit** | Violations surfaced before writing any files (F14) |
| **Idempotent review-queue** | Running review-queue twice does not re-admit already-admitted candidates |
| **Coverage profile resolution** | Resolves custom / short-form profiles without silent full-fallback |

### Regulatory Intelligence CLI (`transitrix reg-intel`)

| Feature | Description |
|---|---|
| **Scheduler core** | `list-due` + `update-scan` — lists sources due for re-check and updates last-scanned timestamps |
| **Change-signal gate** | `check-signal` — lightweight pre-flight before a full snapshot fetch |
| **Snapshot fetch** | `fetch-snapshot` — downloads and stores a versioned snapshot with content-aware cosmetic-diff |
| **Review digest** | Structured digest output + JSON schema |
| **SEGMENT shaper** | `segment` command — splits a document into clause-level SEGMENT primitives |
| **CLASSIFY shaper** | `classify` command — classifies segments by relevance and obligation type |
| **Contract validator** | `validate` command — checks an amendment record against the contract schema |
| **AMENDMENT emitter** | `amendment` command — emits a structured AMENDMENT primitive from a validated record |
| **Operational templates** | Daily scheduler, fetch recipes, snapshots README |

---

## Transitrix Studio

### VS Code extension

#### Preview engine

| Feature | Description |
|---|---|
| **Goals tree preview** | `*.goals.transitrix.yaml` — tree layout with zoom, save-as-SVG/PNG, copy-as-PNG |
| **FGCA preview** | Full four-layer strategy chain with tree↔table view toggle |
| **FGA preview** | Three-layer strategy chain with tree↔table view toggle |
| **Activities preview** | AoN network diagram with dates, durations |
| **Blocks preview** | Recursive nested-box layout |
| **Capability Map preview** | CMMI maturity colouring, addressing, vertical/horizontal orientation |
| **Process Map preview** | Three-group catalogue |
| **Scenarios preview** | Report-config view |
| **Process Blueprint preview** | Wide stage layout with text-wrapping goal/result cells; opt-in compliance lane with new/gap/deadline chip decorations (ADR 0002) |
| **Activity Card preview** | Single-project narrative: FGCA chain, dates, milestones, gate decisions |
| **Products / Applications previews** | Catalogue views |
| **Compliance matrix preview** | Products × Requirements grid with jurisdiction / severity / status toolbar filters |
| **Single-law compliance preview** | Law → Requirements → Assertions tree (from any Codex file) |
| **Single-product compliance preview** | Product → bound Requirements → status |
| **Compliance gap dashboard** | Requirements without Assertions, stale Assertions; CSV export |

#### Live preview controls (interactive webviews)

| Feature | Description |
|---|---|
| **Spacing controls** | `transitrix.spacing.<notation>.{horizontalGap,verticalGap}` — adjustable in-preview |
| **Edge curvature controls** | `transitrix.curvature.<notation>` — adjustable in-preview (0 = straight) |
| **Scope filters** | `transitrix.scope.<notation>.{rootId,maxLevel}` — scope to a subtree or level cap |
| **Tree ↔ table toggle** | FGCA and FGA flatten into a merged-cell table; persisted per notation |
| **Nonce-CSP webviews** | All interactive previews run under strict nonce-based Content Security Policy |

#### Export

| Feature | Description |
|---|---|
| **Save as SVG** | Goals, FGCA, FGA, Activities, Blocks, Process Blueprint, Activity Card |
| **Save as PNG / Copy as PNG** | All notation previews |
| **`transitrix export-compliance --format md`** | Compliance matrix as Markdown (`--scope law:<id>|product:<id>`) |
| **`transitrix export-compliance --format pdf`** | A4-portrait branded PDF via WeasyPrint; clean `ETIMEDOUT` error if binary absent |

#### Editor integration

| Feature | Description |
|---|---|
| **Cold-start activation** | All 11 notation file suffixes in `activationEvents`; previews open from a cold VS Code |
| **Editor-title commands** | Quick-access preview buttons in editor title bar |
| **Language support** | Syntax highlighting and schema validation for all notation files |

### IntelliJ IDEA extension (MVP, v1.3.0+)

| Feature | Description |
|---|---|
| **Phase 1 — Gradle scaffold** | Build wiring, plugin descriptor, packaging script |
| **Phase 2 — browser-safe webview bundle** | JCEF-compatible bundle from `@transitrix/diagrams` |
| **Phase 3 — JCEF preview, Goals end-to-end** | Goals notation rendered in JCEF webview panel |
| **Phase 4 — remaining 11 notations** | All notation renderers wired into the JCEF bundle |
| **Phase 5 — packaging + install docs** | Packaging script and installation documentation |

### `@transitrix/diagrams` shared library

| Module | Description |
|---|---|
| **Goals** | Types, validator, layout, renderer |
| **FGCA / FGA** | Types, flat-canon parser, validator, layout, renderer |
| **Activities** | Types, cross-doc resolver, validator, layout, renderer (AoN) |
| **Capability Map** | Types, validator, layout, renderer |
| **Blocks** | Types, validator, layout, renderer |
| **Process Blueprint** | Types, validator, layout, renderer (text-wrapping cells); compliance lane derivation + chip renderer with three stacking decorations |
| **Activity Card** | Types, cross-doc resolver, validator, layout, renderer |
| **Compliance** | Requirement + Assertion schemas/validators (REQ-001..003, ASSERT-001..008); compliance HTML renderer (`renderComplianceHtml`); matrix, single-law, single-product, gap-dashboard views |
| **Data Quality (DQ-1)** | Confidence-scoring module per CONTRACT §11; DQ-2 composite confidence in compliance previews |
| **Geometry module** | Shared `LayoutBounds` export; deduplicated across diagram modules |
| **Null-guard validators** | All array-based validators guard against `null` / non-object entries before field access |

### CLI (`transitrix`)

| Command | Description |
|---|---|
| **`transitrix compile`** | Compiles notation YAML to SVG / layout JSON |
| **`transitrix serve`** | Serves the web UI for browser-based preview |
| **`transitrix export-compliance`** | Exports compliance views as Markdown or PDF |
| **`transitrix ingest`** | Ingests field documents into the methodology zone |
| **`transitrix reg-intel`** | Regulatory intelligence commands (scheduler, fetch, classify, emit) |

### Security posture

- `serve-ui.ts` path containment — drive-aware prefix check rejects paths on different Windows drives
- `serve-ui.ts` stream error handling — `createReadStream` error handler destroys the socket cleanly
- Interactive previews — nonce-CSP; static previews `enableScripts: false`; user content escaped
- `export-compliance` — argv-list `spawnSync`, no shell; bounded timeout with `ETIMEDOUT` surface
- Blocks backend — `svgbobCommand` allowlist rejects shell metacharacters (TX-R001)

---

## Planned / In Progress

| Item | Scope | Status |
|---|---|---|
| **Cervin → Transitrix deprecation** (P1–P7) | Studio CLI, extension settings/commands, project config, API aliases | Planned across 1.x minor releases; breaking removal in 2.0.0 |
| **TX-021 — Activity multi-value fields** | DSM backend trilogy complete (predecessors, goals, tags); frontend multi-value UIs pending | PRs #14 (goals modal), #15 (tags modal), #16 (swagger regen) open |
| **Ingest skill (strategy#145)** | Methodology | Skill design complete; real-data ingestion scheduled |
| **Report skill** | Methodology | ADR accepted: CLI-first thin skill; rides IG-7 |
| **Coverage Profiles enforcement** | Studio + Methodology | Spec v0.1 done; tool enforcement pending |
| **Actor / Stakeholder notations** | Methodology | Draft specs; implementation deferred |
