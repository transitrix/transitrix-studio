# Transitrix Studio — BPMN Process Notation

**Version:** 0.3.7
**Date:** 2026-05-04
**Scope:** Reference for the YAML DSL used to describe BPMN 2.0 processes in Transitrix Studio. Covers structure, allowed elements, sequence flows, identifiers, and the supported subset of BPMN 2.0.
**Related:** [`validation.md`](validation.md), [`metrics.md`](metrics.md), [`../method/methodology.md`](../method/methodology.md) Sections 6–7, [`../schemas/bpmn-dsl.schema.json`](../schemas/bpmn-dsl.schema.json), [`../glossary.md`](../glossary.md).

---

## 1. Overview

Transitrix Studio processes are written as YAML and compiled to standards-compliant **BPMN 2.0 XML** (OMG `formal/2013-12-09`). The YAML describes a process as a structured graph: one pool, one or more lanes, typed elements inside lanes, and named sequence flows between elements. Coordinates and visual styling are **not** part of the notation — layout is computed deterministically at compile time and embedded as `bpmndi:` blocks in the output XML.

The notation is intentionally minimal. It covers the subset of BPMN 2.0 that maps cleanly to text and produces unambiguous diagrams without manual editing. Element types and structures outside this subset are explicitly out of scope (see Section 12).

The compiled output is consumable by any BPMN 2.0–conformant tool (Camunda Modeler, bpmn.io, Signavio, etc.) without round-tripping; YAML is the single source of truth.

---

## 2. File extension and recognition

The file extension is **`.bpmn.transitrix.yaml`**. (The legacy extension `.cervin.yaml` was used during early development and is kept accepted for backward compatibility; new files should use the canonical long form.)

Recognition is configurable:

- **VS Code extension:** `cervin.fileExtensions` setting in `.vscode/settings.json` (array of strings, each starting with a dot).
- **CLI:** `--ext=.bpmn.transitrix.yaml` flag overrides the default list.

A file outside the recognised extensions is rejected by the CLI with an explicit error.

---

## 3. Top-level structure

A process file contains a single root key `process` whose value is an object with four required fields and a fixed shape:

```yaml
process:
  id: <process-id>
  name: <human-readable name>
  pools:
    - id: <pool-id>
      name: <pool name>
      lanes:
        - id: <lane-id>
          name: <lane name>
          elements:
            - id: <element-id>
              type: <element type>
              name: <element name>
            # ...
        # ...
  flows:
    - id: <flow-id>           # optional; auto-generated if omitted
      from: <element-id>
      to: <element-id>
      condition: <expression>  # optional
      default: true|false      # optional
    # ...
```

No additional top-level keys are permitted. Validation is enforced by the JSON Schema at [`schemas/bpmn-dsl.schema.json`](../schemas/bpmn-dsl.schema.json) and rejected by the parser before compilation.

---

## 4. Process metadata

Every process has two required metadata fields:

| Field | Type | Constraints |
|---|---|---|
| `process.id` | string | Identifier — must match the pattern `^[A-Za-z][A-Za-z0-9_-]*$` |
| `process.name` | string | Free-form, must be non-empty |

The `id` is emitted as the `id` attribute of the root `<process>` element in the BPMN XML; `name` becomes the `name` attribute. The id is also used as a stable reference for tooling and is not changed by the compiler.

---

## 5. Pools

A pool represents a single participant in the process. The notation supports **exactly one pool per document** (constraint POOL-05; see Section 7 in [`../method/methodology.md`](../method/methodology.md)). This is a deliberate narrowing of the BPMN 2.0 spec, which permits multiple pools per collaboration. Multi-pool support is out of scope (see Section 12).

```yaml
pools:
  - id: company
    name: Company
    lanes:
      # ...
```

| Field | Type | Constraints |
|---|---|---|
| `id` | string | Identifier pattern; must differ from any element id and any lane id |
| `name` | string | Non-empty, free-form |
| `lanes` | array | At least one lane required |

