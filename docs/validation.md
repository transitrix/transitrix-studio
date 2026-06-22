# BPMN 2.0 Validation Rules

## Overview

The Transitrix Studio validator provides **3 layers of validation**:

| Layer | Mechanism | Coverage | Implementation |
|-------|-----------|----------|-----------------|
| L1 | AJV schema validation | YAML type safety, required fields | `src/parser.ts` |
| L2 | IR structural validation | Pool/lanes exist, element counts, IDs unique | `src/validator.ts` (RD-096) |
| L3 | Semantic BPMN rules | Start event exists, event types valid, gateway constraints | RD-097 onward |

Validation is **non-blocking**: findings are surfaced in the API, CLI, and web UI, but do not prevent compilation.

## Validation scope (file vs repo)

Validation runs on one execution axis — **`scope`** (methodology ADR
`2026-06-11-validation-two-axis-model.md`; Studio referencing ADR
[`decisions/2026-06-11-validation-runtime-convergence.md`](decisions/2026-06-11-validation-runtime-convergence.md)):

| Scope | Command | Coverage |
|-------|---------|----------|
| **file** (default) | `transitrix validate <input.yaml>` | A single notation file: the BPMN structural/semantic rules documented below. |
| **repo** | `transitrix validate --scope=repo [--root <dir>]` | The whole loaded `canon/` model: referential integrity, atomicity, id uniqueness, policy. |

`--scope=repo` ports the whole-repo checks previously owned by the methodology's
Python `.validators/lint.py` onto the shared `@transitrix/diagrams` model
(`packages/diagrams/src/repo-validate/`), so there is a single validation
runtime. It scans `<root>/canon/elements/**` (elements) and
`<root>/canon/relations/**` (relations), then reports findings shaped
`{ scope, id, message }`. Any finding exits non-zero — the CI gate.

Repo-scope checks (parity reference: the `acme_corp` worked example, which
passes with zero findings):

- **YAML syntax** — an unparseable canon file is reported and graph checks are skipped.
- **ID uniqueness** — the same `id` defined in more than one file.
- **Atomicity** — an element file carrying an inline `relations:` section (relations belong in `canon/relations/`).
- **Referential integrity** — a relation endpoint (`from`/`to`, or the legacy `source`/`target`) that does not resolve to a known element.
- **Policy** — an element marked `Active`/`Production` (`metadata.status`) with no `metadata.owner`.
- **ArchiMate layer-semantics** — *deferred* (lint.py ships this as a no-op stub; ported faithfully as a no-op until the methodology defines the rules).

```
$ transitrix validate --scope=repo --root organizations/acme_corp
✓ organizations/acme_corp — repo-scope validation passed
```

The richer `target`/`category` finding taxonomy is intentionally **not** adopted
yet (deferred per the ADR until a consumer needs it).

## Rule Categories

Rules are organized by element category using stable ID prefixes:

- **SE-NNN**: Structural Elements (pool, lanes, swimlanes)
- **EE-NNN**: Event Elements (start, end, intermediate catch/throw)
- **GW-NNN**: Gateway Elements (XOR, AND, OR, event-based, etc.)
- **ACT-NNN**: Activity Elements (tasks, sub-processes, call activities)
- **SF-NNN**: Sequence Flows (connections, routing, edge cases)
- **CONN-NNN**: Connections and Ports (entry/exit port validation, overlap detection)
- **AP-NNN**: Anti-patterns (deadlocks, unreachable paths, livelock risk, etc.)

## Rule Severity

Each finding has a **severity level** indicating its impact:

| Severity | Meaning | Examples |
|----------|---------|----------|
| **error** | Blocking issue; invalid BPMN 2.0 or structural error. | Missing start event, invalid element type, duplicate IDs |
| **warning** | Advisory; conformance risk or style issue. | Unused element, risky gateway configuration, naming convention |
| **info** | Diagnostic; metrics, hints, or quality suggestions. | Layout density, performance estimate, style suggestion |

## Structural Rules (RD-096 Foundation)

**Pool existence** is enforced by the AJV schema during YAML parsing (layer L1). All BPMN 2.0 processes require at least one pool; the parser rejects any DSL that does not define a pool.

## Start Event Rules (RD-101)

Semantic validation for BPMN 2.0 start event constraints per **method/methodology.md** Section 7.

