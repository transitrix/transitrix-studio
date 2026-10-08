# T02 DGCA

Open in **Reading view**. Expected: a four-level chain (factor, goal, change, action).

```transitrix-dgca
notation: dgca
spec_version: "0.1"
id: DGCA-DEMO-1
name: Demo chain
factors:
  - { id: DRIVER-1, name: Market pressure, type: external }
goals:
  - { id: GOAL-1, name: Grow reliably, factors: [DRIVER-1] }
changes:
  - { id: CHANGE-1, name: Launch offering, goals: [GOAL-1] }
actions:
  - { id: ACTIVITY-1, name: Ship MVP, changes: [CHANGE-1] }
```