The `pools` array must contain exactly one entry. Two or more entries cause a compile error.

---

## 6. Lanes

Lanes (a.k.a. swimlanes) partition a pool into horizontal bands, each typically representing a role or responsible system. Every element belongs to exactly one lane.

```yaml
lanes:
  - id: sales
    name: Sales
    elements:
      # ...
  - id: warehouse
    name: Warehouse
    elements:
      # ...
```

| Field | Type | Constraints |
|---|---|---|
| `id` | string | Identifier pattern; must differ from pool id and from any element id |
| `name` | string | Non-empty, free-form (rendered as the lane caption) |
| `elements` | array | At least one element required |

Order of lanes in the YAML determines vertical order of swimlanes in the rendered diagram (top to bottom).

---

## 7. Elements

An element is a node in the process graph. Seven element types are supported in this version of the notation:

| Type | BPMN 2.0 equivalent | Visual shape |
|---|---|---|
| `startEvent` | Start Event (none trigger) | Thin-bordered circle |
| `endEvent` | End Event (none result) | Thick-bordered circle |
| `task` | Generic Task | Rounded rectangle |
| `userTask` | User Task | Rounded rectangle with user icon |
| `serviceTask` | Service Task | Rounded rectangle with gear icon |
| `exclusiveGateway` | Exclusive Gateway (XOR) | Diamond with `×` marker |
| `parallelGateway` | Parallel Gateway (AND) | Diamond with `+` marker |

Each element is an object with these fields:

| Field | Type | Constraints |
|---|---|---|
| `id` | string | Identifier pattern; globally unique within the document |
| `type` | string | One of the seven enum values above |
| `name` | string | Required for tasks and gateways (non-empty); optional for events |

Example:

```yaml
elements:
  - id: start
    type: startEvent
  - id: receive-order
    type: task
    name: Receive Order
  - id: check-stock
    type: exclusiveGateway
    name: In stock?
  - id: end
    type: endEvent
```

Events (`startEvent`, `endEvent`) may omit `name` because their visual representation is unambiguous without a label. Tasks and gateways must carry a name.

### 7.1. Element semantics

- **`startEvent`** — entry point of the process. A process must contain at least one start event (rule SE-001). A start event has no incoming sequence flows (SE-003) and exactly one outgoing flow (SE-004).
- **`endEvent`** — exit point. A process must contain at least one end event (EE-001). An end event has no outgoing sequence flows (EE-003) and at least one incoming flow (EE-004).
- **`task`** / **`userTask`** / **`serviceTask`** — work performed in the process. The three subtypes differ only visually; semantically all are activities. Each task must have at least one incoming and one outgoing sequence flow (ACT-001), unless it is the sole element of a process.
- **`exclusiveGateway`** — XOR routing decision. When splitting (multiple outgoing flows), exactly one path is taken at runtime based on flow conditions; at most one outgoing flow may be marked as the default (GW-XOR-02). When joining (multiple incoming flows), the first arriving token activates the outgoing flow.
- **`parallelGateway`** — AND fork/join. When splitting, all outgoing flows are activated simultaneously; outgoing flows must not carry conditions (GW-AND-04). When joining, the gateway waits for all incoming tokens before proceeding.

A gateway with exactly one incoming and one outgoing flow is forbidden (GW-XOR-01) — use a sequence flow instead.

---

## 8. Sequence flows

Sequence flows connect elements within the pool, declared in the top-level `flows` array. Each flow is an object:

```yaml
flows:
  - id: f1                     # optional; auto-generated as Flow_1, Flow_2, ... if omitted
    from: start
    to: receive-order
  - id: f2
    from: check-stock
    to: pick-pack
    condition: 'in_stock == true'
  - id: f3
    from: check-stock
    to: notify-customer
    default: true
```

