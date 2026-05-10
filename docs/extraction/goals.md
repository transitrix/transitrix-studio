---
title: Extraction spec — Goal tree (`@transitrix/diagrams/goals`)
audience: internal
status: draft_v0.1
last_reviewed: 2026-05-07
source_analysis: internal
tags: [transitrix, diagrams, extraction, goals, contract]
---

# Extraction spec — Goal tree

This document specifies the **goal tree** sub-module of `@transitrix/diagrams`. It is the contract that the implementation in `packages/diagrams/goals/` must honour and that the consuming hosts (Transitrix Studio extension, Transitrix Studio web utility, Transitrix DSM web app, future hosts) can rely on.

Source-of-truth analysis of the existing DSM implementation: see `source_analysis` in frontmatter.

## 1. Module purpose

Render and manage **hierarchical goal trees** as text-native data: parse → validate → layout → render → mutate. Pure, stateless, framework-light.

## 2. Architecture — two layers

The library scope is rendering + validation + pure mutations. Editing UX stays host-specific. Within rendering, this module ships **two stacked layers**:

### Layer A — Pure layout (no framework)

```ts
function layoutGoalTree(
  goals: Goal[],
  options?: LayoutOptions
): GoalTreeLayout;
```

- Pure function. No React, no DOM, no Redux, no I/O.
- Internally uses `dagre` (`rankdir: 'LR'`, `ranker: 'network-simplex'`) for layout.
- Output is a structural description — positions, sizes, edges — that any renderer can consume.

This layer is the foundation. Anything built on top — React-based renderer, SVG emitter, raw HTML element renderer — composes against this output.

### Layer B — React renderer (Phase 1)

```ts
const GoalTreeView: React.FC<GoalTreeViewProps>;
```

- Consumes `goals: Goal[]` and an optional pre-computed layout.
- Internally uses `reactflow` for rendering and interaction.
- Returns an `HTMLElement` mounted via React (satisfies the §10 contract: `(data) => HTMLElement`).
- Both Transitrix Studio (React) and Transitrix DSM (React) consume this directly.

### Layer B' — SVG renderer (Phase 2, deferred)

A non-React renderer that emits a static SVG string for embeds in plain HTML hosts (transitrix.github.io, READMEs). Built on top of Layer A. Out of scope for v1.

## 3. Data schema (v1, text-native)

Canonical input is a YAML file `*.goals.transitrix.yaml`. Schema:

```yaml
# Example: enterprise-strategy.goals.transitrix.yaml
goal_types:
  - { name: "Strategy",      level: 0 }
  - { name: "Business Goal", level: 1 }
  - { name: "Project",       level: 2 }
  # ... up to level 7

goals:
  - id: 1
    name: "Triple revenue in 3 years"
    type: "Strategy"
    level: 0
    parent_id: 0       # 0 = root
    tag: "north-star"  # optional
    description: |     # optional
      A long-form description.
    factors:           # optional, see §3.2
      - id: 10
        name: "Market expansion (EU)"
        impact_type: "opportunity"
  - id: 2
    name: "Launch in 3 EU markets"
    type: "Business Goal"
    level: 1
    parent_id: 1
```

### 3.1 TypeScript types

```ts
type ImpactType = 'opportunity' | 'positive' | 'risk' | 'negative' | 'mixed';

interface Factor {
  id: number;
  name: string;
  description?: string;
  segment?: string;
  impact_type: ImpactType;
}

interface Goal {
  id: number;
  name: string;
  type: string;          // matches a GoalType.name
  level: number;         // 0..7
  parent_id: number;     // 0 = root or backlog
  link?: string;
  tag?: string;
  description?: string;
  factors?: Factor[];    // optional
  created_at?: string;
}

interface GoalType {
  name: string;
  level: number;
}

interface GoalTree {
  goal_types: GoalType[];
  goals: Goal[];
}
```

### 3.2 Schema notes

- `factors` is part of the canonical schema (it is rendered by the existing DSM viewer; carry forward).
- `goal_types` ships in the file alongside `goals` — methodology-level catalogue, file-specific override allowed.
- Tree is derived from `parent_id` index. Roots: `level === 0 || parent_id === 0`. Goals whose parent is missing become "backlog" (rendered separately, not silently dropped).

## 4. Validation contract

```ts
function validateGoalTree(input: unknown): ValidationResult;

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  code: string;         // e.g. 'CYCLE_DETECTED', 'MAX_LEVEL_EXCEEDED', 'TYPE_LEVEL_MISMATCH'
  message: string;      // human-readable
  path?: string;        // YAML path to offending item, e.g. 'goals[3]'
}
```

### 4.1 Validation rules (v1)

| Code | Rule | Severity |
| --- | --- | --- |
| `SCHEMA_INVALID` | Input does not match the JSON-schema for `GoalTree`. | error |
| `DUPLICATE_ID` | Two goals share the same `id`. | error |
| `BROKEN_PARENT_REF` | `parent_id` references a non-existent goal (and is not `0`). | warning (renders to backlog) |
| `CYCLE_DETECTED` | Goal A references B as parent and B (transitively) references A. | error |
| `MAX_LEVEL_EXCEEDED` | A goal's level exceeds `max(goal_types[*].level)`. | error |
| `TYPE_LEVEL_MISMATCH` | Goal's `type` does not match its `level` per the `goal_types` table. | warning |
| `EMPTY_NAME` | `name` is missing or empty. | error |

Validation is host-independent. Same rules apply in Studio CLI, Studio extension, and DSM.

## 5. Pure mutations contract

