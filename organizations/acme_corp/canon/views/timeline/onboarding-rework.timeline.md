<!--
  Mermaid complementary view — Implementation & Migration layer: programme milestones.
  Renders in VS Code with Markdown Preview Mermaid Support (bierner.markdown-mermaid).

  Derived from:
    - canon/elements/05_implementation/actions/ACTION-DISCOVERY-1.yaml
        start_date: "2026-06-01", duration_days: 10
    - canon/elements/05_implementation/actions/ACTION-DESIGN-1.yaml
        duration_days: 14, predecessors: [ACTION-DISCOVERY-1]
    - canon/elements/05_implementation/actions/ACTION-BUILD-1.yaml
        duration_days: 30, predecessors: [ACTION-DESIGN-1]
    - canon/elements/05_implementation/actions/ACTION-LAUNCH-1.yaml
        duration_days: 5, predecessors: [ACTION-BUILD-1]

  Milestone dates are computed from the action chain:
    Discovery start:  2026-06-01 (explicit start_date on ACTION-DISCOVERY-1)
    Design start:     2026-06-11 (Discovery + 10 d)
    Build start:      2026-06-25 (Design + 14 d)
    Launch start:     2026-07-25 (Build + 30 d)
    Programme close:  2026-07-30 (Launch + 5 d)

  Not a duplicate of the Action Network (Gantt): the native Action Network notation
  shows the full action-on-node network with predecessors, durations, and critical path.
  This timeline projects the same chain as high-level delivery milestones — for
  executive status and stakeholder communication.
-->

# Onboarding Rework — Programme Milestones

Implementation & Migration view of the customer-onboarding rework programme.
Milestones are derived from the action dependency chain
(`ACTION-DISCOVERY-1` → `ACTION-DESIGN-1` → `ACTION-BUILD-1` → `ACTION-LAUNCH-1`).

```mermaid
timeline
    title Onboarding Rework — Delivery Milestones
    section Q2 2026
        1 Jun : Discovery & research
                (ACTION-DISCOVERY-1, 10 d)
        11 Jun : Solution design
                 (ACTION-DESIGN-1, 14 d)
        25 Jun : Build & test
                 (ACTION-BUILD-1, 30 d)
    section Q3 2026
        25 Jul : Launch
                 (ACTION-LAUNCH-1, 5 d)
        30 Jul : Programme close
```

## Model references

| Milestone | Date | Source action | Duration |
|---|---|---|---|
| Discovery start | 2026-06-01 | `ACTION-DISCOVERY-1` (explicit `start_date`) | 10 d |
| Design start | 2026-06-11 | `ACTION-DESIGN-1` (`predecessors: [ACTION-DISCOVERY-1]`) | 14 d |
| Build start | 2026-06-25 | `ACTION-BUILD-1` (`predecessors: [ACTION-DESIGN-1]`) | 30 d |
| Launch | 2026-07-25 | `ACTION-LAUNCH-1` (`predecessors: [ACTION-BUILD-1]`) | 5 d |
| Programme close | 2026-07-30 | Computed end of Launch | — |

Goal served: `GOAL-CUST-1` (Raise customer satisfaction) via `ACTION-DISCOVERY-1` + `ACTION-DESIGN-1`