| Field | Type | Constraints |
|---|---|---|
| `id` | string | Optional. Auto-generated as `Flow_N` skipping any explicit `Flow_N` already in use |
| `from` | string | Required. Must reference an existing element id |
| `to` | string | Required. Must reference an existing element id; must differ from `from` (no self-loops) |
| `name` | string | Optional. Human-readable display label for the flow; rendered inline on the arrow in BPMN viewers |
| `condition` | string | Optional. Free-form expression text; may not appear together with `default: true` |
| `default` | boolean | Optional. Marks this flow as the default branch of an XOR split |

### 8.1. Flow constraints

- **No self-loops:** `from === to` is rejected by the parser (rule covered by SF-DUP and parser-level guard).
- **No duplicates:** two sequence flows with the same `(from, to)` pair are forbidden (SF-DUP / RD-099).
- **No cross-pool:** since the document has exactly one pool, all flow endpoints must reference elements in that pool (SF-001 / RD-100). The rule is enforced even though multi-pool is out of scope, to prevent regressions when multi-pool support is added later.

### 8.2. Conditions

A `condition` field may appear on flows whose source is an Activity (task / userTask / serviceTask) or an exclusive gateway (rule SF-005). Its value is treated as opaque expression text — the compiler emits it verbatim into a `<conditionExpression>` BPMN element. The expression language is not interpreted by Transitrix Studio; downstream tooling (process engines) is responsible for evaluation.

A condition cannot appear on:
- Flows from `startEvent`, `endEvent` (events do not branch).
- Flows from a `parallelGateway` split (rule GW-AND-04 — parallel splits activate all branches unconditionally).

### 8.2.1. Display labels vs. runtime conditions

The `name` and `condition` fields are independent and serve different purposes:

- **`name`:** A human-readable label rendered inline on the arrow in BPMN viewers. Examples: `"yes"`, `"approved"`, `"rejected"`. Visible to anyone reading the diagram.
- **`condition`:** A runtime expression evaluated by a process engine to determine if control flows through this arrow. Examples: `"amount > 1000"`, `"approved_by_manager == true"`. Not visible in the diagram (shown only in hover tooltips by some viewers).

Both may appear on the same flow. For example, a flow from a decision gateway might have `name: "yes"` for visual clarity and `condition: "stock_available == true"` for the process engine.

### 8.3. Default flow flag

The `default: true` flag marks a flow as the default branch of an XOR split. Default semantics:
- At most one default flow per gateway (GW-XOR-02).
- A default flow may not also carry a `condition` (SF-007).
- A default flow may originate only from an Activity or exclusive gateway (SF-006).

When multiple conditional flows leave an XOR gateway and none of their conditions evaluate to true, control falls through to the default flow. If no default exists in this situation, the token is lost — this is the runtime warning `AP-NO-DEFAULT` (see [`validation.md`](validation.md)).

In the emitted BPMN XML, the default flag is materialised as the `default="<flow-id>"` attribute on the parent gateway element.

### 8.4. Auto-generated flow identifiers

If a flow omits `id`, the compiler assigns one. Generation skips any explicit `Flow_N` already present in the document, so a user can mix explicit and auto-generated ids without collision.

---

## 9. Identifier rules

Every `id` in the document — for the process, pool, lanes, elements, and flows — must match the regular expression:

```
^[A-Za-z][A-Za-z0-9_-]*$
```

In words: starts with an ASCII letter, then any number of letters, digits, underscores, or hyphens. Spaces, dots, slashes, and Unicode letters are not allowed.

Uniqueness rules:

- Element ids are globally unique within the document.
- Lane ids must differ from pool ids and from any element id.
- Pool id must differ from any lane id and any element id.
- Flow ids are unique within the `flows` array.

Violations are caught by the parser before compilation and reported with the colliding identifier in the error message.

---

## 10. Validation layers

The compiler runs four layers of validation on each input. Each layer can block compilation independently. Full rule catalogue is in [`validation.md`](validation.md); the principles and methodology are in [`../method/methodology.md`](../method/methodology.md).

