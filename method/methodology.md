# Transitrix Studio — BPMN Methodology Notes

**Version:** 0.4.0
**Date:** 2026-05-03
**Scope:** Unified project methodology — core principle, audit of current state, validation and layout methodology, routing rules (R1–R6, L1), and the BPMN 2.0 rule catalogue for the validator.
**Related:** [`../roadmap.md`](../roadmap.md), [`../README.md`](../README.md), [`../glossary.md`](../glossary.md)

---

## 1. Core idea

Process diagrams should be written, not drawn. A diagram is a structured artifact with a defined grammar and deterministic layout rules. Treating it as text makes it versionable, reviewable, and automatable.

How we implement it:

1. **Text DSL.** Processes are described in minimal YAML: pools, lanes, typed elements, named flows. No coordinates, no styling — structure only.
2. **Compilation pipeline.** YAML is parsed into an IR, laid out by a four-phase algorithm (global ELK pass for X, per-lane ELK for Y, assembly with axis snapping, geometric routing), and emitted as BPMN 2.0 XML.
3. **Layout as a quality contract.** A priority-ordered rule set (R1–R6, L1; see Section 6) ensures backward loops arc clear of forward flows, gateway exits use distinct vertices, and elements snap to swimlane axes — so the output needs no manual graphical adjustment.
4. **Open output.** BPMN 2.0 XML is consumable by any compliant tool; no lock-in to any embedded viewer.

---

## 2. Governing principle (validation)

**Local validation rules must not contradict the global BPMN 2.0 standard.**

Every validation rule in the project — whether in JSON Schema, the IR layer, as an anti-pattern check, or a Transitrix-specific requirement — must either reproduce a rule from the OMG BPMN 2.0 specification (formal/2013-12-09) or **narrow** it. Narrowing is allowed: for example, "exactly one pool per document" (POOL-05 in Section 7) is a narrowing of POOL-01. Extending beyond BPMN 2.0 is allowed, provided the additions do not contradict the standard. Permitting what BPMN 2.0 forbids, or relaxing the standard's base invariants, is not allowed.

If a case arises where it seems convenient to "locally permit" something that BPMN 2.0 prohibits, that is a signal to do one of:

1. Separate the functionality into a distinct non-BPMN format (in that case we do not call the output "BPMN 2.0 XML").
2. Use the standard BPMN extension mechanism (`extensionElements`) — but this must not break round-trip parsing by third-party tools.
3. Acknowledge that our subset simply does not cover this scenario and leave it as a known limitation.

This precedence rule is applied when reviewing every new validation rule.

---

## 3. Current state — audit (2026-05-03)

### 3.1. What exists and in what state

The codebase is compact: ~1700 lines of TypeScript in `src/`, plus the VS Code extension, web UI, and tests. Dependencies include everything needed for serious validation and layout: `elkjs`, `ajv`/`ajv-formats`, `xmlbuilder2` in production; `bpmn-moddle ^10` and `bpmn-js ^18` in devDependencies. 74 tests across 7 files pass. Design decisions are recorded in Sections 6–7 of this document. Section 7 already contains a neatly numbered set of BPMN 2.0 rules (SE-01..05, EE-01..03, SF-01..07, GW-XOR/AND/INC/EVT, ACT, SUB, POOL, MF, BE, CONN, anti-patterns) — but **as documentation only, not as code**.

### 3.2. Current validation — what is actually checked

Three layers of checks currently exist in code, all of them syntactic/structural rather than semantic:

**Layer 1 — JSON Schema for the YAML DSL** (`schemas/bpmn-dsl.schema.json`, AJV, `parser.ts:18-58`). Regexps on IDs, the set of allowed `type` values (7: `startEvent`, `endEvent`, `task`, `userTask`, `serviceTask`, `exclusiveGateway`, `parallelGateway`), `additionalProperties: false`, the "exactly one pool" constraint (`maxItems: 1`), `name` required on all non-event elements.

**Layer 2 — Structural integrity** (`parser.ts:60-141`). Uniqueness of element and flow IDs, no ID collision between pool/lane/element scopes, `from`/`to` references must exist, explicit self-loop rejection (`from === to`).

**Layer 3 — Round-trip XML conformance**, but only as a test assertion (`tests/integration.test.ts:486-499`): `BpmnModdle.fromXML` must not emit warnings. This checks BPMN 2.0 well-formedness, not semantics.

