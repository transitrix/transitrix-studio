# S01 Edit me

This is the only note you are meant to change. Open it in **Reading view** first (two goals), then follow the "Refresh after editing" steps in the manual test plan.

```transitrix-goals
notation: goals
spec_version: "0.1"
id: GOALS-EDIT-1
name: Editable
goal_types:
  - { name: Strategy, level: 0 }
  - { name: Objective, level: 1 }
goals:
  - { id: GOAL-EDIT-1, name: Original root, type: Strategy, level: 0 }
  - { id: GOAL-EDIT-2, name: Original child, type: Objective, level: 1, parent: GOAL-EDIT-1 }
```