| Layer | Where | What |
|---|---|---|
| 1. Schema | `schemas/bpmn-dsl.schema.json`, AJV | YAML structure, allowed types, required fields, identifier patterns, single-pool constraint |
| 2. Structural | `src/parser.ts` | Identifier uniqueness, reference resolution, no self-loops |
| 3. Semantic | `src/validator.ts` | BPMN 2.0 rules: SE/EE/ACT/SF/GW/CONN — errors block emit |
| 4. XML conformance | `src/compiler.ts` (BpmnModdle round-trip) | Output XML must round-trip through `bpmn-moddle` without warnings |

In addition, anti-pattern checks (warnings, not errors) flag suspicious-but-valid structures: floating elements, missing default flow, implicit join, gateway used as task. Warnings are configurable via the optional `.transitrixrc` file at the repository root (legacy `.cervinrc` is still read as a fallback); errors are not configurable — they enforce BPMN-conformance and cannot be downgraded.

---

## 11. Reserved characters and escaping

YAML rules apply for string fields. In particular:

- Strings containing `:` should be wrapped in single or double quotes: `name: 'In stock: yes/no?'`.
- Strings starting with reserved YAML scalars (`yes`, `no`, `true`, `false`, `null`, `~`, numbers) should be quoted: `condition: 'yes'`, not `condition: yes`.
- The flow-style mapping `{ id: x, type: task, name: My Task }` is supported and preserves field order (use unquoted keys when no special characters are present).
- Multi-line strings are supported via `|` (literal) and `>` (folded) YAML scalars; Transitrix Studio does not insert them anywhere itself but accepts them in `name` and `condition` fields.

The compiler emits string content verbatim into XML, escaping XML-reserved characters (`<`, `>`, `&`, `"`, `'`) automatically.

---

## 12. Out of scope (BPMN 2.0 features not in this notation)

The following BPMN 2.0 features are **not** supported by the current notation. Documents using them either fail schema validation (unknown enum values) or are silently rejected at parser level.

- **Multi-pool collaborations.** Exactly one pool per document is enforced.
- **Sub-processes** (collapsed or expanded), call activities, ad-hoc sub-processes.
- **Inclusive gateway** (`OR`), **event-based gateway**, **complex gateway**.
- **Boundary events** (interrupting or non-interrupting), attached to activities.
- **Message events** (start, intermediate, end), **timer events**, **signal events**, **error events**, **escalation events**, **compensation events**.
- **Message flows** between pools (would require multi-pool support first).
- **Data objects**, **data stores**, **data inputs/outputs**, **data associations**.
- **Receive task**, **send task**, **manual task**, **business rule task**, **script task** (only `task`, `userTask`, `serviceTask` are supported).
- **Lane sets** (nested lanes within lanes).
- **Annotations**, **groups**, **text annotations**, **associations**.
- **`extensionElements`** for custom metadata.

Adding any of these requires expanding the schema, parser, validator, layout engine, and emitter in coordinated changes. Such extensions are tracked as future phases in [`../roadmap.md`](../roadmap.md) when business need arises.

---

## 13. Examples

### 13.1. Minimal process

The smallest valid process: one start event, one end event, one flow connecting them.

```yaml
process:
  id: minimal
  name: Minimal
  pools:
    - id: company
      name: Company
      lanes:
        - id: main
          name: Main
          elements:
            - id: start
              type: startEvent
            - id: end
              type: endEvent
  flows:
    - from: start
      to: end
```

### 13.2. Single-lane with gateway

A linear process with an XOR decision and a default branch.

