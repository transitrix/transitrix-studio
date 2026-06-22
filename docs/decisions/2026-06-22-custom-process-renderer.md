---
status: accepted
date: 2026-06-22
scope: transitrix-studio
supersedes: none
superseded_by: none
tags: [bpmn, process, renderer, svg, diagrams, packaging, compliance, cv-3]
---

# A custom cross-functional process-diagram renderer

## Context

Every Transitrix custom notation (`@transitrix/diagrams`) produces its SVG via a
custom layout engine + SVG emitter that the project fully controls — and, after
the review-C work, a *single* emitter per notation shared across hosts. The BPMN
process diagram is the one exception: it renders through **bpmn.io (bpmn-js /
bpmn-moddle)**, an external library. That exception costs us in three places:

- **SVG output control.** bpmn-js owns its own rendering; we cannot freely
  shape the SVG the way every other notation's emitter lets us (theme classes,
  title block, edge markers, no-italic rule, spacing).
- **Packaging.** The BPMN path pulls `bpmn-moddle` and `ajv`, which use dynamic
  `require` patterns esbuild cannot cleanly inline. That is exactly why the
  extension ships the compiler as a bundled `extension/compiler/*.js` loaded by a
  runtime path-based `import()`, with the deps installed separately into
  `extension/node_modules/` (see
  [`2026-06-22-bpmn-core-package-home.md`](2026-06-22-bpmn-core-package-home.md)).
- **Compliance overlay.** The CV-3 compliance blueprint lane overlay work is
  constrained by what bpmn-js will let us draw on top of its rendering.

In practice the vast majority of users draw a small subset of BPMN — swimlanes,
tasks, gateways, sequence flows, start/end events. Full BPMN 2.0 breadth
(every event sub-type, choreography, conversation, etc.) is rarely used.

A key observation that shaped the decision below: **the hard part is already
ours.** `src/layout.ts` is a custom two-phase layout engine (ELK.js for global
X-ordering, then bespoke Y-placement, lane bounds, and orthogonal sequence-flow
routing) producing a fully-resolved `LayoutIr` with absolute geometry. bpmn.io is
used essentially as a *viewer* over BPMN XML, not as our layout brain. So a
"custom renderer" is mostly a new **SVG emitter over the existing geometry**, not
a new layout engine.

## Decision

**Status `accepted`.** The build start and release timing remain Valerii-gated;
this ADR records the design, not a schedule.

Introduce a **custom cross-functional algorithmic diagram renderer** as the
**primary render path** for process diagrams in Studio. It renders the same
`*.bpmn.transitrix.yaml` input files through a custom SVG emitter, consistent
with the `@transitrix/diagrams` pattern — giving full SVG control, clean
packaging, and no dynamic-require constraints. The bpmn.io path is retained in
`@transitrix/bpmn-core` as a legacy option for full BPMN 2.0 export / interop.

### Approach — reuse the layout engine, add an emitter (Variant A)

We **reuse the existing ELK-backed layout engine** (`src/layout.ts`, moving with
the BPMN core into `@transitrix/bpmn-core`) and add **only a new SVG emitter**.
The emitter consumes the engine's `LayoutIr` (absolute element bounds, lane/pool
bounds, routed flow waypoints) and emits SVG the same way every other
`@transitrix/diagrams` notation does. No second layout engine is introduced.

### Package boundaries (resolves the prior open question)

- **`@transitrix/bpmn-core`** — owns the model (IR, parser, validator), the
  ELK-backed **layout engine**, BPMN-XML emit, and the legacy bpmn.io render path.
  Workspace-only package; no public-library version contract.
- **`@transitrix/diagrams`** — owns the **SVG emitter** for the process diagram,
  alongside the other custom-notation emitters, reusing the shared theme + single-
  emitter conventions. It depends on `@transitrix/bpmn-core` for geometry only.

### Styling is centralized (visual unity)

There is **one source of truth for process-diagram styling**, living in the
shared theme of `@transitrix/diagrams` (the theme CSS + per-notation CSS consumed
by the single emitter), exactly like every other notation. Consequences:

- No per-host (VS Code / IntelliJ / UI) and no per-path (custom vs legacy bpmn.io)
  style forks — the emitter is the only place that decides geometry-to-style.
- The no-italic rule, spacing, colours, edge markers, and title block come from
  the shared theme, not inline ad-hoc styles.
- This continues the review-C ("single emitter per notation") and review-E1
  ("single metadata reader") direction: one reader, one emitter, one theme.

### Supported subset (v1)

All of the following are **required in the first version**:

- Swimlanes (pools + lanes)
- Tasks / sub-processes
- Sequence flows (including conditional)
- Gateways: XOR, AND, **Inclusive**
- Start and End events; **intermediate Message and Timer events**
- **Data objects** (with their `association` connections)

The last three lines extend the current model and therefore require **additive,
backward-compatible** work across `@transitrix/bpmn-core` before the emitter can
draw them:

- IR: new element types (inclusive gateway, intermediate message/timer event,
  data object) and a new **association** edge kind (data objects connect via
  dotted associations, not sequence flows).
- Parser + validator: accept and validate the new types/edges.
- BPMN-XML emit + layout sizing/routing: size the new nodes and route
  associations (so the legacy path and export stay in sync).

Existing `*.bpmn.transitrix.yaml` files keep rendering identically — the new
types are purely additive.

### Interactivity

Zoom / pan parity with the other notations (the shared preview controls). No
bpmn-js-specific interactions are carried over for v1.

## Motivation

- **Full SVG / PNG control** — consistent with all other notation renderers.
- **Unblocks CV-3** (compliance blueprint lane overlay) without bpmn-js
  constraints.
- **Removes `bpmn-moddle` / `ajv` from the hot packaging path** — the primary
  render path no longer drags the dynamic-require deps into the bundle.
- **Consistent with the `@transitrix/diagrams` rendering pattern** — one
  layout-engine + single-emitter shape across every notation.

## What this does NOT change

- **Input file format** (`*.bpmn.transitrix.yaml`) — unchanged for existing
  files. The renderer is a new presentation over the existing model; the v1
  subset adds new optional element/edge types additively, never breaking files
  that don't use them.
- **The existing bpmn.io render path** — stays in `@transitrix/bpmn-core` as the
  legacy / full-BPMN-2.0-export option.

## Consequences

- New process diagrams render through a Studio-owned emitter; the design rules
  (no italic, spacing, edge markers, title block) are enforced in one place via
  the shared theme, like every other notation.
- The bpmn.io dependency moves off the primary path and onto the explicit
  legacy / export path in `@transitrix/bpmn-core`, simplifying the default
  packaging story.
- CV-3 and future compliance overlays draw on a renderer we control end to end.
- The v1 subset requires additive model work (new element types + association
  edges) in `@transitrix/bpmn-core` before the emitter is feature-complete.
- Until the custom renderer reaches subset parity, the bpmn.io path remains the
  active render path — this is a phased replacement, not a big-bang switch.
