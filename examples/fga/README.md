# FGA diagram

**Factor → Goal → Activity** — a three-column strategy view without the Changes column.
Use this format when you want a direct mapping from goals to activities without intermediate change items.

**File extension:** `*.fga.transitrix.yaml`

## Minimal structure

```yaml
notation: fga

factors:
  - id: FACTOR-1
    name: "Market growth"

goals:
  - id: GOAL-1
    name: "Expand market share"
    factors: [FACTOR-1]      # one or more factor IDs

activities:
  - id: ACTIVITY-1
    name: "Launch in two new regions"
    goals: [GOAL-1]          # which goal(s) this activity delivers
```

## Optional header fields

```yaml
title: "My FGA"
description: "Short description"
version: "0.1"
date: "2026-05-12"
author: "Your Name"
```

## Difference from FGCA

FGA omits the `changes` section entirely. Activities link directly to goals via `goals[]`.
Use FGCA (`.fgca.transitrix.yaml`) when you need to track discrete change packages between goals and activities.

## Rules

- IDs follow the canonical grammar `<TYPE>-[<middle>-]<INTEGER>` (`FACTOR-…`, `GOAL-…`, `ACTIVITY-…`) and are unique within their section.
- A goal can reference multiple factors via `factors: [FACTOR-…, …]`.
- An activity can target multiple goals via `goals: [GOAL-…, …]`.

## Examples in this folder

| File | Description |
|---|---|
| `strategy-2026.fga.transitrix.yaml` | FGA chain (3 factors, 3 goals, 6 activities) |