What is **missing**:

- Not a single rule from Section 7 is checked: SE-01 ("process must have at least one Start"), EE-01, SF-05/06/07 (conditional/default flow rules), GW-XOR-02 (one default + all others with conditions), GW-AND-04 (no conditions on parallel split), ACT-01 (isolated tasks), CONN-01..03 (reachability and connectivity).
- No anti-pattern detector: floating elements, missing default flow, implicit join, duplicate flow, gateway-as-task.
- No validation report returned by the CLI or API. Currently it is either "all good" or one AJV/Error message.

The `lint.py` referenced in older project documentation validates ArchiMate element references (ROLE-XXX/APP-XXX), not BPMN — so BPMN semantic validation is genuinely absent.

### 3.3. Layout algorithm — what works, what does not

The four-phase pipeline design is correct and well-documented. R1–R6 + L1 (Section 6) are codified and covered by unit tests. Basic correctness is in place: cross-lane X-alignment, U-turn for backward flows, port distribution for gateway splits, swimlane axis snap.

Where "alignment and optimisation" specifically breaks (per the project's own analysis):

a) **Main visual defect, tracked as RD-055:** large empty horizontal bands in lanes whose elements are shifted far to the right due to column alignment across lanes (`feature-release.cervin.yaml`, `promote-staging` sits to the right of a wide empty band). This is a structural consequence of the Phase 1 layout algorithm: the global ELK pass assigns one X column to all connected elements across all lanes. A lane with a single "isolated" right element gets empty space to its left.

b) Until recently there were no numerical quality metrics. Phase 11 in the roadmap closed the main infrastructure — `crossings`, `bends`, `edgeLength`, `spineDeviation`, `emptyArea`, `portViolations`, `portUniqueness`, `laneAxisAlignment` (see `../docs/metrics.md`). Still open: surfacing channels (RD-091..095) and baseline analysis (RD-090).

c) RD-054 (acceptance criteria for "no manual edit required") was specified as prose — spine alignment, horizontal port rule, avoid crossings, gateway port distribution — and is now automated via `tests/metrics-regression.test.ts` (RD-089).

d) No compaction pass between Phase 3 and Phase 4. Alignment happens, but there is no mechanism to absorb artificial empty space.

e) No visual regression (render to SVG + snapshot diff).

f) Schema file is duplicated: `schemas/bpmn-dsl.schema.json` and `extension/schemas/bpmn-dsl.schema.json` — drift risk (addressed in RD-098).

### 3.4. Tests — coverage

Files: `cli-parse`, `http-body-limit`, `integration` (main — 500 lines), `layout-options`, `metrics`, `metrics-regression`, `serve-ui`. Covered: parser (syntax, duplicate IDs, single pool), layout (geometry for each element, cross-lane X-invariance, U-turn, port distribution for XOR split, minimal diagram), metrics (structural and BPMN-specific), and round-trip with `bpmn-moddle`.

Not covered: no test for any BPMN semantic rule (target of Phase 12), no visual regression snapshots, no stress diagrams (large graphs), no test for "semantically broken" inputs (XOR without default, isolated tasks).

---

## 4. Validation methodology

Five-level funnel. Each rule gets a stable ID, references the corresponding rule in Section 7 (or in the BPMN 2.0 spec if not yet documented), errors and warnings are separated, rule names are in English, and messages may be localised. Everything is subordinate to the base principle in Section 2 — do not contradict BPMN 2.0.

### 4.1. Level 1 — Lexical (exists, needs polish)

AJV on the YAML DSL — current state. Goal: 100% well-formed YAML passes; 100% malformed receives a precise error message.

To add: symmetric update of `extension/schemas/bpmn-dsl.schema.json` (or symlink/import from a single source) to eliminate schema drift (RD-098).

### 4.2. Level 2 — Structural integrity (exists, extend)

ID uniqueness, reference resolution, absence of self-loops — already implemented.

To add: ban on duplicate flows (same `from`→`to` pair), ban on cross-pool references (only one pool currently, but the rule will be useful for multi-pool processes in future).

### 4.3. Level 3 — BPMN 2.0 semantics (new module `src/validator.ts`)

Runs after `parseYamlToIr`, before `layoutProcess`. For the current element subset, implement and tag with rule IDs from Section 7:

