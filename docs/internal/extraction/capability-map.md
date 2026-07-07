---
title: Extraction spec — Capability map (`@transitrix/diagrams/capability-map`)
audience: internal
status: draft_v0.1
last_reviewed: 2026-05-07
source_analysis: internal
tags: [transitrix, diagrams, extraction, capability-map, contract]
---

# Extraction spec — Capability map

This document specifies the **capability map** sub-module of `@transitrix/diagrams`. It is the contract that the implementation in `packages/diagrams/capability-map/` must honour and that consuming hosts (Transitrix Studio extension, Transitrix Studio web utility, Transitrix DSM web app, future hosts) can rely on.

Source-of-truth analysis of the existing DSM implementation: see `source_analysis` in frontmatter. **Scope: only the L1/L2/L3 tree (the modern `CapabilitiesTreeEditor`).** The classic grid-style BCM (`NewBCM`) and the BCM kanban editor (`BCMFlow`) are out of scope for v1; treated as separate modules if ever needed.

## 1. Module purpose

Render and manage **hierarchical capability maps** (3-level depth maximum) as text-native data: parse → validate → layout → render → mutate. Pure, stateless, framework-light.

## 2. Architecture — two layers

Same two-layer pattern as the goal-tree module (see `goals.md`):

- **Layer A** — pure `layoutCapabilityMap(map, options) => CapabilityMapLayout`. No framework. dagre LR layout.
- **Layer B** — React component `<CapabilityMapView ... />` using `reactflow`. Consumed by both Studio and DSM.
- **Layer B'** — SVG/HTML emitter. Phase 2, out of scope for v1.

## 3. Data schema (v1, text-native)

Canonical input: YAML file `*.capmap.transitrix.yaml`. Schema:

```yaml
# Example: acme-corp.capmap.transitrix.yaml
organisation: "Acme Corp"      # rendered as the virtual root label
set_id: "v1.0"                 # capability-set identifier (versioned snapshot)

capabilities:
  - id: 1
    name: "Customer Acquisition"
    address: "1.0.0"           # L1
    backlog: false
    maturity:                  # optional, list of point-in-time snapshots
      - { date: "2026-01-01", level: 2 }
      - { date: "2026-04-01", level: 3 }

  - id: 2
    name: "Lead Qualification"
    address: "1.1.0"           # L2 under L1=1
    backlog: false

  - id: 3
    name: "Inbound Lead Scoring"
    address: "1.1.1"           # L3 under L2=1.1
    backlog: false
    maturity:
      - { date: "2026-04-01", level: 1 }

  # Backlog item — any address with first_level=0 OR backlog=true
  - id: 4
    name: "Channel Partner Mgmt"
    address: "0.0.0"
    backlog: true
```

### 3.1 Address triple — the canonical hierarchy carrier

The capability hierarchy is **derived from the `address` field**, not from a stored `parent` reference. This is a load-bearing methodology rule, not an implementation detail.

- `address: "X.0.0"` (X > 0) — L1 capability. Root-level under organisation.
- `address: "X.Y.0"` (Y > 0) — L2. Parent is the L1 with `address: "X.0.0"`.
- `address: "X.Y.Z"` (Z > 0) — L3. Parent is the L2 with `address: "X.Y.0"`.
- `address: "0.0.0"` or `backlog: true` — backlog (not on diagram).

Maximum depth is **3 levels**. Methodology-fixed; no override.

### 3.2 TypeScript types

```ts
interface MaturitySnapshot {
  date: string;     // ISO date
  level: number;    // 1..5 typically; methodology-defined scale
}

interface Capability {
  id: number;
  name: string;
  address: string;          // 'X.Y.Z' format
  backlog?: boolean;        // default false
  description?: string;
  maturity?: MaturitySnapshot[];
}

interface CapabilityMap {
  organisation: string;
  set_id: string;
  capabilities: Capability[];
}
```

### 3.3 Address parsing helpers

