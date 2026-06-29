# `canon/views/dgca/`

Driver → Goal → Change → Activity chains. Strategy-to-execution scaffold: drivers justify focus, goals set direction, changes define the transformation, activities deliver. Each layer references atomic elements stored elsewhere.

## File convention

`*.dgca.transitrix.yaml`

## Skeleton

```yaml
notation: dgca
spec_version: "0.1"

id: DGCA-EU-1
name: "EU Expansion 2026"
description: "Driver → Goal → Change → Activity chain for EU market entry."
period: "2026"
date: "2026-05-26"
author: "Acme Strategy Office"

drivers:
  - id: DRIVER-EU-REG-1           # → canon/elements/01_motivation/drivers/DRIVER-EU-REG-1.yaml
    name: "EU regulatory window for market entry"   # neutral driver — findings live on ASSESSMENTs
    type: external
    category: legal               # PESTLE — external only
    references_constraint: [CONSTRAINT-GDPR-RESIDENCY-1]   # → canon/elements/01_motivation/constraints/
    valid_from: "2026-05-26"      # CONTRACT.md §7 — required on every inline element
    valid_to: null

goals:
  - id: GOAL-EU-1
    name: "Operational presence in 3 EU markets by Q4"
    drivers: [DRIVER-EU-REG-1]
    valid_from: "2026-05-26"
    valid_to: null

changes:
  - id: CHANGE-EU-CRM-1
    name: "Stand up EU-localised CRM and payment processing"
    goals: [GOAL-EU-1]
    valid_from: "2026-05-26"
    valid_to: null

activities:
  - id: ACTIVITY-CRM-EU-1
    name: "Implement EU-localised CRM rollout"
    changes: [CHANGE-EU-CRM-1]
    valid_from: "2026-05-26"
    valid_to: null
```

`valid_from` / `valid_to` are required on every inline element per [`notations/CONTRACT.md`](../../../../../notations/CONTRACT.md) §7. The DGCA document itself does not carry a lifecycle field — it is a view, not an element.

## See also

- `method/methodology.md` §6.2 — DGCA notation
- `canon/views/dga/` — simplified 3-layer variant (no Changes layer)
