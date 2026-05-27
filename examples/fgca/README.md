# FGCA diagram

**Factor → Goal → Change → Activity** — a four-column strategy decomposition chain.
Shows how external factors drive goals, which require changes, which are delivered through activities.

**File extension:** `*.fgca.transitrix.yaml`

## Minimal structure

```yaml
notation: fgca
spec_version: "0.1"

factors:
  - id: FACTOR-1
    name: "External factor driving change"

goals:
  - id: GOAL-1
    name: "Strategic goal"
    factors: [FACTOR-1]      # one or more factor IDs

changes:
  - id: CHANGE-1
    name: "Transformation programme"
    goals: [GOAL-1]          # which goal(s) this change addresses

activities:
  - id: ACTIVITY-1
    name: "Research phase"
    changes: [CHANGE-1]      # which change(s) this activity delivers
  - id: ACTIVITY-2
    name: "Rollout phase"
    changes: [CHANGE-1]
```

## Optional header fields

```yaml
title: "My FGCA Chain"
description: "Short description"
version: "0.1"
date: "2026-05-12"
author: "Your Name"
```

## Rules

- IDs (`factors`, `goals`, `changes`, `activities`) follow the canonical grammar `<TYPE>-[<middle>-]<INTEGER>` (`FACTOR-…`, `GOAL-…`, `CHANGE-…`, `ACTIVITY-…`) and are unique within their section.
- Cross-layer references are **upstream** plurals on each layer: `goal.factors[]`, `change.goals[]`, `activity.changes[]`.
- A goal can reference multiple factors via `factors: [FACTOR-…, …]`.
- A change can address multiple goals via `goals: [GOAL-…, …]`.
- An activity can deliver multiple changes via `changes: [CHANGE-…, …]`.

## Examples in this folder

| File | Description |
|---|---|
| `strategy-2026.fgca.transitrix.yaml` | Full FGCA chain (2 factors, 3 goals, 3 changes, 5 activities) |
