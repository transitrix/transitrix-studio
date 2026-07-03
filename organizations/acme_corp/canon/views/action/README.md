# `canon/views/action/`

Project schedule as an **Action-on-Node** precedence network (PSND), with an optional Gantt timeline projection. Actions reference Action, Goal, and Change elements.

## File convention

`*.dgca.transitrix.yaml`

See [`notations/views/07-action.md`](../../../../../notations/views/07-action.md) for the full spec — including PSND semantics, the critical-path computation, and the Gantt projection contract.

## Skeleton

```yaml
notation: action
spec_version: "0.1"

actions:
  - id: ACTION-DISCOVERY-1
    name: "Discovery & research"
    duration_days: 10
    start_date: "2026-06-01"       # work-timeline field — when the action is planned to start
    predecessors: []
    goals: [GOAL-CUST-1]
    valid_from: "2026-05-26"       # element-lifecycle field (CONTRACT.md §7) — when this action entry is admitted as a planning artefact; distinct from start_date
    valid_to: null

  - id: ACTION-DESIGN-1
    name: "Solution design"
    duration_days: 14
    predecessors: [ACTION-DISCOVERY-1]
    goals: [GOAL-CUST-1]
    valid_from: "2026-05-26"
    valid_to: null

  - id: ACTION-BUILD-1
    name: "Build & test"
    duration_days: 30
    predecessors: [ACTION-DESIGN-1]
    delivers_changes: [CHANGE-ONBOARD-1]
    valid_from: "2026-05-26"
    valid_to: null

  - id: ACTION-LAUNCH-1
    name: "Launch"
    duration_days: 5
    predecessors: [ACTION-BUILD-1]
    delivers_changes: [CHANGE-ONBOARD-1]
    valid_from: "2026-05-26"
    valid_to: null
```

Actions form a DAG via `predecessors:`. The renderer computes Early Start / Late Finish / slack and highlights the critical path in both the PSND view and the Gantt projection. Transitrix Studio renders both views; the toolbar switches between them.

`valid_from` / `valid_to` are required on every inline action per [`notations/CONTRACT.md`](../../../../../notations/CONTRACT.md) §7 and are **distinct** from `start_date` / `end_date`: the lifecycle fields say *when this action entry is admitted to the plan*, while the schedule fields say *when the work is planned to happen*. Both coexist; the action document itself carries no lifecycle.

## Cross-references

- `goals: [GOAL-…]` — Goal IDs from the goals tree / FGCA chain.
- `delivers_changes: [CHANGE-…]` — Change IDs from the FGCA chain.
- `predecessors: [ACTION-…]` — other action IDs in the same file.

All IDs follow the canonical `<TYPE>-[<middle>-]<INTEGER>` grammar from [`notations/IDS_AND_REFERENCES.md`](../../../../../notations/IDS_AND_REFERENCES.md).

## See also

- [`notations/views/07-action.md`](../../../../../notations/views/07-action.md) — the notation spec
- [`notations/examples/action/platform-launch.dgca.transitrix.yaml`](../../../../../notations/examples/action/platform-launch.dgca.transitrix.yaml) — worked example
- `method/methodology.md` §6 — notation kit