### SE-001: Process has at least one start event
- **Severity**: error
- **Description**: A BPMN 2.0 process must have at least one start event to define an entry point.
- **BPMN Rule**: Mandatory per BPMN 2.0 execution semantics (method/methodology.md SE-01).
- **Implementation**: Scans all lanes for elements with `type === 'startEvent'`. Fails if count is zero.
- **Remediation**: Add a start event element to the first lane. In BPMN YAML: `type: startEvent`.
- **Example Finding**:
  ```json
  {
    "ruleId": "SE-001",
    "severity": "error",
    "message": "Process must have at least one start event",
    "hint": "Add a start event to begin process flow"
  }
  ```

### SE-003: Start event has no incoming flows
- **Severity**: error
- **Description**: Sequence flows cannot target start events; they are process entry points with no predecessors.
- **BPMN Rule**: Per BPMN 2.0 specification (method/methodology.md SE-03), start events have no incoming flows.
- **Implementation**: For each start event, checks if any flow has `to === startEvent.id`. Fails if found.
- **Remediation**: Remove sequence flows that terminate at the start event. Start events are entry points only.
- **Example Finding**:
  ```json
  {
    "ruleId": "SE-003",
    "severity": "error",
    "elementId": "start-1",
    "message": "Start event \"Process Start\" must not have incoming flows",
    "hint": "Remove flows targeting this start event"
  }
  ```

### SE-004: Start event has exactly one outgoing flow
- **Severity**: error
- **Description**: Each start event must have exactly one outgoing flow to initiate the process with deterministic routing.
- **BPMN Rule**: Per BPMN 2.0 specification (method/methodology.md SE-04), a start event is a single point of entry.
- **Implementation**: For each start event, counts flows with `from === startEvent.id`. Fails if count ≠ 1.
- **Remediation**: 
  - If 0 outgoing: Connect the start event to the first activity with a sequence flow.
  - If >1 outgoing: Use a gateway (XOR, AND, etc.) after the start event for branching logic.
- **Example Findings**:
  ```json
  {
    "ruleId": "SE-004",
    "severity": "error",
    "elementId": "start-1",
    "message": "Start event \"Process Start\" must have exactly one outgoing flow (found 0)",
    "hint": "Add a flow from this start event to the first process activity"
  }
  ```
  ```json
  {
    "ruleId": "SE-004",
    "severity": "error",
    "elementId": "start-1",
    "message": "Start event \"Process Start\" must have exactly one outgoing flow (found 2)",
    "hint": "Remove 1 extra flow(s) from this start event"
  }
  ```

## End Event Rules (RD-102)

Semantic validation for BPMN 2.0 end event constraints per **method/methodology.md** Section 7.

**Numbering note:** Code implements end-event rules as `EE-001`, `EE-003`, `EE-004` (no `EE-002`). Per BPMN 2.0 spec, these map to spec IDs `EE-01`, `EE-02`, `EE-03` respectively (removed stub `EE-002` in RD-128). The 3-digit format allows room for Transitrix-specific sub-rules without colliding with future spec extensions.

### EE-001: Process has at least one end event
- **Severity**: error
- **Description**: A BPMN 2.0 process must have at least one end event to define process termination.
- **BPMN Rule**: Mandatory per BPMN 2.0 execution semantics (method/methodology.md EE-01).
- **Implementation**: Scans all lanes for elements with `type === 'endEvent'`. Fails if count is zero.
- **Remediation**: Add an end event element to a lane. In BPMN YAML: `type: endEvent`.
- **Example Finding**:
  ```json
  {
    "ruleId": "EE-001",
    "severity": "error",
    "message": "Process must have at least one end event",
    "hint": "Add an end event to define process termination"
  }
  ```

### EE-003: End event has no outgoing flows
- **Severity**: error
- **Description**: Sequence flows cannot originate from end events; they are process termination points.
- **BPMN Rule**: Per BPMN 2.0 specification (method/methodology.md EE-03), end events have no outgoing flows.
- **Implementation**: For each end event, checks if any flow has `from === endEvent.id`. Fails if found.
- **Remediation**: Remove sequence flows that originate from the end event. End events are exit points only.
- **Example Finding**:
  ```json
  {
    "ruleId": "EE-003",
    "severity": "error",
    "elementId": "end-1",
    "message": "End event \"Process End\" must not have outgoing flows",
    "hint": "Remove flows originating from this end event"
  }
  ```