- SE-01, SE-03, SE-04 — at least one Start; Start has no incoming; Start has exactly one outgoing.
- EE-01, EE-02 — at least one End; End has no outgoing.
- ACT-01 — Task has ≥1 incoming and ≥1 outgoing (exception: sole element in the process).
- GW-XOR-01 — XOR with one incoming and one outgoing is forbidden.
- GW-XOR-02 — when splitting: exactly one outgoing may be Default; all others must have conditions.
- GW-AND-04 — parallel split outgoing flows must not carry `condition`.
- SF-05, SF-06, SF-07 — `condition` only from Activity or XOR/Inclusive; Default has no condition.
- POOL-05 — one pool per document (already enforced by schema).
- CONN-01, CONN-02, CONN-03 — all elements reachable from Start and can reach End; graph is weakly connected.

Each rule returns `{ ruleId, severity: 'error' | 'warning', message, elementIds[] }`. Errors block emit; warnings do not. A `.cervinrc` file may disable individual rules per project, but **only those with severity=warning** — disabling errors that ensure BPMN conformance is not permitted (this would violate the principle in Section 2).

### 4.4. Level 4 — Anti-patterns (warnings)

Floating elements (CONN-01 violated in both directions), missing default flow on conditional split (warning on top of GW-XOR-02), implicit join (multiple incoming flows into a Task without a gateway), duplicate flow, gateway-as-task (label heuristic: if a gateway is labelled with a verb like "Validate" or "Approve" — warn that gateways are routing constructs only).

### 4.5. Level 5 — Output XML conformance (exists, formalise)

Promote the existing `BpmnModdle.fromXML` from test assertion into a stage of the `compileCervinYaml` pipeline: if warnings/errors appear — treat it as a blocking emitter error (meaning the tool generated invalid BPMN, or a bug was found). Optionally connect `bpmnlint` as a second opinion; its rules are compatible in spirit with those in Section 7.

### 4.6. Methodological layer (optional, Transitrix-specific)

Reference checks for `ROLE-XXX-001`, `APP-XXX-001` belong to a separate ArchiMate integration tool, distinct from BPMN validation. Not mixed here, but an explicit hook is provided for integration.

### 4.7. Diagnostic delivery

`ValidationReport` is rendered:

- CLI — text output with links to rule IDs.
- HTTP API — JSON.
- VS Code preview — diagnostics in the Problems panel and highlighting of the corresponding YAML fragments (via positions from `js-yaml`'s `YAMLException` + our own source map for IR elements).

---

## 5. Layout methodology

The main problem, as visible from the audit, is the **absence of objective quality metrics**. Any optimisation without metrics is movement with eyes closed. So: instrument first, then optimise.

### 5.1. Step 1 — Quality metrics (instrument first)

For each `LayoutIr`, compute and return (or at least log with `--debug`) a set of numbers:

- `crossings` — number of edge segment intersections.
- `bends` — total bend count.
- `edgeLength` — total Manhattan length.
- `emptyArea` — for each lane, the fraction of its bounding-box area occupied by no element (the core RD-055 pain point).
- `spineDeviation` — for each lane, the maximum deviation of "spine" elements (those on the happy path) from the swimlane axis.
- `portViolations` — number of flows whose endpoints are not on the left/right face (allowing top/bottom for cross-lane up/down).

All metrics are deterministic functions of `LayoutIr` and compute cheaply. Full definitions and pseudocode in `../docs/metrics.md`.

### 5.2. Step 2 — Acceptance criteria → automated tests

RD-054 is translated from prose into Vitest assertions on reference diagrams:

- Spine alignment: ≥80% of elements per lane lie within ±4 px of the axis.
- Horizontal port rule: 0 violations on same-lane flows; cross-lane up/down is the only permitted exception.
- Crossings ≤ baseline (the current value is fixed as the budget).
- `emptyArea` tracked as a diagnostic, without a blocking threshold; for multi-lane vertical-pipeline processes 60–80% is a structural norm (RD-055 variant C, 2026-05-04).

From this point, any layout change is visible through metric deltas.

### 5.3. Step 3 — Engine improvements (by expected impact, descending)

a) **Column compaction (target RD-055).** Between Phase 3 step C and step D, add a compaction step: if a lane has an "isolated" element (no shared X columns with occupied columns in other lanes to its left), shift it left without breaking cross-lane alignment with the elements it is actually connected to by flow. This directly attacks the main visible defect.

