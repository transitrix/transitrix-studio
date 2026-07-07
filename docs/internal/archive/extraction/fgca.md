---
title: Extraction spec — FGCA diagram (`@transitrix/diagrams/fgca`)
audience: internal
status: draft_v0.1
last_reviewed: 2026-05-08
notation_canonical: ~/Documents/GitHub/methodology/notations/03-fgca.md
source_impl: ~/Documents/GitHub/transitrix-dsm/dsm/src/pages/GoalsAndActivitiesPage/components/FGCAEditorView.tsx
tags: [transitrix, diagrams, extraction, fgca, contract]
---

# Extraction spec — FGCA diagram

This document specifies the **FGCA sub-module** of `@transitrix/diagrams`. It is the contract that
`packages/diagrams/src/fgca/` must honour and that consuming hosts (Transitrix DSM, Transitrix Studio
preview, future hosts) can rely on.

Canonical notation semantics: see `notation_canonical` in frontmatter.  
Implementation source: see `source_impl` in frontmatter.

---

## 1. Module purpose

Render the FGCA (Factor → Goal → Change → Activity) 4-layer strategy diagram:

- **Pure layout** (`buildFGCALayout`) — maps raw entity arrays to ReactFlow nodes + edges.
- **React node components** — render each column type; accept style props, no Redux.
- **nodeTypes map** — `FGCA_NODE_TYPES` for direct use with `<ReactFlow nodeTypes={...} />`.

Editing UX (drag-and-drop linking, column toggle state, undo/redo, download) remains in the DSM host.

---

## 2. Two-layer architecture

### Layer A — Pure layout (`layout.ts`)

```ts
function buildFGCALayout(input: FGCALayoutInput): { nodes: Node[]; edges: Edge[] }
```

- No React, no Redux, no DOM, no I/O. Safe to run in Node.js or vitest (node environment).
- Reads `visibleColumns: Set<FGCAColumn>` and skips hidden columns and their edges.
- Outputs standard ReactFlow `Node[]` and `Edge[]` arrays.

### Layer B — React node components (`nodes/`)

Four components, one per column:

| Component | Node type key | Background | ID label format |
|-----------|--------------|------------|-----------------|
| `FGCAFactorNode` | `fgcaFactor` | `#fef3c7` (amber) | `F-0001` (4 digits) |
| `FGCAGoalNode` | `fgcaGoal` | per-level (caller-supplied `bgColor`) | `G-0001` (4 digits) |
| `FGCAChangeNode` | `fgcaChange` | `#dbeafe` (blue) | `C-001` (3 digits) |
| `FGCAActivityNode` | `fgcaActivity` | `#d4edda` (green) | `A-001` (3 digits) |

Each component accepts:
```ts
data: {
  id: number;
  name: string;
  borderColor?: string;   // default "#94a3b8"
  borderWidth?: number;   // default 1
  // FGCAGoalNode only:
  level?: number;
  bgColor?: string;       // resolved by caller from goalLevelColors
  // FGCAActivityNode only:
  activityTypeName?: string;
}
isConnectable?: boolean;
```

No `useSelector`, no `useDispatch`. All styling via props.

---

## 3. Data schema

### Input types

```ts
interface FactorItem       { id: number; name: string; }
interface GoalItem         { id: number; name: string; level?: number; factor?: { id: number }[]; }
interface BdnChangeWithActivities { id: number; name: string; goal_id: number; activity_ids: number[]; }
interface ActivityItem     { id: number; name: string; goal_id?: number | null; activity_type_id?: number; }
interface ActivityTypeItem { id: number; name?: string; }
interface DiagramStyle     { nodeBorderColor?: string; nodeBorderWidth?: number; edgeColor?: string; edgeWidth?: number; }
type FGCAColumn = "factor" | "goal" | "change" | "activity";
```

### Edges produced

| Condition | Edge |
|-----------|------|
| Factor and Goal both visible | Factor → Goal (via `goal.factor[].id`) |
| Goal and Change both visible | Goal → Change (via `change.goal_id`) |
| Change and Activity both visible | Change → Activity (via `change.activity_ids[]`) |
| Goal and Activity both visible, Change hidden OR activity not covered by a Change link | Goal → Activity direct |

---

## 4. Column visibility rules

- Columns are stored in `localStorage["fgca_columns"]` by the host (DSM).
- At least 1 column must always be visible (the host enforces this; the layout function does not).
- When a column is hidden, its nodes are excluded from `nodes[]` and its edges are excluded from `edges[]`.

---

## 5. Public API (`packages/diagrams/src/fgca/index.ts`)

```ts
// Layout
export { buildFGCALayout }
export type { FGCALayoutInput }

// Types
export type { FactorItem, GoalItem, BdnChangeWithActivities, ActivityItem, ActivityTypeItem, DiagramStyle, FGCAColumn }
export { ALL_FGCA_COLUMNS, FGCA_COLUMN_LABELS }

// Node components
export { FGCAFactorNode, FGCAGoalNode, FGCAChangeNode, FGCAActivityNode }

// Convenience map
export { FGCA_NODE_TYPES }  // { fgcaFactor, fgcaGoal, fgcaChange, fgcaActivity }
```

---

## 6. DSM migration path

DSM (`FGCAEditorView.tsx`) currently has its own copies of the four node components and the
`buildInitialNodesAndEdges` function. The migration sequence, when ready:

1. Add `@transitrix/diagrams` as a dependency in `dsm/package.json`.
2. Replace the four local node component imports with `@transitrix/diagrams` imports.
3. Replace `buildInitialNodesAndEdges` call with `buildFGCALayout`.
4. Remove the local copies of the four node files.
5. Keep all DSM-specific logic (Redux dispatch, `getAllChanges` fetch, column toggle UI, undo/redo, download).

**Do not delete DSM's local copies until the migration is complete and verified.**

---

## 7. Tests

Location: `packages/diagrams/src/fgca/__tests__/layout.test.ts`

Coverage:
- All-columns layout produces correct node count and types.
- Factor→Goal, Goal→Change, Change→Activity edges are created correctly.
- Direct Goal→Activity edges appear when Change column is hidden.
- Hidden column excludes its nodes and edges.
- Single-column layout produces no edges.
- Column x-positions are ordered F < G < C < A.