### EE-004: End event has at least one incoming flow
- **Severity**: error
- **Description**: Each end event must have at least one incoming flow to receive process execution flow.
- **BPMN Rule**: Per BPMN 2.0 specification (method/methodology.md EE-04), process execution must reach an end event.
- **Implementation**: For each end event, counts flows with `to === endEvent.id`. Fails if count is zero.
- **Remediation**: Connect the final process activity to this end event with a sequence flow.
- **Example Finding**:
  ```json
  {
    "ruleId": "EE-004",
    "severity": "error",
    "elementId": "end-1",
    "message": "End event \"Process End\" must have at least one incoming flow",
    "hint": "Connect this end event to the final process activity with a sequence flow"
  }
  ```

## Rule Development Guide

### Writing a New Validation Rule

Each rule is a `ValidationRule` object with 4 required fields:

```typescript
import type { ValidationRule, ValidationFinding } from '../src/validator-types.js'
import type { ProcessIr } from '../src/ir.js'

const rule_XX_NNN: ValidationRule = {
  ruleId: 'XX-NNN',                    // Unique rule ID (SE-, EE-, GW-, etc.)
  severity: 'warning',                 // 'error' | 'warning' | 'info'
  description: 'What this rule checks',
  validate(ir: ProcessIr): ValidationFinding[] {
    const findings: ValidationFinding[] = []
    
    // Inspect ir.lanes, ir.flows, etc.
    // Push findings if violations detected.
    
    return findings
  }
}
```

### Example: Event Type Validation (RD-098)

```typescript
const rule_EE_001: ValidationRule = {
  ruleId: 'EE-001',
  severity: 'error',
  description: 'All events use valid BPMN 2.0 event type values',
  validate(ir: ProcessIr): ValidationFinding[] {
    const findings: ValidationFinding[] = []
    const validEventTypes = ['startEvent', 'endEvent']
    
    for (const lane of ir.lanes) {
      for (const el of lane.elements) {
        if (el.type.includes('Event') && !validEventTypes.includes(el.type)) {
          findings.push({
            ruleId: 'EE-001',
            severity: 'error',
            elementId: el.id,
            message: `Event "${el.name}" has invalid type "${el.type}"`,
            hint: `Use one of: ${validEventTypes.join(', ')}`,
          })
        }
      }
    }
    
    return findings
  }
}
```

### Registering a Rule

Add the rule to the global registry in `src/validator.ts`:

```typescript
validator.register(rule_XX_NNN)
```

### Testing a Rule

Create a test in `tests/validator.test.ts`:

```typescript
test('EE-001: detects invalid event types', () => {
  const ir: ProcessIr = {
    id: 'test',
    name: 'Test',
    poolId: 'pool-1',
    poolName: 'Pool',
    lanes: [{
      id: 'lane-1',
      name: 'Lane 1',
      elements: [{
        id: 'event-1',
        name: 'Bad Event',
        type: 'invalid-type', // Invalid!
        poolId: 'pool-1',
        laneId: 'lane-1',
      }],
    }],
    flows: [],
  }
  
  const report = validateProcess(ir)
  expect(report.findings).toContainEqual(
    expect.objectContaining({
      ruleId: 'EE-001',
      severity: 'error',
      elementId: 'event-1',
    })
  )
})
```

## Validation Checklist for Rule Authors

Before submitting a rule:

- [ ] Rule ID follows category prefix (SE-, EE-, GW-, ACT-, SF-, CONN-, AP-)
- [ ] Severity is appropriate (error = blocking, warning = advisory, info = diagnostic)
- [ ] `validate()` function handles empty lanes/elements gracefully
- [ ] Finding includes `ruleId`, `severity`, `message`; optional `elementId`, `hint`, `docUrl`
- [ ] At least one test case covers the rule
- [ ] Test includes both pass and fail scenarios
- [ ] Rule is registered in `src/validator.ts`
- [ ] Documentation added to this file under appropriate category

## API Integration

Validation findings are included in HTTP API responses:

### POST /api/compile

**Response:**
```json
{
  "xml": "...",
  "metrics": { ... },
  "validation": {
    "isValid": true,
    "findings": [],
    "summary": {
      "errorCount": 0,
      "warningCount": 0,
      "infoCount": 0
    }
  }
}
```

## CLI Output

The `cervin compile` command includes validation in its output:

```
$ npm run cervin -- compile example.cervin.yaml out.bpmn
✓ Compiled: out.bpmn
✓ Validation: 0 errors, 0 warnings
```

## Known Limitations

