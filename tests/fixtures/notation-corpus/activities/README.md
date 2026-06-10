# Activities — network diagram (PSND/AoN) and Gantt view

A Transitrix Activities document describes a project schedule as a DAG of activities. The same document renders as **two coexisting views**:

- **Network view (PSND / Activity-on-Node)** — always rendered. Shows activities, durations, dependencies, and the computed critical path (PMBoK forward/backward pass).
- **Gantt view** — rendered when the document supplies either a `project.start_date` (computed from CPM) or per-activity `start_date` + `end_date` (pinned). Otherwise the Gantt section shows a non-blocking notice and only the network view is drawn.

**File extension:** `*.activities.transitrix.yaml`

## Minimal structure

```yaml
notation: activities
spec_version: "0.1"

activities:
  - id: ACTIVITY-A-1
    name: "Requirements analysis"
    duration: 5                # duration in any consistent unit (days, weeks, sprints)

  - id: ACTIVITY-A-2
    name: "Architecture design"
    duration: 8
    predecessors: [ACTIVITY-A-1]   # IDs of activities that must finish before this one starts

  - id: ACTIVITY-A-3
    name: "Implementation"
    duration: 15
    predecessors: [ACTIVITY-A-2]
```

## Optional header fields

```yaml
title: "My Project"
description: "Short description"
version: "0.1"
date: "2026-05-12"
author: "Your Name"
```

## Project block — enables the Gantt view

Adding a top-level `project:` block anchors the schedule on a calendar so the Gantt view also renders:

```yaml
project:
  start_date: "2026-06-01"
  calendar:
    working_days: [mon, tue, wed, thu, fri]
    holidays:
      - "2026-07-04"
```

Without the `project:` block, the Gantt section in the preview shows a non-blocking notice ("Gantt view will not render: …") and only the network view is drawn — see [`discovery-research.activities.transitrix.yaml`](discovery-research.activities.transitrix.yaml) for that case.

A document can alternatively pin per-activity dates (`start_date` + `end_date` on every leaf) for a fixed-date Gantt without CPM projection.

## Optional fields per activity

| Field | Type | Description |
|---|---|---|
| `sort` | integer | Display order hint |
| `description` | string | Free-text note |
| `goals` | string[] | Goal IDs this activity contributes to |
| `tags` | string[] | Labels for grouping or highlighting |
| `unit` | string | Organisational unit responsible |
| `delivers_changes` | string[] | Change IDs delivered by this activity |
| `start_date` | YYYY-MM-DD | Pinned start (enables the pinned-Gantt mode when all leaves carry it) |
| `end_date` | YYYY-MM-DD | Pinned end (must be ≥ start_date) |
| `parent` | string | WBS parent activity id — renders as a summary bar on the Gantt |

## Special activity kinds

- **Milestone** — a leaf activity with `duration: 0`. Renders as a diamond on the Gantt and a distinct shape on the network. Both pinned dates, if present, must be equal (ACT-016).
- **Phase** — an activity referenced by another activity's `parent` field. Phases roll up: earliest descendant start → latest descendant end. Phases SHOULD omit their own duration and dates (ACT-017).

## Rules

- Activity IDs must be unique strings within the file. The canonical grammar is `ACTIVITY-[<middle>-]<INTEGER>` (e.g. `ACTIVITY-A-1`, `ACTIVITY-M-DECISION-1`); other shapes parse but are non-canonical.
- Activities without `predecessors` are treated as start nodes.
- Multiple predecessors create a merge point (all must finish before the activity starts).
- The critical path is computed automatically using the PMBoK forward/backward pass (ES, EF, LS, LF, float).
- Duration unit is not enforced — use the same unit consistently throughout the file. Default-day semantics on the Gantt advance one day per working day per the project calendar.

## Examples in this folder

| File | Renders as | Description |
|---|---|---|
| [`platform-launch.activities.transitrix.yaml`](platform-launch.activities.transitrix.yaml) | **Network + Gantt** (computed mode) | 10-activity platform launch with a `project:` block — Mon–Fri working calendar, one holiday. The Gantt section shows CPM offsets projected onto the calendar, with the critical-path tail highlighted. |
| [`discovery-research.activities.transitrix.yaml`](discovery-research.activities.transitrix.yaml) | **Network only** (Gantt unavailable) | Early discovery work, no committed dates. Demonstrates the graceful network-only fallback — the Gantt section shows a notice explaining what is missing, the network still renders with the critical path. Includes a go/no-go milestone (`duration: 0`). |