b) **Port constraints passed to ELK.** Currently ELK waypoints are discarded and routing is rewritten manually. An alternative is to declare `elk.portConstraints: FIXED_SIDE` for gateways and `elk.layered.portSortingStrategy` on sides — ELK would handle much of R1–R6 natively. The volume of custom code would shrink substantially; regressions would be more localised.

c) **Compound graph instead of two passes.** ELK supports hierarchical graphs: pool → lanes → elements in a single pass with `elk.spacing.componentComponent`. The two-phase X/Y separation was necessary in an earlier version; reverting to the native model and benchmarking is worth exploring.

d) **Multi-seed selection (RD-049).** Once metrics exist — run ELK 2–3 times with different `randomSeed` values and pick the run with the lowest `crossings + α·emptyArea`.

e) **Spine pass.** Guarantee that the longest path through each lane shares a single Y coordinate; the current axis snap only works for elements alone in their column.

### 5.4. Step 4 — Visual regression

Render the output BPMN via headless `bpmn-js` (or direct ELK→SVG) → PNG/SVG snapshots in `tests/snapshots/`. Diff on PR. Without this, none of steps 1–3 can reliably avoid silent regressions.

### 5.5. Step 5 — Fallback plan (RD-051/052)

If, after a fixed budget (two to three weeks), metrics and acceptance criteria are not met, switch to an "embed editor" strategy: bpmn-js Modeler as editor after auto-layout. Auto-layout remains as an initial layout; the user adjusts complex cases manually. This is already recorded as a contingency in the roadmap.

### 5.6. Step 6 — Stress tests on large diagrams

30+, 60+, 100+ elements, 5+ lanes. The current corpus (`examples/bpmn/corpus/`) partially covers this direction; the target is 12–18 diagrams across a stratified coverage matrix (RD-080..082).

---

## 6. Routing rules (enforced by layout engine)

Rules are applied in the order listed. A higher-priority rule wins when two rules conflict. Do not reorder without explicit approval. Implementation: `src/layout.ts`.

### 6.1. R1 — Backward flows use U-turn routing

**Trigger:** `target.right < source.left` (target element is to the left of the source).

**Gateway source — left-side arc:**
Exits the LEFT vertex of the gateway. Arcs left past both elements. Enters the LEFT face of the target. Using the left vertex prevents the backward arc from clashing with the TOP/BOTTOM vertices that the port-distribution logic (R2 / R4) may assign to other outgoing flows of the same gateway.

```
arcX = min(from.x, to.x) − BACKWARD_LOOP_CLEARANCE_PX   // 32 px left of both elements
path = [from.left-centre, (arcX, from.cy), (arcX, to.cy), to.left-centre]
```

**Non-gateway source — top-arc:**
Exits the top-centre of the source. Arcs above both elements. Enters the top-centre of the target.

```
arcY = min(from.y, to.y) − BACKWARD_LOOP_CLEARANCE_PX   // 32 px above both elements
path = [from.top-centre, (from.cx, arcY), (to.cx, arcY), to.top-centre]
```

**Cross-lane backward (any source type):**

```
arcX = min(from.x, to.x) − BACKWARD_LOOP_CLEARANCE_PX
path = [from.left-centre, (arcX, from.cy), (arcX, to.cy), to.left-centre]
```

### 6.2. R2 — Gateway same-lane forward flows: unique vertex per exit

**Trigger:** source is a gateway (`exclusiveGateway` | `parallelGateway`), flow is forward, source and target are in the same lane, gateway has ≥ 2 same-lane forward flows.

Each exit of a gateway represents a distinct decision branch. No two forward flows from the same gateway may share the same exit vertex.

**Assignment (by target centre-Y relative to gateway centre-Y):**

```
GATEWAY_VERTEX_THRESHOLD_PX = 10

above  = flows where target.cy < gateway.cy − threshold   // sorted by target.cy ascending
below  = flows where target.cy > gateway.cy + threshold   // sorted by target.cy descending
level  = remaining flows

// Most-extreme target in each group claims the dedicated vertex:
if above.length > 0:
  flowExitPort[above[0].id] = 'top'         // furthest-above target → TOP vertex
  above[1..] → right vertex with negative Y-offsets (spread)

if below.length > 0:
  flowExitPort[below[0].id] = 'bottom'      // furthest-below target → BOTTOM vertex
  below[1..] → right vertex with positive Y-offsets (spread)

// Level flows share the right vertex with Y-offset spread:
if level.length > 1:
  totalSpread = (level.length − 1) × MULTI_EXIT_OFFSET_STEP_PX   // 8 px per step
  flowExitYOffset[level[i].id] = −totalSpread/2 + i × MULTI_EXIT_OFFSET_STEP_PX
```