- **RD-096 (Foundation)**: Baseline validator registry pattern; pool existence enforced by AJV schema.
- **RD-097+**: Semantic rules for events, gateways, activities, anti-patterns.
- **Cross-lane validation**: Validators can access lane indices for cross-lane checks.
- **Metrics in findings**: Some rules may surface layout metrics as info findings.

## Future Work

- Baseline violation tracking (which diagrams violate which rules over time)
- Severity thresholds (treat warnings as errors above threshold)
- Custom rule loading from external plugins
- Detailed remediation guides linked from findings

## Sequence Flow Rules (RD-099, RD-100)

Semantic validation for BPMN 2.0 sequence flow constraints, including routing restrictions and duplicate detection.

### SF-DUP: No duplicate sequence flows (RD-099)
- **Severity**: error
- **Description**: Sequence flows must have unique source-target pairs; no two flows can connect the same from and to elements.
- **BPMN Rule**: Per BPMN 2.0, redundant flows are not semantically meaningful and indicate a modeling error.
- **Implementation**: Builds a map of "from→to" pairs. Fails if any pair appears more than once.
- **Remediation**: Remove one of the duplicate flows. Only one sequence flow can directly connect the same two elements.
- **Example Finding**:
  ```json
  {
    "ruleId": "SF-DUP",
    "severity": "error",
    "elementId": "flow-2",
    "message": "Duplicate flow from \"task-1\" to \"task-2\" (first: flow-1)",
    "hint": "Remove one of the duplicate flows"
  }
  ```

### SF-001: Flow endpoints must exist (RD-100)
- **Severity**: error
- **Description**: All sequence flows must have valid from and to endpoints that reference existing process elements.
- **BPMN Rule**: Per BPMN 2.0, flows connect existing elements within the process. Invalid references are structural errors.
- **Scope**: Since Transitrix Studio enforces single-pool-per-file, this validates that endpoints exist within the pool's lanes.
- **Implementation**: For each flow, checks if both `from` and `to` element IDs exist in any lane of the process.
- **Remediation**: 
  - If source missing: Verify the source element ID is correct and exists.
  - If target missing: Verify the target element ID is correct and exists.
- **Example Findings**:
  ```json
  {
    "ruleId": "SF-001",
    "severity": "error",
    "elementId": "flow-1",
    "message": "Flow source element \"missing-task\" does not exist",
    "hint": "Verify the source element ID is correct and exists in the process"
  }
  ```
  ```json
  {
    "ruleId": "SF-001",
    "severity": "error",
    "elementId": "flow-2",
    "message": "Flow target element \"nonexistent-end\" does not exist",
    "hint": "Verify the target element ID is correct and exists in the process"
  }
  ```

### SF-005: Condition expressions only on Activity or XOR gateway outgoing flows (RD-104)
- **Severity**: error
- **Description**: Sequence flows with condition expressions are only allowed when sourced from Activity elements (tasks: task, userTask, serviceTask) or XOR (exclusive) / inclusive gateways. Conditions on flows from other element types (events, parallel gateways, etc.) are not evaluated and indicate a modeling error.
- **BPMN Rule**: Per BPMN 2.0 specification, conditions are evaluated at split points (XOR/inclusive gateways and activities with outgoing conditional flows).
- **Implementation**: For each flow with a condition expression, checks that the source element type is one of: `task`, `userTask`, `serviceTask`, `exclusiveGateway`, `inclusiveGateway`.
- **Remediation**: Either (a) remove the condition expression from the flow, or (b) ensure the flow originates from an Activity or XOR gateway.
- **Example Finding**:
  ```json
  {
    "ruleId": "SF-005",
    "severity": "error",
    "elementId": "flow-bad",
    "message": "Flow \"flow-bad\" with condition cannot originate from \"startEvent\"",
    "hint": "Condition expressions are only allowed on flows from Activities (task, userTask, serviceTask) or XOR gateways"
  }
  ```

### SF-006: Default flow marker only on Activity or XOR gateway outgoing flows (RD-104)
- **Severity**: error
- **Description**: The default flow marker (the flow that routes tokens when no conditions match) is only valid on flows sourced from Activity elements or XOR / inclusive gateways. Other element types do not have conditional branching semantics.
- **BPMN Rule**: Per BPMN 2.0, the default attribute is evaluated at split points (XOR/inclusive gateways and conditional activities).
- **Implementation**: For each flow marked as default (`flow.default === true`), checks that the source element type is one of: `task`, `userTask`, `serviceTask`, `exclusiveGateway`, `inclusiveGateway`.
- **Remediation**: Remove the default marker from the flow, or move the flow to originate from an Activity or XOR gateway.
- **Example Finding**:
  ```json
  {
    "ruleId": "SF-006",
    "severity": "error",
    "elementId": "flow-default",
    "message": "Flow \"flow-default\" marked as default cannot originate from \"parallelGateway\"",
    "hint": "Default flow marker is only allowed on flows from Activities (task, userTask, serviceTask) or XOR gateways"
  }
  ```

