# Transitrix SVG notations (demo)

Self-contained YAML for Action, Action Card, Blocks, and Process Blueprint. Open in **Reading view**.

## Action (network)

```transitrix-action
notation: action
spec_version: "0.1"
title: Demo backlog
actions:
  - { id: ACTIVITY-D-1, name: Interview stakeholders, duration: 5, sort: 10 }
  - { id: ACTIVITY-D-2, name: Desk research, duration: 2, sort: 15, predecessors: [ACTIVITY-D-1] }
  - { id: ACTIVITY-D-3, name: Deep dive, duration: 8, sort: 16, predecessors: [ACTIVITY-D-1] }
  - { id: ACTIVITY-D-4, name: Synthesise findings, duration: 3, sort: 20, predecessors: [ACTIVITY-D-2, ACTIVITY-D-3] }
```

## Action Card (shell + milestones; no vault/canon)

```transitrix-action-card
notation: action-card
spec_version: "0.1"
action_card:
  id: ACTION_CARD-DEMO-1
  project: ACTION-DEMO-1
  description: Demo card without canon resolution.
  milestones:
    - { id: MILESTONE-DEMO-1, name: Kick-off complete, date: "2026-06-01" }
    - { id: MILESTONE-DEMO-2, name: First delivery, date: "2026-07-15" }
```

## Nested Blocks

```transitrix-blocks
notation: blocks
spec_version: "0.1"
nested_blocks:
  id: BLOCKS-DEMO-1
  name: Demo architecture
  blocks:
    - id: APP
      name: Application
      children:
        - { id: UI, name: UI }
        - { id: API, name: API }
```

## Blocks grid (RACI)

```transitrix-blocks
notation: blocks
spec_version: "0.1"
name: Demo RACI
grid:
  columns:
    - { id: PM, name: "PM" }
    - { id: ENG, name: "Eng" }
  rows:
    - id: BUILD
      name: Build
      assign:
        PM: "A"
        ENG: "R"
```

## Process Blueprint

```transitrix-process-blueprint
notation: process-blueprint
spec_version: "0.1"
process_blueprint:
  id: PROCESS_BLUEPRINT-DEMO-1
  name: Demo fulfilment
  process: PROCESS-DEMO-1
  stages:
    - { id: STAGE-1, name: Receive, goal: Capture order, result: Order recorded }
    - { id: STAGE-2, name: Ship, goal: Dispatch, result: In transit }
```

## Invalid Action (must fail locally)

```transitrix-action
notation: action
title: Broken
actions:
  - { id: not-valid, name: Bad id }
```