For a gateway with only 1 same-lane forward flow, the default right-exit is used with no offset.

### 6.3. R3 — All forward arrows enter shapes from the LEFT vertex

**Trigger:** all forward flows (non-backward).

```
entry_point = (target.x, target.cy)   // portPoint(target, 'left')
```

No exception for gateways, events, or tasks. The final segment of every forward path must be a left-to-right horizontal line arriving at `target.left-centre`.

### 6.4. R4 — Cross-lane gateway flows exit toward the target lane

**Trigger:** source is a gateway, source and target are in **different** lanes, flow is forward, target not clearly to the left.

```
if target_lane is below source_lane:
  exit_port = 'bottom'
  exit_point = (source.cx, source.bottom)   // bottom vertex of diamond

else if target_lane is above source_lane:
  exit_port = 'top'
  exit_point = (source.cx, source.top)      // top vertex of diamond
```

This makes the first segment head directly toward the destination lane so the cross-lane channel (R5) is reached with one straight vertical segment.

### 6.5. R5 — Cross-lane flows route through the adjacent lane gap

**Trigger:** source and target are in different lanes, flow is forward (non-backward).

```
if target is below source lane:
  chanY = fromLane.bottom + laneVerticalGap / 2   // gap just below source lane

else:
  chanY = fromLane.top − laneVerticalGap / 2      // gap just above source lane

// right-exit path (non-gateway, or gateway with R4 top/bottom already handled):
approachX = target.x − GATEWAY_BRANCH_CLEARANCE_PX
path = [exit_point,
        (approachX, exit_point.y),   // horizontal to approach column
        (approachX, target.cy),      // vertical to target centre Y
        (target.x,  target.cy)]      // enter left

// WRONG formula: chanY = (fromLane.bottom + toLane.top) / 2
//   → lands inside intermediate lanes when source and target are not adjacent
```

### 6.6. R6 — Minimum bends

**Trigger:** all flows, after R1–R5 have determined the exit vertex and entry point.

Choose the path with the fewest bends consistent with the fixed endpoints:

```
// 0 bends — straight line:
if |exit.y − entry.y| < 1 px  →  [exit, entry]

// 2 bends — late-elbow (small Y delta):
if |exit.y − entry.y| < GATEWAY_BRANCH_CLEARANCE_PX (20 px):
  approachX = entry.x − GATEWAY_BRANCH_CLEARANCE_PX
  path = [exit, (approachX, exit.y), (approachX, entry.y), entry]
  // reason: keeps the long horizontal segment straight; bend near target

// 2 bends — S-curve (general right exit):
midX = (exit.x + entry.x) / 2
path = [exit, (midX, exit.y), (midX, entry.y), entry]

// 1 bend — L-shape (top/bottom exit, R4):
path = [exit, (exit.x, entry.y), entry]
```

Adding a bend that is not required by the geometry is a rule violation.

### 6.7. L1 — Swimlane axis alignment (Phase 3 Step D)

**Trigger:** element is the only item in its X column within its lane (not stacked).

The **swimlane axis** is the horizontal centreline of the lane: `axisY = lb.y + lb.height / 2`.
Single-column elements are snapped so their vertical centre aligns with the axis.

```
axisY = lb.y + lb.height / 2
snapMinY = lb.y + BACKWARD_LOOP_CLEARANCE_PX               // 32 px hard margin
snapMaxY = lb.y + lb.height − element.height − BACKWARD_LOOP_CLEARANCE_PX
if snapMinY > snapMaxY:                                    // lane too compact
  snapMinY = lb.y + 4
  snapMaxY = lb.y + lb.height − element.height − 4        // 4 px soft margin
element.y = clamp(axisY − element.height / 2, snapMinY, snapMaxY)
```

When elements in adjacent lanes share the same ELK column and both lie on their axes, the cross-lane flow between them is a zero-bend straight horizontal line.

### Key constants