### SF-007: Flow cannot have both default marker and condition expression (RD-104)
- **Severity**: error
- **Description**: A single sequence flow cannot be marked as both default and conditional. The default flow is the fallback when all conditions are false; a condition on the default flow is contradictory.
- **BPMN Rule**: Per BPMN 2.0 semantics, default and conditional are mutually exclusive routing attributes.
- **Implementation**: For each flow, checks that `flow.default` and `flow.condition` are not both true simultaneously.
- **Remediation**: Choose one: either mark the flow as default (remove condition), or give it a condition expression (remove default marker).
- **Example Finding**:
  ```json
  {
    "ruleId": "SF-007",
    "severity": "error",
    "elementId": "flow-conflict",
    "message": "Flow \"flow-conflict\" cannot have both default marker and condition expression",
    "hint": "A flow must be either the default route (default: true) or have a condition, not both"
  }
  ```

## Intermediate Event Rules (IE)

Semantic validation for BPMN 2.0 intermediate (catch) events — `intermediateMessageEvent`, `intermediateTimerEvent`.

### IE-001: Intermediate events have incoming and outgoing flows
- **Severity**: error
- **Description**: Intermediate catch events sit mid-flow, so they must have at least one incoming and at least one outgoing flow. A missing endpoint strands the token. This is distinct from start events (no incoming) and end events (no outgoing), which are intentionally one-sided.
- **BPMN Rule**: Per BPMN 2.0, intermediate catch events have exactly one incoming and one outgoing sequence flow in normal (non-boundary) usage.
- **Implementation**: For each intermediate event, counts incoming and outgoing flows; fails if either is zero.
- **Remediation**: Connect the intermediate event to both a predecessor and a successor.
- **Example Finding**:
  ```json
  {
    "ruleId": "IE-001",
    "severity": "error",
    "elementId": "wait",
    "message": "Intermediate event \"Wait\" must have incoming and outgoing flows (no outgoing)",
    "hint": "Connect a flow from this intermediate event to the next element"
  }
  ```

## Gateway Rules (RD-105)

Semantic validation for BPMN 2.0 gateway element constraints per **method/methodology.md** Section 7.

### GW-XOR-01: XOR gateway cannot have single incoming and single outgoing flow
- **Severity**: error
- **Description**: An exclusive (XOR) gateway with only one incoming and one outgoing flow is a no-op routing element. It neither splits nor joins control flow; use a direct sequence flow instead.
- **BPMN Rule**: Per BPMN 2.0, gateways are for routing logic (branching or synchronization). A single-in single-out configuration serves no routing purpose.
- **Implementation**: For each XOR gateway, counts incoming and outgoing flows. Fails if both counts equal 1.
- **Remediation**: Either remove the gateway and use a direct flow between the two connected elements, or add additional outgoing flows if the gateway is intended as a split point.
- **Example Finding**:
  ```json
  {
    "ruleId": "GW-XOR-01",
    "severity": "error",
    "elementId": "gateway-1",
    "message": "XOR gateway \"Decision\" has single incoming and single outgoing flow",
    "hint": "Use a direct flow instead of a single-in single-out gateway; XOR is for routing decisions"
  }
  ```

### GW-XOR-02: XOR split outgoing flows must have at most one default and all others must be conditional (RD-105)
- **Severity**: error
- **Description**: When an XOR gateway splits (has multiple outgoing flows), control flow routing must be fully specified: at most one flow is marked as default (the fallback), and all other flows must have explicit condition expressions. This ensures deterministic routing.
- **BPMN Rule**: Per BPMN 2.0, XOR split semantics require that for any input token, exactly one outgoing flow is taken. This is achieved by conditions + default.
- **Implementation**: For each XOR gateway with ≥2 outgoing flows:
  - Counts default flows; fails if count > 1.
  - Checks all non-default flows have a condition; fails if any are unconditional.
- **Remediation**:
  - If too many defaults: keep only one, remove the rest.
  - If unconditional flows: add condition expressions to all non-default flows.
