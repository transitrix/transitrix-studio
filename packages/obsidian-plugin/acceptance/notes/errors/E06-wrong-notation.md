# E06 Notation does not match the fence

Open in **Reading view**. Expected: an error panel (a DGCA document inside a Goals fence), not a crash and not a diagram.

```transitrix-goals
notation: dgca
spec_version: "0.1"
id: DGCA-WRONG-1
name: DGCA inside a Goals fence
factors:
  - { id: DRIVER-1, name: Market pressure, type: external }
goals:
  - { id: GOAL-1, name: Grow reliably, factors: [DRIVER-1] }
changes: []
actions: []
```
