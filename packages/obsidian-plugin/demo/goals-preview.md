# Transitrix Goals preview (demo)

Artificial self-contained Goals YAML for the first Obsidian slice. Open this note in **Reading view**. Live Preview is out of scope.

## Valid tree

```transitrix-goals
notation: goals
spec_version: "0.1"
id: GOALS-SERVICE-1
name: Reliable service
goal_types:
  - { name: Strategy, level: 0 }
  - { name: Objective, level: 1 }
goals:
  - { id: GOAL-SERVICE-1, name: Deliver reliable service, type: Strategy, level: 0 }
  - { id: GOAL-RESPONSE-1, name: Reduce response time, type: Objective, level: 1, parent: GOAL-SERVICE-1 }
  - { id: GOAL-RECOVERY-1, name: Improve recovery, type: Objective, level: 1, parent: GOAL-SERVICE-1 }
```

## Invalid block (must fail locally, not the note above)

```transitrix-goals
notation: goals
id: not-a-goals-id
name: Broken
goal_types: []
goals: []
```
