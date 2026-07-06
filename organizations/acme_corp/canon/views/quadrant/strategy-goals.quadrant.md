<!--
  Mermaid complementary view — Strategy layer: goal portfolio positioning.
  Renders in VS Code with Markdown Preview Mermaid Support (bierner.markdown-mermaid).

  Derived from:
    - canon/views/goals/eu-strategy.dgca.transitrix.yaml
        goal hierarchy: id, name, type (level 0/1/2), parent linkage.
        Y-axis (Strategic Importance): goal level — level 0 (Strategy) = highest;
          level 1 (Strategic Goal) = high; level 2 (Project Goal) = medium.
        X-axis (Implementation Urgency): inferred from goal type and description —
          a project goal described as an explicit gate condition for a near-term
          milestone ranks most urgent; a 2028-horizon strategy goal ranks least.

  Not a duplicate of the Goals tree: the goals tree shows hierarchy.
  This quadrant projects goals onto a prioritisation matrix.
-->

# Strategy 2026 — Goal Portfolio

Strategy-layer view of the 2026 goal portfolio. Goals are positioned by
strategic importance (derived from hierarchy level) and implementation urgency
(derived from goal type and gate-condition status).

Source: `eu-strategy.dgca.transitrix.yaml`

```mermaid
quadrantChart
    title 2026 Goal Portfolio — Importance × Urgency
    x-axis Low Urgency --> High Urgency
    y-axis Lower Importance --> Higher Importance
    quadrant-1 Do first
    quadrant-2 Shape long term
    quadrant-3 Revisit later
    quadrant-4 Manage and watch
    Triple revenue by 2028 (GOAL-REVENUE-1): [0.15, 0.90]
    Raise customer satisfaction (GOAL-CUST-1): [0.38, 0.72]
    Operational excellence (GOAL-OPS-1): [0.45, 0.58]
    Launch in 3 EU markets (GOAL-EU-1): [0.70, 0.80]
    GDPR & NIS2 compliance (GOAL-EU-COMPLIANCE-1): [0.88, 0.65]
```

## Model references

| Goal | Level | Type | Position rationale |
|---|---|---|---|
| `GOAL-REVENUE-1` | 0 | Strategy | Highest importance (root goal); 2028 horizon = low urgency |
| `GOAL-EU-1` | 1 | Strategic Goal | EU launch gate — near-term, very high impact |
| `GOAL-EU-COMPLIANCE-1` | 2 | Project Goal | Explicit gate condition for `GOAL-EU-1`; most urgent |
| `GOAL-CUST-1` | 1 | Strategic Goal | Medium-horizon; high but not gate-critical |
| `GOAL-OPS-1` | 1 | Strategic Goal | Ongoing operational; moderate urgency and importance |

Goal hierarchy source: `eu-strategy.dgca.transitrix.yaml`