```yaml
process:
  id: order-check
  name: Order Check
  pools:
    - id: company
      name: Company
      lanes:
        - id: sales
          name: Sales
          elements:
            - id: start
              type: startEvent
            - id: receive-order
              type: task
              name: Receive Order
            - id: check-stock
              type: exclusiveGateway
              name: In stock?
            - id: pick-pack
              type: task
              name: Pick and Pack
            - id: notify-customer
              type: task
              name: Notify Customer
            - id: end
              type: endEvent
  flows:
    - from: start
      to: receive-order
    - from: receive-order
      to: check-stock
    - from: check-stock
      to: pick-pack
      condition: 'in_stock'
    - from: check-stock
      to: notify-customer
      default: true
    - from: pick-pack
      to: end
    - from: notify-customer
      to: end
```

### 13.3. Multi-lane with cross-lane flows and parallel split

A pipeline-style process showing typical multi-lane structure.

```yaml
process:
  id: release-pipeline
  name: Release Pipeline
  pools:
    - id: pipeline
      name: Release Pipeline
      lanes:
        - id: dev
          name: Development
          elements:
            - id: feature-ready
              type: startEvent
            - id: run-tests
              type: task
              name: Run Unit Tests
            - id: tests-pass
              type: exclusiveGateway
              name: Tests pass?
            - id: build
              type: task
              name: Build Package
        - id: qa
          name: QA
          elements:
            - id: manual-test
              type: userTask
              name: Manual Testing
            - id: regression
              type: task
              name: Regression Suite
        - id: ops
          name: DevOps
          elements:
            - id: deploy-start
              type: parallelGateway
              name: Deploy Start
            - id: health-check
              type: serviceTask
              name: Health Check
            - id: deploy-staging
              type: serviceTask
              name: Deploy to Staging
            - id: deploy-complete
              type: parallelGateway
              name: Deploy Complete
            - id: promote
              type: task
              name: Promote to Production
            - id: released
              type: endEvent
  flows:
    - from: feature-ready
      to: run-tests
    - from: run-tests
      to: tests-pass
    - from: tests-pass
      to: build
      condition: 'passed'
    - from: tests-pass
      to: released
      default: true
    - from: build
      to: manual-test
    - from: manual-test
      to: regression
    - from: regression
      to: deploy-start
    - from: deploy-start
      to: health-check
    - from: deploy-start
      to: deploy-staging
    - from: health-check
      to: deploy-complete
    - from: deploy-staging
      to: deploy-complete
    - from: deploy-complete
      to: promote
    - from: promote
      to: released
```

This example illustrates: cross-lane sequence flows (Development → QA → DevOps), an XOR gateway with a default branch (`tests-pass` → `released` default), and a parallel split-and-join (`deploy-start` and `deploy-complete`). The compiler routes cross-lane flows through inter-lane channels and assigns distinct exit ports to gateway branches automatically.

---

## 14. Compilation

A `.bpmn.transitrix.yaml` file is compiled to BPMN 2.0 XML by:

```bash
cervin <input.bpmn.transitrix.yaml> <output.bpmn>
```

Or, for the full pipeline with metrics and validation reports:

```bash
cervin compile <input.bpmn.transitrix.yaml> <output.bpmn>      # default: validate + emit + metrics
cervin validate <input.bpmn.transitrix.yaml>                   # validation only, no emit
cervin metrics <input.bpmn.transitrix.yaml>                    # metrics only, no emit
```

The compiler runs in this order: **parse → validate → layout → emit → BPMN-moddle round-trip**. Errors at any stage block the emit. Warnings (anti-patterns) are reported but do not block.

The output `.bpmn` file is consumable by any BPMN 2.0–conformant tool. Example tools that have been verified to import the output: Camunda Modeler, bpmn.io online viewer, `bpmn-js` library.

---

## 15. Versioning of this notation

The notation is versioned together with the project (semver in `package.json`). Backward-incompatible changes (renaming or removing fields, tightening identifier rules, removing element types) require a major version bump and a migration note.

Current version: see the project root `package.json`.

For the changelog of notation changes, see [`../roadmap.md`](../roadmap.md) (in particular Phase 12 RD-105 added the `default` flag on flows in 2026-05-04).