The library exposes pure helpers (analogous to DSM's `utils/capabilityAddress.ts`):

```ts
function parseAddress(address: string): [number, number, number];     // 'X.Y.Z' → [X, Y, Z]
function formatAddress(triple: [number, number, number]): string;
function getLevel(address: string): 1 | 2 | 3 | 'backlog';
function getParentAddress(address: string): string | null;            // '1.2.3' → '1.2.0'; '1.0.0' → null
function getFirstFreeAddress(parent: string, capabilities: Capability[]): string;
function isAddressTaken(address: string, capabilities: Capability[]): boolean;
```

## 4. Validation contract

```ts
function validateCapabilityMap(input: unknown): ValidationResult;
```

(Same `ValidationResult` shape as goals.md §4.)

### 4.1 Validation rules (v1)

| Code | Rule | Severity |
| --- | --- | --- |
| `SCHEMA_INVALID` | Input does not match the JSON-schema for `CapabilityMap`. | error |
| `DUPLICATE_ID` | Two capabilities share the same `id`. | error |
| `INVALID_ADDRESS_FORMAT` | `address` is not in `X.Y.Z` form. | error |
| `MISSING_PARENT_BY_ADDRESS` | An L2 has no L1 with `(X, 0, 0)`; or an L3 has no L2 with `(X, Y, 0)`. | warning (renders hanging from root or to backlog) |
| `DUPLICATE_ADDRESS` | Two on-diagram capabilities share the same address. | error |
| `MAX_DEPTH_EXCEEDED` | An address has a 4th level (e.g. `1.2.3.4`). | error |
| `EMPTY_NAME` | `name` is missing or empty. | error |
| `INVALID_MATURITY_LEVEL` | `maturity[*].level` outside the methodology scale. | warning |

## 5. Pure mutations contract

```ts
function reparent(map: CapabilityMap, sourceId: number, targetId: number): MutationResult<CapabilityMap>;
function addChild(map: CapabilityMap, parentId: number, newCap: Omit<Capability, 'id' | 'address'>): MutationResult<CapabilityMap>;
function deleteWithDescendants(map: CapabilityMap, id: number): MutationResult<CapabilityMap>;
function moveBranchToBacklog(map: CapabilityMap, id: number): MutationResult<CapabilityMap>;
function restoreFromBacklog(map: CapabilityMap, id: number, parentId: number): MutationResult<CapabilityMap>;
function normaliseAddresses(map: CapabilityMap): CapabilityMap;
```

(Same `MutationResult` shape as goals.md §5.)

### 5.1 Mutation invariants (must be preserved)

- **`reparent` recomputes addresses** for the moved branch. L1→L2: pick first free L2 address under target L1, recompute descendants. L2→L1: descendant L3s become L2s; their L3 children are dropped or themselves moved (decision point: see §9).
- **`addChild`** assigns `getFirstFreeAddress(parent, capabilities)` as the new node's address. ID is host-generated or library-generated (configurable).
- **`deleteWithDescendants`** removes all descendants by address prefix.
- **`normaliseAddresses`** repairs broken hierarchies — finds capabilities whose address doesn't match an existing parent and fixes them (or moves to backlog). Mirrors DSM's `normalizeCapabilityAddresses` API call but as a pure local transform.

### 5.2 Mutations refuse moves that would break invariants

- Move into descendant (cycle) — refused.
- Move that would exceed L3 depth — refused.
- Move that would create duplicate address — refused.

All refusals return structured `error`, not throw.

## 6. Render contract

### 6.1 Layer A — pure layout

```ts
interface LayoutOptions {
  rankdir?: 'LR' | 'TB';        // default: 'LR'
  nodeWidth?: number;           // default: 250
  nodeHeight?: number;          // default: 64
  rankSep?: number;
  nodeSep?: number;
  hideCollapsed?: number[];     // ids whose subtrees should be hidden
  organisationLabel?: string;   // default: from CapabilityMap.organisation
}

interface CapabilityMapLayout {
  rootNode: LaidOutNode;        // virtual root
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  bounds: { x: number; y: number; width: number; height: number };
}
```

`LaidOutNode` mirrors goals' shape but `data` is `Capability` (or `null` for the virtual root).

### 6.2 Layer B — React component

```ts
interface CapabilityMapViewProps {
  map: CapabilityMap;
  layout?: CapabilityMapLayout;
  layoutOptions?: LayoutOptions;
  theme?: ThemeTokens;
  readOnly?: boolean;
  showBacklog?: boolean;
  showMiniMap?: boolean;
  maturityColours?: Record<number, string>;  // 1..5 → hex
  selectedSet?: string;                       // optional set filter when input contains multiple sets (Phase 2)
  onChange?: (event: CapabilityMapChange) => void;
  onEditRequest?: (cap: Capability) => void;
}

type CapabilityMapChange =
  | { kind: 'reparent'; sourceId: number; targetId: number; result: CapabilityMap }
  | { kind: 'addChild'; parentId: number; newCap: Capability; result: CapabilityMap }
  | { kind: 'delete'; id: number; result: CapabilityMap }
  | { kind: 'moveBranchToBacklog'; id: number; result: CapabilityMap }
  | { kind: 'restoreFromBacklog'; id: number; parentId: number; result: CapabilityMap }
  | { kind: 'normaliseAddresses'; result: CapabilityMap };
```

Visual contract:

- 250×64 px capability cards.
- Maturity dot (top-left); colour from `maturityColours[level]`. Default scale 1..5.
- Address (e.g. `1.2.3`) shown on card.
- Virtual organisation root rendered at left, single node, no maturity dot.
- Same React Flow controls as goals: pan/zoom/fitView/MiniMap.
- Backlog sidebar (left).
- Per-node hover reveals `+` (add child) and collapse `±` buttons.

## 7. What stays in hosts (NOT in library)

Same split as goals.md §7:

- Edit modals.
- Backend persistence (DSM: `editCapability`, `newCapability`, `getCapability`, `moveCapabilityBranchToBacklog`).
- Undo/redo manager.
- Theme source.
- Save-state indicator.
- Capability-set selector UI (when filtering across multiple sets is implemented in DSM; library v1 takes a single map).

## 8. Migration path for DSM

1. DSM imports types from `@transitrix/diagrams/capability-map`.
2. DSM's `CapabilitiesTreeEditor.tsx` becomes a thin wrapper around `<CapabilityMapView ... />`.
3. DSM's drag-drop handlers wire to `onChange` → `editCapability(payload)` API.
4. DSM's address-derivation helpers (`utils/capabilityAddress.ts`) move into the library (already pure; trivial).
5. DSM's `Align` button calls library's `normaliseAddresses` followed by host-side `editCapability` for each changed entity.
6. The `skipCapabilitySyncUntilRef` race-prevention pattern stays in DSM (host-specific concurrency concern).

## 9. Open questions / decisions needed before implementation

- **L2→L1 reparent with L3 grandchildren** — when an L2 is promoted to L1, its L3 children must become L2s (depth preserved) or be dropped (depth violated for L3 of the new L1 if any L2 conflict). Decision: spec the cascade explicitly, or refuse the move? *Recommendation: cascade if free addresses exist; refuse if they don't.*
- **Multi-set filtering** — DSM filters by `universal_item_set_id`. v1 spec assumes one map per file (one set). Decision: should the YAML schema support multiple sets in one file, or stay one-set-per-file? *Recommendation: one-set-per-file; multi-set is a host UX concern.*
- **`set_id` semantics** — methodology-level definition needed. Today it's a free string. Should the methodology spec (`methodology/`) define a versioning scheme (semver, date, commit-hash)? *Defer to methodology session.*
- **Maturity scale** — methodology should define the scale (1..5? 0..5? CMMI-style?). Spec assumes 1..5 default; library accepts override. *Confirm with methodology.*
- **`backlog: true` vs `address: "0.0.0"`** — current proposal supports both (one is the marker, the other is the empty-address). Decision: pick one canonical form and treat the other as legacy. *Recommendation: `backlog: true` is canonical; `address: "0.0.0"` is implicit when `backlog: true`; reject having both fields disagree.*
- **NewBCM grid map** — confirmed out of scope for v1. If users push for it later, it's a separate module under `@transitrix/diagrams/capability-grid` (or similar).

## 10. Phasing

- **Phase 1 (publish-ready):** Layer A + Layer B + validation + pure mutations. DSM migrates to consume. Address-helper utilities exposed.
- **Phase 2 (future):** Multi-set support, BCM grid module if needed, Layer B' SVG emitter.