```typescript
CROSS_LANE_EDGE_OVERLAP_EPSILON_PX = 4    // overlap tolerance for backward/cross-lane detection
BACKWARD_LOOP_CLEARANCE_PX = 32           // arc clearance above/left of elements for backward flows
MULTI_EXIT_OFFSET_STEP_PX = 8             // Y-spread step between concurrent right exits
GATEWAY_BRANCH_CLEARANCE_PX = 20          // late-elbow approach distance from target
GATEWAY_VERTEX_THRESHOLD_PX = 10          // threshold for classifying target as above/below gateway
```

### Key layout defaults (`src/layout-options.ts`)

```typescript
poolPad: 40, poolOriginX: 12, poolOriginY: 12
participantLabelBand: 48, laneLabelWidth: 72
laneVerticalGap: 40, laneContentRightPad: 40
elkNodeSpacing: 52, elkLayerSpacing: 88, elkDiagramPadding: 44
```

---

## 7. BPMN 2.0 structural validation rules

Rules derived from the OMG BPMN 2.0 specification (formal/2013-12-09). These govern the structure of a valid BPMN 2.0 process graph and serve as a checklist when extending the parser/emitter and as the rule catalog for the validator (Section 4).

**Note on rule ID format.** This section uses the 2-digit format from the BPMN 2.0 specification (`SE-01`, `EE-01`, `SF-05`, `GW-XOR-02`, etc.). The implementation in `src/validator.ts` uses a 3-digit format (`SE-001`, `EE-001`, `SF-005`, `GW-XOR-02`, etc.) to provide room for adding Transitrix-specific sub-rules without colliding with future specification extensions. The mapping is 1:1 by leading prefix: `SE-01` → `SE-001`, `EE-02` → `EE-002`, `SF-05` → `SF-005`, and so on. See `docs/validation.md` for the implementation details and rule documentation.

### Start Events

| Rule | ID |
|---|---|
| A process must have at least one Start Event | SE-01 |
| A top-level (non-sub-process) process should have exactly one None Start Event | SE-02 |
| A Start Event must have no incoming Sequence Flows | SE-03 |
| A Start Event must have exactly one outgoing Sequence Flow | SE-04 |
| An interrupting Start Event inside a Sub-Process must have a trigger (Message, Timer, etc.) | SE-05 |

### End Events

| Rule | ID |
|---|---|
| A process must have at least one End Event | EE-01 |
| An End Event must have no outgoing Sequence Flows | EE-02 |
| An End Event may have one or more incoming Sequence Flows | EE-03 |

### Sequence Flows

| Rule | ID |
|---|---|
| A Sequence Flow must connect two elements within the same Pool (or both outside any Pool) | SF-01 |
| A Sequence Flow must not cross Pool boundaries (use Message Flows for that) | SF-02 |
| A Sequence Flow source and target must be distinct elements (no self-loops) | SF-03 |
| A Sequence Flow that connects an element in a Sub-Process to an element outside it is invalid (except Boundary Event compensation) | SF-04 |
| Conditional Sequence Flows may only originate from Activities or inclusive/exclusive Gateways | SF-05 |
| Default Sequence Flows may only originate from Activities or exclusive/inclusive Gateways | SF-06 |
| A Default Sequence Flow must not have a condition expression | SF-07 |

### Exclusive Gateway (XOR)

| Rule | ID |
|---|---|
| Exactly one incoming or one outgoing flow: use a simple Sequence Flow instead | GW-XOR-01 |
| When splitting: exactly one outgoing flow may be the Default; all others must have a condition | GW-XOR-02 |
| When splitting: exactly one path is taken at runtime (mutually exclusive conditions) | GW-XOR-03 |
| When joining: pass-through — the first token to arrive activates the outgoing flow | GW-XOR-04 |
| A gateway used as both split and join (multiple in + multiple out) is allowed but discouraged | GW-XOR-05 |

### Parallel Gateway (AND)

| Rule | ID |
|---|---|
| When splitting: all outgoing Sequence Flows are activated simultaneously | GW-AND-01 |
| When joining: the gateway waits for ALL incoming flows before proceeding | GW-AND-02 |
| Parallel split and parallel join must be balanced in the same process scope | GW-AND-03 |
| Outgoing flows from a parallel split must not carry condition expressions | GW-AND-04 |

### Inclusive Gateway (OR)