- **Example Findings**:
  ```json
  {
    "ruleId": "GW-XOR-02",
    "severity": "error",
    "elementId": "xor-split",
    "message": "XOR split \"Approve Or Reject\" has 2 default flows (max 1)",
    "hint": "Mark at most one outgoing flow as default; others must have explicit conditions"
  }
  ```
  ```json
  {
    "ruleId": "GW-XOR-02",
    "severity": "error",
    "elementId": "xor-split",
    "message": "XOR split \"Route Order\" has 2 flow(s) without condition or default",
    "hint": "All outgoing flows must either have a condition or be marked as default (but max 1 default)"
  }
  ```

### GW-AND-04: Parallel gateway split outgoing flows must not have conditions
- **Severity**: error
- **Description**: Parallel (AND) gateways route all tokens to all outgoing branches simultaneously; conditional branching has no meaning in parallel execution. Flows from a parallel split cannot have conditions or be marked as default.
- **BPMN Rule**: Per BPMN 2.0 execution semantics, AND splits are unconditional and non-exclusive.
- **Implementation**: For each parallel gateway, checks all outgoing flows for condition expressions. Fails if any flow has `flow.condition` set.
- **Remediation**: Remove condition expressions from all outgoing flows of parallel gateways. If selective branching is needed, use an XOR gateway instead.
- **Example Finding**:
  ```json
  {
    "ruleId": "GW-AND-04",
    "severity": "error",
    "elementId": "parallel-split",
    "message": "Parallel gateway \"Fork Tasks\" has 1 outgoing flow(s) with condition",
    "hint": "Parallel gateways route all tokens to all branches; conditions are not evaluated"
  }
  ```

## Activity Rules (RD-103)

Semantic validation for BPMN 2.0 task (activity) constraints per **method/methodology.md** Section 7.

### ACT-001: Task has incoming and outgoing flows
- **Severity**: error
- **Description**: Every task must have at least one incoming flow (predecessor) and one outgoing flow (successor) to define its entry and exit points in the process flow.
- **BPMN Rule**: Per BPMN 2.0 specification, tasks are activities that consume input and produce output within the process.
- **Exception**: Sole-element process (single task with no other elements) is exempt from this rule.
- **Implementation**: For each task element, counts incoming flows (`to === task.id`) and outgoing flows (`from === task.id`). Fails if count < 1 for either direction (unless sole-element process).
- **Remediation**:
  - If missing incoming: Connect a flow from the previous activity (or start event) to this task.
  - If missing outgoing: Connect a flow from this task to the next activity (or end event).
  - If both missing: Connect the task into the flow path between predecessors and successors.
- **Example Finding**:
  ```json
  {
    "ruleId": "ACT-001",
    "severity": "error",
    "elementId": "task-1",
    "message": "Task \"Verify Order\" must have incoming and outgoing flows (no outgoing)",
    "hint": "Connect a flow from this task to the next activity"
  }
  ```

## Connectivity Rules (RD-106)

Semantic validation for process connectivity constraints per **method/methodology.md** Section 7.

### CONN-001: Every element is reachable from a start event AND reaches an end event
- **Severity**: error
- **Description**: Every element in the process must be reachable from at least one start event and must have a path leading to at least one end event. This ensures the process has no unreachable (dead) code or hanging elements.
- **BPMN Rule**: Per BPMN 2.0 execution semantics, all activities must participate in the flow from entry to exit.
- **Implementation**: Performs forward reachability (BFS from all start events) and backward reachability (BFS from all end events). An element fails if it is unreachable from any start OR cannot reach any end.
- **Remediation**: Connect the unreachable element to the flow path, or remove it if it is not part of the process.
- **Example Finding**:
  ```json
  {
    "ruleId": "CONN-001",
    "severity": "error",
    "elementId": "orphan-task",
    "message": "Element cannot reach any end event",
    "hint": "Connect this element to a flow path leading to an end event"
  }
  ```

### CONN-002: Graph is weakly connected (no isolated islands)
- **Severity**: error
- **Description**: The process must form a single connected graph with no isolated subgraphs (islands). Every element must have a path (direct or transitive) to every other element when edges are treated as undirected.
- **BPMN Rule**: BPMN 2.0 processes are single-threaded flow graphs; multiple disconnected islands indicate a modeling error.
- **Implementation**: Treats all flows as undirected edges, performs DFS/BFS to verify all elements are reachable from the first element.
- **Remediation**: Connect isolated elements or islands to the main process graph via sequence flows.

