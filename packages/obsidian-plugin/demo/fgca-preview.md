# Transitrix DGCA / DGA preview (demo)

Artificial self-contained FGCA YAML for the Obsidian SVG slice. Open in **Reading view**. Live Preview and repository `view_config`-only projections are out of scope.

## Valid DGCA

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

## Valid DGA

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

## Invalid DGCA (must fail locally)

```transitrix-dgca
notation: dgca
id: not-valid
name: Broken
factors: []
goals: []
```

## Projection rejected (must fail locally)

```transitrix-dgca
notation: dgca
id: DGCA-PROJ-1
name: Projection only
view_config:
  goals:
    filter: all
```