```ts
function reparent(tree: GoalTree, sourceId: number, targetId: number): MutationResult<GoalTree>;
function addChild(tree: GoalTree, parentId: number, newGoal: Omit<Goal, 'id'>): MutationResult<GoalTree>;
function deleteWithDescendants(tree: GoalTree, id: number): MutationResult<GoalTree>;
function moveToBacklog(tree: GoalTree, id: number): MutationResult<GoalTree>;
function restoreFromBacklog(tree: GoalTree, id: number, newParentId: number): MutationResult<GoalTree>;

interface MutationResult<T> {
  ok: boolean;
  result?: T;             // present when ok = true
  error?: ValidationError;// present when ok = false
}
```

All mutations are **pure**: they take a tree and return a new tree. The caller decides what to do with the result (persist via API, update local state, etc.).

Mutations call `validate*` internally and refuse invalid moves (cycle, level overflow, etc.) with structured errors instead of throwing.

When a mutation cascades (e.g. `reparent` updates descendant `level`s and `type`s via the `goal_types` table), the cascade is part of the pure transform.

## 6. Render contract

### 6.1 Layer A — pure layout

```ts
interface LayoutOptions {
  rankdir?: 'LR' | 'TB';      // default: 'LR'
  nodeWidth?: number;         // default: 250
  nodeHeight?: number;        // default: 80
  rankSep?: number;           // default: 80
  nodeSep?: number;           // default: 40
  hideCollapsed?: number[];   // ids whose subtrees should be hidden
  viewDepth?: number | null;  // hide nodes at level > viewDepth
}

interface GoalTreeLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  bounds: { x: number; y: number; width: number; height: number };
}

interface LaidOutNode {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  data: Goal;            // original goal
  isCollapsedRoot: boolean;
  hasHiddenChildren: boolean;
}

interface LaidOutEdge {
  source: number;
  target: number;
  // simple straight or right-angle path; renderers compute waypoints
}
```

### 6.2 Layer B — React component

```ts
interface GoalTreeViewProps {
  tree: GoalTree;
  layout?: GoalTreeLayout;     // optional: pre-computed; otherwise computed internally
  layoutOptions?: LayoutOptions;
  theme?: ThemeTokens;         // colours, fonts; replaces DSM Redux selectors
  readOnly?: boolean;
  showBacklog?: boolean;
  showMiniMap?: boolean;
  onChange?: (event: GoalTreeChange) => void;
  onEditRequest?: (goal: Goal) => void;  // host opens its own modal
}

type GoalTreeChange =
  | { kind: 'reparent'; sourceId: number; targetId: number; result: GoalTree }
  | { kind: 'addChild'; parentId: number; newGoal: Goal; result: GoalTree }
  | { kind: 'delete'; id: number; result: GoalTree }
  | { kind: 'moveToBacklog'; id: number; result: GoalTree }
  | { kind: 'restoreFromBacklog'; id: number; newParentId: number; result: GoalTree };
```

Visual contract:

- 250×80 px goal cards.
- Hover-highlight of potential parent during drag.
- Level-based card fill colour (from `theme.goalLevelColors`, default 0..7 palette).
- Factor indicators: green up-caret (positive/opportunity), red down-caret (risk/negative). Click reveals inline panel above/below.
- Collapse indicator on nodes with hidden children.
- React Flow controls: pan, zoom, fit-view, MiniMap.
- Backlog sidebar (left, collapsible 50/250 px) when `showBacklog` and tree contains backlog goals.

## 7. What stays in hosts (NOT in library)

- **Modals for full edit** — DSM has `AddNewNodeModal`; Studio has its own form. Library exposes `onEditRequest(goal)`; host handles.
- **Backend persistence** — `importGoal`, `deleteGoals`, etc. Host wires up `onChange` to its API.
- **Undo/redo manager** — historic state stack is a host concern (DSM uses local refs; Studio could use VS Code edit history).
- **AI-assistant integration** (`window.transitrix-data-refresh` event in DSM). Library accepts `viewDepth` as a controlled prop instead.
- **Theme source** — DSM reads from Redux; Studio reads from settings file. Library accepts `theme` as a prop.
- **Save-state UI** ("Saving..." indicator) — host UX.

## 8. Migration path for DSM

1. Library imports `Goal`, `GoalType` types from itself (DSM stops re-defining them).
2. DSM's `VisualEditorReactFlow.jsx` is replaced by `<GoalTreeView ... />` from `@transitrix/diagrams`.
3. DSM's drag-drop handlers become `onChange` callback that calls `importGoal({goals: change.result.goals})`.
4. DSM's modal opens on `onEditRequest`.
5. DSM's Redux selectors map to `theme` prop.
6. DSM keeps its undo/redo manager around the controlled `tree` state.

## 9. Open questions / decisions needed before implementation

- **D3 SVG renderer revival** — `TreeChart.jsx` (dead code in DSM) is closer to the OSS contract. Decision: discard, or revive as Layer B' Phase 2 starting point? *Recommendation: discard for v1; start Layer B' fresh from layout output.*
- **Collapse / view-depth state** — controlled by host (host owns collapsed-set state) or internal to component (component owns it, exposes events)? *Recommendation: controlled — keeps library stateless.*
- **Backlog as part of GoalTree or separate input** — current proposal embeds backlog implicitly (goals with `parent_id` referencing missing parent). Cleaner alternative: explicit `backlog: Goal[]` array. *Recommendation: keep implicit for v1 to match existing data; revisit if it confuses.*
- **`factors` field standardisation** — the schema includes `factors`. Confirm the methodology spec (`methodology/`) defines factors with this exact shape, or coordinate.

## 10. Phasing

- **Phase 1 (publish-ready):** Layer A + Layer B (React/React-Flow) + validation + pure mutations. DSM migrates to consume.
- **Phase 2 (future):** Layer B' (SVG/HTML emitter) for non-React hosts. Optional; only if a real consumer asks.