### CONN-003: Every flow source has a reachable target (transitively covered)
- **Status**: Fully covered by CONN-001 + parser validation.
- **Rationale**: The parser validates all `flow.to` references exist (no dangling flows). CONN-001 ensures every element can reach an end event, so every flow source has a path through its target to an exit. Thus CONN-003 (transitive reachability of flow targets) requires no separate rule.

## Anti-Pattern Rules (RD-107 onwards)

Anti-pattern rules detect suspicious modeling practices that may indicate errors, deadlock risks, or livelock scenarios. Unlike error rules, anti-patterns are warnings or info and can be enabled/disabled via `.transitrixrc` (see [Configuring rules](#configuring-rules-via-transitrixrc)).

### AP-FLOAT: Element has no incoming or outgoing flows (RD-107)
- **Severity**: warning
- **Description**: An element (task, gateway, or event) that is completely disconnected from the process flow — it has neither incoming nor outgoing flows. This is typically a modeling error: either the element should be connected to the flow, or it should be deleted.
- **Distinct from ACT-001**: ACT-001 enforces that tasks have both incoming and outgoing flows as a hard rule. AP-FLOAT flags any element that is floating, which is broader and is a warning.
- **Implementation**: For each element, counts incoming and outgoing flows. Flags if both counts are zero.
- **Default**: enabled (warning).
- **Remediation**: Either connect the element to the process flow via incoming and/or outgoing flows, or delete it if it is not part of the intended design.
- **Example Finding**:
  ```json
  {
    "ruleId": "AP-FLOAT",
    "severity": "warning",
    "elementId": "task-orphan",
    "message": "Element \"Unused Task\" has no incoming or outgoing flows",
    "hint": "Connect this element to the process flow, or remove it if unused"
  }
  ```

### AP-NO-DEFAULT: XOR split with all conditional flows but no default (RD-108)
- **Severity**: warning
- **Description**: An exclusive (XOR) gateway with multiple outgoing flows where every flow has a condition expression, but none is marked as default. If at runtime all conditions evaluate to false, the token has no exit route and the process deadlocks.
- **Risk**: Deadlock / token trapping.
- **Distinct from GW-XOR-02**: GW-XOR-02 is an error rule enforcing structural constraints (max 1 default, all others must be conditional). AP-NO-DEFAULT is a warning that detects a specific deadlock risk.
- **Implementation**: For each XOR gateway with ≥2 outgoing flows, checks if no default is marked AND all flows are conditional. Flags if both conditions are true.
- **Default**: enabled (warning).
- **Remediation**: Mark one of the outgoing flows as default (the fallback branch), or adjust one of the conditions to be catch-all (e.g., `amount >= 0` instead of `amount > 100`).
- **Example Finding**:
  ```json
  {
    "ruleId": "AP-NO-DEFAULT",
    "severity": "warning",
    "elementId": "xor-decision",
    "message": "XOR split \"Approve Or Deny\" has all conditional flows but no default",
    "hint": "If all conditions are false, the token will be trapped; mark one flow as default or add a catch-all condition"
  }
  ```

### AP-IMPLICIT-JOIN: Task has multiple incoming flows without a joining gateway (RD-109)
- **Severity**: warning
- **Description**: A task element with more than one incoming flow but no explicit AND (parallel) or XOR join gateway. In BPMN 2.0 semantics, each incoming token independently activates the task, which may not be the intended behavior if synchronization is needed.
- **Risk**: Unintended parallelism; multiple simultaneous activations of the task.
- **Implementation**: For each task element (task, userTask, serviceTask), counts incoming flows. Flags if count > 1.
- **Default**: enabled (warning).
- **Remediation**: If synchronization is intended, insert an AND (parallelGateway) join gateway before the task to combine all incoming flows into a single synchronized flow. If parallel activation is intended, document the deliberate design.
- **Example Finding**:
  ```json
  {
    "ruleId": "AP-IMPLICIT-JOIN",
    "severity": "warning",
    "elementId": "task-process",
    "message": "Task \"Process Request\" has 2 incoming flows (implicit join)",
    "hint": "Each incoming token independently activates the task; use an AND join gateway if synchronization is intended"
  }
  ```

### AP-GW-AS-TASK: Gateway name suggests it might be a task (RD-110)
- **Severity**: warning
- **Description**: A gateway element (XOR, AND, OR, event-based) whose name starts with an imperative verb typical of task names (e.g., "Validate", "Approve", "Check", "Generate"). This is a heuristic hint that the element might be a task incorrectly modeled as a gateway. Gateways are routing constructs; tasks perform work.
- **Note**: This is a heuristic hint, not a hard rule. Some gateways may legitimately have action-like names, especially in high-level process descriptions.
- **Imperative verb list**: accept, approve, assign, authorize, calculate, cancel, check, classify, confirm, convert, create, decline, delete, derive, determine, distribute, document, evaluate, execute, extract, generate, identify, implement, invoice, judge, log, manage, notify, organize, pay, perform, prepare, process, produce, propose, publish, read, receive, reconcile, record, reduce, register, reject, release, remove, report, request, resolve, review, revise, schedule, send, sign, store, submit, summarize, test, track, transfer, transform, validate, verify, write.
- **Default**: off by default (disabled). Enable via `.transitrixrc`: `"rules": { "AP-GW-AS-TASK": "warn" }`.
- **Remediation**: Review the gateway's purpose. If it performs work, replace it with a task element. If it is genuinely a routing construct, rename it to a descriptive noun (e.g., "Approval Decision" instead of "Approve Order").
- **Example Finding**:
  ```json
  {
    "ruleId": "AP-GW-AS-TASK",
    "severity": "warning",
    "elementId": "gateway-1",
    "message": "Gateway \"Validate Form\" has a name starting with an imperative verb; ensure this is a routing construct, not a task",
    "hint": "Gateways are for routing logic only. If this element performs work, use a task instead."
  }
  ```

### Configuring rules via `.transitrixrc`

> The canonical config file is **`.transitrixrc`**. The legacy **`.cervinrc`** is still
> read as a fallback when `.transitrixrc` is absent (deprecated; removed in 2.0.0).

`.transitrixrc` is a **JSON** file. The `rules` map enables or disables individual
rules by ID:

```json
{
  "rules": {
    "AP-FLOAT": "off",
    "AP-GW-AS-TASK": "warn"
  }
}
```

The only valid override values are **`"off"`** and **`"warn"`**:

- **`"off"`** — disable the rule. Error-severity rules are BPMN conformance gates
  and **cannot** be disabled: `"off"` on such a rule is rejected at load time.
- **`"warn"`** — enable the rule. Use it to turn on an off-by-default rule (such as
  `AP-GW-AS-TASK`); for an already-enabled rule it is a no-op.

> **`"warn"` does not change a rule's severity.** Every rule keeps its built-in
> severity (error or warning); an override only toggles whether the rule runs.
> Writing `"SE-001": "warn"` does **not** demote that error to a warning — to lower
> a rule's reported severity, change the rule definition, not the config. (Values
> such as `"error"` or `"on"` are **not** accepted and fail schema validation.)

Default state:
- `AP-FLOAT`: warning, enabled by default
- `AP-NO-DEFAULT`: warning, enabled by default
- `AP-IMPLICIT-JOIN`: warning, enabled by default
- `AP-GW-AS-TASK`: warning, **disabled by default** — enable with `"warn"`

## Association Rules (P0b)

Association rules govern the `associations` array in the process DSL, which connects data objects to activities using dashed undirected edges (BPMN 2.0 `<association>`). Associations are distinct from sequence flows and do not participate in token routing.

### ASC-001: Associations must connect a data object to an activity

- **Severity**: error
- **Description**: Each entry in `associations` must have exactly one `dataObject` endpoint and one activity endpoint (`task`, `userTask`, or `serviceTask`). Associations between two activities or two data objects are invalid — use sequence flows between activities, and model data dependencies as `dataObject ↔ activity` associations only.
- **Example Finding**:
  ```json
  {
    "ruleId": "ASC-001",
    "severity": "error",
    "elementId": "assoc1",
    "message": "Association \"assoc1\" must connect a data object to an activity (found \"task\" → \"task\")",
    "hint": "Associations link data objects to activities. Use sequence flows between activities."
  }
  ```

### ASC-002: Association endpoints must reference existing elements

- **Severity**: error
- **Description**: Both `from` and `to` of an association must reference element IDs that exist in the process. This is a defensive check — the parser already validates endpoints at parse time.
- **Example Finding**:
  ```json
  {
    "ruleId": "ASC-002",
    "severity": "error",
    "elementId": "assoc2",
    "message": "Association source element \"missing\" does not exist",
    "hint": "Verify the source element ID is correct and exists in the process"
  }
  ```
