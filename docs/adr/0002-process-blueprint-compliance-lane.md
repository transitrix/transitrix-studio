---
adr: "0002"
status: Accepted
date: 2026-06-10
scope: transitrix-studio
methodology_adr: docs/decisions/2026-06-09-compliance-impact-as-blueprint-lane.md
tags: [process-blueprint, compliance-lane, layout, renderer, extension, per-user-settings]
---

# ADR 0002 — Process Blueprint compliance lane (Studio implementation)

## Context

The methodology ADR `docs/decisions/2026-06-09-compliance-impact-as-blueprint-lane.md`
(accepted 2026-06-09) specifies a **derived, opt-in compliance lane** for the Process
Blueprint notation. This ADR records the implementation decisions made in Transitrix
Studio for strategy hub task #177.

The methodology ADR settles _what_ the lane is and _what_ its decorations mean.
This document records _how_ it is implemented in the `@transitrix/diagrams` library and
the VS Code extension.

## Decisions

### 1. Compliance lane is a layout-level feature, not a schema change

The lane is computed inside `layoutProcessBlueprint` via a new `deriveComplianceRow()`
helper that accepts `ComplianceLaneInput` (assertions + requirements projection) as an
extra `options` parameter. No new field is written to the blueprint document canon —
consistent with the methodology ADR's "derived, not stored" principle.

### 2. Three new option fields on `ProcessBlueprintLayoutOptions`

- `complianceLane?: ComplianceLaneConfig` — toggles the lane, carries the jurisdiction
  filter, the previous-snapshot map (for "new" decoration), and the reference date.
- `complianceInput?: ComplianceLaneInput` — the minimal projection of assertions,
  requirements, and codex jurisdiction map needed by the derivation function.

### 3. Decoration signals map 1-to-1 to the methodology ADR §3

| Signal    | Source                                                  | Visual in SVG          |
|-----------|--------------------------------------------------------|------------------------|
| `new`     | Law ID absent from `previousSnapshot[stageId]`         | `stroke-dasharray="4 2"` on chip rect |
| `gap`     | Any bound assertion has status `non_compliant`/`partial`| Warning fill (`--ts-status-warning-bg/fg`) |
| `deadline`| Gap present **and** `REQUIREMENT.deadline` → `past_due`/`in_force`/`upcoming` | Error fill + `!` badge circle |

Decorations are orthogonal and stack; a chip may carry all three simultaneously.

### 4. Jurisdiction filter is applied at derivation time

When `ComplianceLaneConfig.jurisdictions` is non-empty, the derivation function
discards any law chip whose codex jurisdiction (from `ComplianceLaneInput.codexJurisdictions`)
is not in the filter list. If jurisdiction data is absent, no filtering is applied.

### 5. `lane_config.compliance: true` in the YAML document activates the lane

The spec field `lane_config:` is parsed by the extension's `resolveLaneConfig()` helper.
The lane defaults to **disabled** per the methodology ADR; authors must opt in per document.

### 6. Per-user display preferences folder

A `.transitrix/display-preferences/` folder is tracked via `.gitkeep` but its contents
are `.gitignore`d. This implements the methodology ADR §6 contract: per-user lane
toggles and decoration preferences stay local, are never committed, and the folder
appears empty to every other user. The folder path is documented in `CONTRIBUTING.md`.

### 7. Compliance data is scanned at preview time, not embedded in the blueprint

The VS Code preview calls the existing `scanComplianceCanon()` workspace scanner when
`lane_config.compliance: true`. Scan failures are non-fatal — the blueprint renders
without the compliance lane rather than surfacing an error.

## Consequences

- `ProcessBlueprintLayout` gains an optional `complianceRow?: ComplianceRow` field;
  renderers that don't need the compliance lane can safely ignore it.
- The `LegendCell.kind` union is extended with `'compliance'`.
- CSS theme gains `.compliance-gap`, `.compliance-deadline`, `.compliance-badge`,
  `.compliance-badge-text` classes for both light and dark themes.
- The extension `process-blueprint-preview.ts` `buildHtml` method is now `async`
  (async scan behind an opt-in guard; no performance impact when lane is disabled).
- 26 new unit tests in `packages/diagrams/src/process-blueprint/__tests__/compliance-lane.test.ts`
  cover decoration logic, jurisdiction filtering, null-guards, legend, and geometry.

## Out of scope (backlog)

- Drill-down to verbatim source segments (noted in methodology ADR).
- DSM viewer compliance lane (separate task when DSM viewer migrates to `@transitrix/diagrams`).
- Named report lane pinning in the versioned view-config (requires report-skill integration).
