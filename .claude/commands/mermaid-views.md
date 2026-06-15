Derive Mermaid complementary views from Transitrix model files and write them to the canonical view location.

**Input:** `$ARGUMENTS` — path to a single model file or a directory to scan recursively for Transitrix model files. If omitted, scan the current directory.

---

## Context

This skill reads Transitrix model files (`.transitrix.yaml`), derives Mermaid diagrams from the structured data, and writes idempotent output files to `canon/views/<type>/`. It implements the business/technical-layer split from STRATEGIC_CONTEXT §13: native Transitrix notation covers the business layer; Mermaid covers the technical layer and cross-cutting projections derived from the same model data.

Re-running is safe: output is always regenerated from the current model state and must never be manually edited.

---

## Step 1 — discover model files

Find all YAML files under `$ARGUMENTS` whose top-level content includes `notation:`. For each file, read the `notation:` field value.

Build a work list using this table:

| `notation:` value | Mermaid views to derive |
|---|---|
| `goals` | quadrant |
| `capability-map` | quadrant |
| `applications` | sequence, c4-component |
| `bpmn` | state |

Skip any file whose `notation:` value is not in this table. Do NOT derive views from `process-map`, `gantt`, `fgca`, `fga`, `blocks`, `scenarios`, `compliance-impact`, `coverage-metric`, or any other notation not listed.

---

## Step 2 — derive each view

Apply the rules below for each source file. Apply the House style section to every diagram.

### `notation: goals` → quadrant

Map goals to a quadrant chart by strategic scope (x-axis) and impact level (y-axis).

**Axes:**
- X: "Enabling" (left, 0) → "Enterprise-wide" (right, 1) — lower `level` number means higher x
- Y: "Operational" (bottom, 0) → "Transformational" (top, 1) — lower `level` number means higher y

**Coordinate assignment by `level`:**
- Level 0 (root strategy, typically one goal): x=0.85, y=0.88
- Level 1 (strategic goals, N items): distribute x in [0.55, 0.75], y in [0.60, 0.75], spaced evenly by document order
- Level 2 (enabling goals, N items): distribute x in [0.25, 0.45], y in [0.35, 0.55], spaced evenly by document order

If `goal_types` defines other level numbers, interpolate proportionally between the three bands above.

**Quadrant labels:** Q1 (top-right) `Strategic bets` · Q2 (top-left) `Foundation` · Q3 (bottom-left) `Enablers` · Q4 (bottom-right) `Operational drivers`

**Diagram title:** value of `name:` from the goals document root. **Output slug:** source filename with `.goals.transitrix.yaml` stripped.

---

### `notation: capability-map` → quadrant

Map capabilities by current vs target maturity (CMMI 1–5). **Axes:** X = current_maturity, Y = target_maturity.

**CMMI to coordinate mapping:** 1→0.10 · 2→0.30 · 3→0.50 · 4→0.70 · 5→0.90

Include all capabilities recursively (including `children[]`). Skip items missing `current_maturity` or `target_maturity`. Apply ±0.03 jitter if two capabilities share coordinates.

**Quadrant labels:** Q1 (top-right) `Maintain` · Q2 (top-left) `Priority gap` · Q3 (bottom-left) `Deprioritise` · Q4 (bottom-right) `Harvest`

**Diagram title:** `title:` from the document (fall back to `name:`). **Output slug:** source filename with `.capability-map.transitrix.yaml` stripped.

---

### `notation: applications` → sequence

Map integration topology to a sequence diagram.

**Participants:** all entries in `applications_catalogue.applications[]` with `status: Active` (skip `Deprecated`, `Decommissioning`, `Draft`). Use `app_id` as Mermaid participant identifier (replace hyphens with underscores) and `name` as display alias.

**Messages:** one per integration entry:
- Arrow `->>` for synchronous (`REST`, `HTTP`, `gRPC`)
- Arrow `-->>` for async (`Kafka`, `event-bus`, or containing "event", "queue", "stream", "kafka")
- Label: `<protocol> — <description>`

**Diagram title:** `applications_catalogue.name:`. **Output slug:** source filename with `.applications.transitrix.yaml` stripped.

---

### `notation: applications` → c4-component

Map Active applications to a C4 Component diagram. One `Container()` per Active entry with args `(id, name, type+vendor, description)`. One `Rel()` per integration. Skip if fewer than 2 Active entries or no integrations.

**Output slug:** same source basename as sequence, type `c4-component`.

---

### `notation: bpmn` → state

Map the BPMN process flow to a state machine diagram.

**State mapping:**
- `startEvent` → initial transition from `[*]`, labelled with the event `name`
- `task`, `userTask`, `serviceTask`, `manualTask` → state node labelled with element `name`
- `exclusiveGateway`, `parallelGateway`, `inclusiveGateway` → named state with gateway `name`; use `<<choice>>` for exclusive, `<<fork>>`/`<<join>>` for parallel
- `endEvent` → terminal transition to `[*]`, labelled with the event `name`

**Transitions:** each `flows[]` entry → one state transition; include `condition` as label when present.
Use `state "..." as Alias` declarations for readability; derive alias from element `id`.

**Diagram title:** `process.name:`. **Output slug:** source filename with `.bpmn.transitrix.yaml` stripped.

---

## Hard rules

- **Never** generate a Mermaid flowchart (`graph`, `flowchart`) from any source — duplicates BPMN native rendering.
- **Never** generate a Mermaid tree or graph from `notation: goals` — duplicates the Goals tree native notation. Only quadrant is valid.
- **Never** generate any Mermaid view from `notation: process-map` — native notation coverage.
- **Never** generate Mermaid Gantt — native notation coverage.
- If model data is absent or insufficient for a view type, skip silently — do not fabricate coordinates, participants, or states.

---

## House style

Prepend this init block to every Mermaid diagram (on the line before the diagram type keyword):

```
%%{init: {"theme": "base", "themeVariables": {
  "primaryColor": "#004d67",
  "primaryTextColor": "#ffffff",
  "primaryBorderColor": "#003850",
  "lineColor": "#ffaf00",
  "secondaryColor": "#fff4e0",
  "tertiaryColor": "#f5f5f5",
  "background": "#ffffff",
  "fontFamily": "ui-sans-serif, system-ui, sans-serif"
}}}%%
```

---

## Output location

Locate the adopter repo root by walking up from the source file until finding a `transitrix.yaml` manifest or a `canon/` directory. Output root is `<repo-root>/canon/views/`.

Write each view to: `canon/views/<mermaid-type>/<slug>.<mermaid-type>.md`

Examples: `canon/views/quadrant/eu-strategy-goals.quadrant.md` · `canon/views/sequence/eu-portfolio-integrations.sequence.md` · `canon/views/state/data-subject-erasure.state.md`

**Idempotency:** if the output file already exists, overwrite it completely. Never merge or append.

---

## Output file format

Each generated file uses this template (replace placeholder text in angle brackets):

```
---
source: <path to source model file, relative to repo root>
notation: <source notation value>
view_type: <mermaid diagram type>
generated: <YYYY-MM-DD>
idempotent: true
---

# <Title> — <View Type>

> <one sentence describing what this view shows and why it is useful>

[mermaid code block with init block and diagram content]

_Source: [<source filename>](<relative path>)_
```

---

## Step 3 — summary report

After all writes, print a compact report:

```
mermaid-views: <N> model files read, <M> views written

  OK  <source>  ->  <output>  [<type>]
  --  <source>  skipped: <reason>
```
