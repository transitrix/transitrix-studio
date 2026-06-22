---
status: proposed
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

## Decision

**Status `proposed`. Valerii gates the build start and the release timing.**

Introduce a **custom cross-functional algorithmic diagram renderer** as the
**primary render path** for process diagrams in Studio. It renders the same
`*.process.transitrix.yaml` input files through a custom SVG emitter, consistent
with the `@transitrix/diagrams` pattern — giving full SVG control, clean
packaging, and no dynamic-require constraints. The bpmn.io path is retained in
`@transitrix/bpmn-core` as a legacy option for full BPMN 2.0 export / interop.

### Supported subset (sufficient for 95%+ of real-world use)

- Swimlanes (pools + lanes)
- Tasks / sub-processes
- Sequence flows (including conditional)
- Gateways: XOR, AND, Inclusive
- Start and End events; intermediate Message and Timer events (optional — can be
  phased in)
- Data objects (optional)

### Motivation

- **Full SVG / PNG control** — consistent with all other notation renderers.
- **Unblocks CV-3** (compliance blueprint lane overlay) without bpmn-js
  constraints.
- **Removes `bpmn-moddle` / `ajv` from the hot packaging path** — the primary
  render path no longer drags the dynamic-require deps into the bundle.
- **Consistent with the `@transitrix/diagrams` rendering pattern** — one
  layout-engine + single-emitter shape across every notation.

### What this does NOT change

- **Input file format** (`*.process.transitrix.yaml`) — unchanged. The renderer
  is a new presentation over the existing model, not a new authoring format.
- **The existing bpmn.io render path** — stays in `@transitrix/bpmn-core` as the
  legacy / full-BPMN-2.0-export option.

## Open question (for the implementation PR)

Where the custom renderer lives:

- in **`@transitrix/diagrams`** — alongside the other custom notations, reusing
  the shared layout + single-emitter conventions; or
- in **`@transitrix/bpmn-core`** — co-located with the legacy bpmn.io path so all
  process-diagram rendering sits in one package.

Recorded as an open question; Valerii decides when the build starts.

## Consequences

- New process diagrams render through a Studio-owned emitter; the design rules
  (no italic, spacing, edge markers, title block) are enforced in one place,
  like every other notation.
- The bpmn.io dependency moves off the primary path and onto the explicit
  legacy / export path in `@transitrix/bpmn-core`, simplifying the default
  packaging story.
- CV-3 and future compliance overlays draw on a renderer we control end to end.
- Until the custom renderer reaches subset parity, the bpmn.io path remains the
  active render path — this is a phased replacement, not a big-bang switch.
