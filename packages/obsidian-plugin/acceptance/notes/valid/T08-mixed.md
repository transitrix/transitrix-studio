# T08 Valid and invalid blocks in one note

Open in **Reading view**. Expected: the first and third fences render as diagrams; the second shows an error panel and must not affect its neighbours.

```transitrix-goals
notation: goals
spec_version: "0.1"
id: GOALS-MIXED-1
name: Before the broken block
goal_types:
  - { name: Strategy, level: 0 }
goals:
  - { id: GOAL-MIXED-1, name: First valid goal, type: Strategy, level: 0 }
```

```transitrix-dgca
notation: dgca
id: not-valid
name: Broken in the middle
factors: []
goals: []
```

```transitrix-action
notation: action
spec_version: "0.1"
title: After the broken block
actions:
  - { id: ACTIVITY-MIXED-1, name: Still renders, duration: 1, sort: 10 }
```