| Rule | ID |
|---|---|
| When splitting: one or more outgoing flows are activated based on conditions | GW-INC-01 |
| At least one condition must evaluate to true (or a Default Flow must exist) | GW-INC-02 |
| When joining: the gateway waits for all activated incoming paths before proceeding | GW-INC-03 |
| All non-default outgoing flows must have a condition expression | GW-INC-04 |

### Event-Based Gateway

| Rule | ID |
|---|---|
| Must have exactly one incoming Sequence Flow | GW-EVT-01 |
| Must have two or more outgoing Sequence Flows | GW-EVT-02 |
| Each outgoing flow must target a Catching Intermediate Event or a Receive Task | GW-EVT-03 |
| Outgoing flows must not carry condition expressions | GW-EVT-04 |

### Activities (Tasks and Sub-Processes)

| Rule | ID |
|---|---|
| An Activity must have at least one incoming and one outgoing Sequence Flow (unless it is the sole element of a process) | ACT-01 |
| A Task must not contain child elements (use a Sub-Process for composition) | ACT-02 |
| A Receive Task used as the target of an Event-Based Gateway must not have any incoming Message Flows | ACT-03 |
| A Call Activity must reference a valid called element (Process or Global Task) | ACT-04 |

### Sub-Processes

| Rule | ID |
|---|---|
| A Sub-Process must contain at least one Start Event and one End Event | SUB-01 |
| A Sub-Process must form a connected graph (all elements reachable from the Start Event) | SUB-02 |
| Sequence Flows may not cross the Sub-Process boundary except via Boundary Events | SUB-03 |
| An Ad-Hoc Sub-Process must not have Start or End Events | SUB-04 |

### Pools and Lanes

| Rule | ID |
|---|---|
| Each element must belong to at most one Pool | POOL-01 |
| A Lane may not contain other Lanes at the same nesting level (use lane sets for hierarchical lanes) | POOL-02 |
| Sequence Flows may not cross Pool boundaries | POOL-03 |
| All elements within a Pool that participate in flows must be reachable from the Pool's Start Event | POOL-04 |
| **Transitrix Studio-specific:** exactly one Pool per DSL document is enforced by the schema | POOL-05 |

### Message Flows

| Rule | ID |
|---|---|
| A Message Flow must connect elements in different Pools | MF-01 |
| A Message Flow source must be a Pool, a Participant, a Flow Object (Task, Sub-Process, Event) that is a sender | MF-02 |
| A Message Flow target must be a Pool, a Participant, or a Flow Object that is a receiver | MF-03 |
| A Message Flow must not connect two elements in the same Pool | MF-04 |

### Boundary Events

| Rule | ID |
|---|---|
| A Boundary Event must be attached to an Activity (Task or Sub-Process) | BE-01 |
| An interrupting Boundary Event cancels the host Activity when triggered | BE-02 |
| A non-interrupting Boundary Event does not cancel the host Activity | BE-03 |
| A Boundary Event must have exactly one outgoing Sequence Flow | BE-04 |
| A Boundary Event must have no incoming Sequence Flows | BE-05 |

### Process Connectivity

| Rule | ID |
|---|---|
| Every element in a process must be connected (directly or transitively) to at least one Start Event and one End Event | CONN-01 |
| A process graph must be weakly connected — no isolated islands | CONN-02 |
| Every Sequence Flow source must have the targeted element reachable via at least one path | CONN-03 |

### Common Anti-Patterns (errors that pass schema validation but violate BPMN semantics)

| Anti-Pattern | Description |
|---|---|
| Floating elements | Elements with no incoming or outgoing Sequence Flows (orphans) |
| Missing default flow | Exclusive/Inclusive Gateway with multiple conditional outgoing flows and no Default Flow — if all conditions are false, the token is lost |
| Deadlock | Parallel join waiting for a flow that is never produced in a given execution path |
| Livelock | Cycle with no exit condition — model can spin indefinitely |
| Implicit join | Multiple Sequence Flows arriving at a Task without a joining Gateway — each arriving token independently activates the Task |
| Duplicate flow | Two Sequence Flows connecting the same source–target pair |
| Unreachable element | Element that can never receive a token because all paths to it are blocked by impossible conditions |
| Gateway used as a task | A gateway with a label that implies work is performed — Gateways are routing constructs only |

All validation rules added to the project based on this methodology must be reviewed for compliance with the principle in Section 2: a local rule must not contradict the global BPMN 2.0 standard.

Concrete implementation tasks are tracked in [`../roadmap.md`](../roadmap.md).
