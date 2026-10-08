# T03 DGA

Open in **Reading view**. Expected: a three-level chain (factor, goal, action; no changes level).

```transitrix-dga
notation: dga
spec_version: "0.1"
id: DGA-DEMO-1
name: Demo without changes
factors:
  - { id: DRIVER-1, name: Market pressure, type: external }
goals:
  - { id: GOAL-1, name: Grow reliably, factors: [DRIVER-1] }
actions:
  - { id: ACTIVITY-1, name: Ship MVP, goals: [GOAL-1] }
```
