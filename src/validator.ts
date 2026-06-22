import type { ProcessIr } from './ir.js'
import { INTERMEDIATE_EVENT_TYPES } from './ir.js'
import type {
  ValidationFinding,
  ValidationReport,
  ValidatorConfig,
  ValidationRule,
  ValidationSeverity,
} from './validator-types.js'

/**
 * ValidatorRegistry manages validation rules and executes validation passes over ProcessIr.
 * Rules are pluggable; new rules can be registered without modifying this module.
 */
class ValidatorRegistry {
  private rules: Map<string, ValidationRule> = new Map()

  /**
   * Register a new validation rule.
   * @param rule The validation rule to register.
   */
  register(rule: ValidationRule): void {
    this.rules.set(rule.ruleId, rule)
  }

  /**
   * Deregister a validation rule by ID.
   * @param ruleId ID of the rule to remove.
   */
  deregister(ruleId: string): void {
    this.rules.delete(ruleId)
  }

  /**
   * Get all registered rule IDs.
   */
  getRuleIds(): string[] {
    return Array.from(this.rules.keys())
  }

  /**
   * Get the rules map (for config validation and introspection).
   * Used by RD-097 config loader to enforce severity constraints.
   */
  getRules(): Map<string, ValidationRule> {
    return this.rules
  }

  /**
   * Validate a ProcessIr against all registered rules.
   * @param ir The ProcessIr to validate.
   * @param config Optional validator configuration (e.g., filter rules).
   * @returns ValidationReport with findings and summary.
   */
  validate(ir: ProcessIr, config?: ValidatorConfig): ValidationReport {
    const findings: ValidationFinding[] = []

    // Determine which rules to run
    let rulesToRun: ValidationRule[] = Array.from(this.rules.values())
    if (config?.enabledRules) {
      rulesToRun = rulesToRun.filter((rule) =>
        config.enabledRules!.has(rule.ruleId)
      )
    }

    // Execute each rule and collect findings
    for (const rule of rulesToRun) {
      findings.push(...rule.validate(ir))
    }

    // Sort by severity: errors → warnings → info
    const severityOrder: Record<ValidationSeverity, number> = {
      error: 0,
      warning: 1,
      info: 2,
    }
    findings.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    )

    return {
      isValid: !findings.some((f) => f.severity === 'error'),
      findings,
      summary: {
        errorCount: findings.filter((f) => f.severity === 'error').length,
        warningCount: findings.filter((f) => f.severity === 'warning').length,
        infoCount: findings.filter((f) => f.severity === 'info').length,
      },
    }
  }
}

/**
 * Global validator registry instance.
 */
export const validator = new ValidatorRegistry()

/**
 * Validate a ProcessIr using the global registry.
 * @param ir The ProcessIr to validate.
 * @param config Optional configuration.
 * @returns ValidationReport.
 */
export function validateProcess(
  ir: ProcessIr,
  config?: ValidatorConfig
): ValidationReport {
  return validator.validate(ir, config)
}

// Note: Stub rules that previously existed here (pool existence, event types)
// were removed in RD-128. Pool existence is enforced by AJV schema in the parser;
// event type validation is deferred to future phases.

// ============================================================================
// RD-101: Start Event Rules (SE-NNN)
// ============================================================================

/**
 * SE-001: Process must have at least one start event.
 * Per BPMN 2.0 specification, a process requires a start event as entry point.
 */
const rule_SE_001_StartEventExists: ValidationRule = {
  ruleId: 'SE-001',
  severity: 'error',
  description: 'Process must have at least one start event',
  validate(ir: ProcessIr): ValidationFinding[] {
    const startEvents = ir.lanes
      .flatMap((lane) => lane.elements)
      .filter((el) => el.type === 'startEvent')

    if (startEvents.length === 0) {
      return [
        {
          ruleId: 'SE-001',
          severity: 'error',
          message: 'Process must have at least one start event',
          hint: 'Add a start event to begin process flow',
          docUrl: 'docs/validation.md#se-001',
        },
      ]
    }
    return []
  },
}

/**
 * SE-003: Start events must not have incoming flows.
 * Per BPMN 2.0, start events are entry points with no incoming flows.
 */
const rule_SE_003_NoIncomingToStart: ValidationRule = {
  ruleId: 'SE-003',
  severity: 'error',
  description: 'Start events must not have incoming flows',
  validate(ir: ProcessIr): ValidationFinding[] {
    const startEvents = ir.lanes
      .flatMap((lane) => lane.elements)
      .filter((el) => el.type === 'startEvent')

    const findings: ValidationFinding[] = []
    for (const start of startEvents) {
      const hasIncoming = ir.flows.some((flow) => flow.to === start.id)
      if (hasIncoming) {
        findings.push({
          ruleId: 'SE-003',
          severity: 'error',
          elementId: start.id,
          message: `Start event "${start.name || start.id}" must not have incoming flows`,
          hint: 'Remove flows targeting this start event; it is an entry point only',
          docUrl: 'docs/validation.md#se-003',
        })
      }
    }
    return findings
  },
}

/**
 * SE-004: Start events must have exactly one outgoing flow.
 * Per BPMN 2.0, start events initiate process execution with deterministic routing.
 */
const rule_SE_004_OneOutgoingFromStart: ValidationRule = {
  ruleId: 'SE-004',
  severity: 'error',
  description: 'Start events must have exactly one outgoing flow',
  validate(ir: ProcessIr): ValidationFinding[] {
    const startEvents = ir.lanes
      .flatMap((lane) => lane.elements)
      .filter((el) => el.type === 'startEvent')

    const findings: ValidationFinding[] = []
    for (const start of startEvents) {
      const outgoingCount = ir.flows.filter((flow) => flow.from === start.id)
        .length
      if (outgoingCount !== 1) {
        const message = outgoingCount === 0
          ? `Start event "${start.name || start.id}" must have an outgoing flow`
          : `Start event "${start.name || start.id}" must have exactly one outgoing flow (found ${outgoingCount})`
        const hint = outgoingCount === 0
          ? 'Add a flow from this start event to the first process activity'
          : `Remove ${outgoingCount - 1} extra flow(s) from this start event; use a gateway if multiple paths are needed`
        findings.push({
          ruleId: 'SE-004',
          severity: 'error',
          elementId: start.id,
          message,
          hint,
          docUrl: 'docs/validation.md#se-004',
        })
      }
    }
    return findings
  },
}

// Register start event rules
validator.register(rule_SE_001_StartEventExists)
validator.register(rule_SE_003_NoIncomingToStart)
validator.register(rule_SE_004_OneOutgoingFromStart)

/**
 * EE-001: Process has at least one end event.
 * A valid BPMN process must have at least one end event to define termination.
 */
const rule_EE_001_EndEventExists: ValidationRule = {
  ruleId: 'EE-001',
  severity: 'error',
  description: 'Process must have at least one end event',
  validate(ir: ProcessIr): ValidationFinding[] {
    const endEvents = ir.lanes
      .flatMap((lane) => lane.elements)
      .filter((el) => el.type === 'endEvent')

    if (endEvents.length === 0) {
      return [
        {
          ruleId: 'EE-001',
          severity: 'error',
          message: 'Process must have at least one end event',
          hint: 'Add an end event to define process termination',
          docUrl: 'docs/validation.md#ee-001',
        },
      ]
    }
    return []
  },
}

/**
 * EE-003: End events must not have outgoing flows.
 * Per BPMN 2.0, end events are termination points with no successors.
 */
const rule_EE_003_NoOutgoingFromEnd: ValidationRule = {
  ruleId: 'EE-003',
  severity: 'error',
  description: 'End events must not have outgoing flows',
  validate(ir: ProcessIr): ValidationFinding[] {
    const endEvents = ir.lanes
      .flatMap((lane) => lane.elements)
      .filter((el) => el.type === 'endEvent')

    const findings: ValidationFinding[] = []
    for (const end of endEvents) {
      const hasOutgoing = ir.flows.some((flow) => flow.from === end.id)
      if (hasOutgoing) {
        findings.push({
          ruleId: 'EE-003',
          severity: 'error',
          elementId: end.id,
          message: `End event "${end.name || end.id}" must not have outgoing flows`,
          hint: 'Remove flows originating from this end event',
          docUrl: 'docs/validation.md#ee-003',
        })
      }
    }
    return findings
  },
}

/**
 * EE-004: End events must have at least one incoming flow.
 * Per BPMN 2.0, process execution must reach an end event.
 */
const rule_EE_004_IncomingToEnd: ValidationRule = {
  ruleId: 'EE-004',
  severity: 'error',
  description: 'End events must have at least one incoming flow',
  validate(ir: ProcessIr): ValidationFinding[] {
    const endEvents = ir.lanes
      .flatMap((lane) => lane.elements)
      .filter((el) => el.type === 'endEvent')

    const findings: ValidationFinding[] = []
    for (const end of endEvents) {
      const incomingCount = ir.flows.filter((flow) => flow.to === end.id).length
      if (incomingCount === 0) {
        findings.push({
          ruleId: 'EE-004',
          severity: 'error',
          elementId: end.id,
          message: `End event "${end.name || end.id}" must have at least one incoming flow`,
          hint: 'Connect this end event to the final process activity',
          docUrl: 'docs/validation.md#ee-004',
        })
      }
    }
    return findings
  },
}

// Register end event rules
validator.register(rule_EE_001_EndEventExists)
validator.register(rule_EE_003_NoOutgoingFromEnd)
validator.register(rule_EE_004_IncomingToEnd)

/**
 * ACT-001: Every Task has at least one incoming and one outgoing flow.
 * Tasks are process activities that must have entry and exit points.
 * Exception: sole-element process (single task).
 */
const rule_ACT_001_TaskConnectivity: ValidationRule = {
  ruleId: 'ACT-001',
  severity: 'error',
  description: 'Tasks must have at least one incoming and one outgoing flow',
  validate(ir: ProcessIr): ValidationFinding[] {
    const tasks = ir.lanes
      .flatMap((lane) => lane.elements)
      .filter((el) => el.type === 'task')

    // Exception: if there's only one element total (sole-element process), skip validation
    const totalElements = ir.lanes.reduce((sum, lane) => sum + lane.elements.length, 0)
    const isSoleElement = totalElements === 1

    const findings: ValidationFinding[] = []

    for (const task of tasks) {
      if (isSoleElement) {
        continue // Skip for sole-element process
      }

      const incoming = ir.flows.filter((flow) => flow.to === task.id).length
      const outgoing = ir.flows.filter((flow) => flow.from === task.id).length

      if (incoming === 0 || outgoing === 0) {
        const issues = []
        if (incoming === 0) issues.push('no incoming')
        if (outgoing === 0) issues.push('no outgoing')

        findings.push({
          ruleId: 'ACT-001',
          severity: 'error',
          elementId: task.id,
          message: `Task "${task.name || task.id}" must have incoming and outgoing flows (${issues.join(', ')})`,
          hint:
            incoming === 0 && outgoing === 0
              ? 'Connect this task to both a predecessor and successor activity'
              : incoming === 0
                ? 'Connect a flow from the previous activity to this task'
                : 'Connect a flow from this task to the next activity',
          docUrl: 'docs/validation.md#act-001',
        })
      }
    }

    return findings
  },
}

// Register activity rules (RD-103)
validator.register(rule_ACT_001_TaskConnectivity)

/**
 * CONN-001: Every element is reachable from at least one Start AND reaches at least one End.
 * Per BPMN 2.0, all activities must be part of a complete execution path.
 */
const rule_CONN_001_ElementReachability: ValidationRule = {
  ruleId: 'CONN-001',
  severity: 'error',
  description: 'All elements must be reachable from a start event and reach an end event',
  validate(ir: ProcessIr): ValidationFinding[] {
    const allElements = ir.lanes.flatMap(lane => lane.elements)
    const startEvents = allElements.filter(el => el.type === 'startEvent')
    const endEvents = allElements.filter(el => el.type === 'endEvent')

    if (startEvents.length === 0 || endEvents.length === 0) {
      return [] // SE-001 and EE-001 will catch these
    }

    // Build adjacency map
    const forward: Map<string, string[]> = new Map()
    const backward: Map<string, string[]> = new Map()

    for (const el of allElements) {
      forward.set(el.id, [])
      backward.set(el.id, [])
    }

    for (const flow of ir.flows) {
      const outgoing = forward.get(flow.from) ?? []
      outgoing.push(flow.to)
      forward.set(flow.from, outgoing)

      const incoming = backward.get(flow.to) ?? []
      incoming.push(flow.from)
      backward.set(flow.to, incoming)
    }

    // DFS from each start to find reachable elements
    const reachableFromStart = new Set<string>()
    for (const start of startEvents) {
      const stack = [start.id]
      const visited = new Set<string>()
      while (stack.length > 0) {
        const node = stack.pop()!
        if (visited.has(node)) continue
        visited.add(node)
        reachableFromStart.add(node)
        const outgoing = forward.get(node) ?? []
        for (const next of outgoing) {
          if (!visited.has(next)) {
            stack.push(next)
          }
        }
      }
    }

    // DFS backward from each end to find elements that reach an end
    const reachesEnd = new Set<string>()
    for (const end of endEvents) {
      const stack = [end.id]
      const visited = new Set<string>()
      while (stack.length > 0) {
        const node = stack.pop()!
        if (visited.has(node)) continue
        visited.add(node)
        reachesEnd.add(node)
        const incoming = backward.get(node) ?? []
        for (const prev of incoming) {
          if (!visited.has(prev)) {
            stack.push(prev)
          }
        }
      }
    }

    const findings: ValidationFinding[] = []

    // Check each element (except start/end events)
    for (const el of allElements) {
      if (el.type === 'startEvent' || el.type === 'endEvent') {
        continue
      }

      const fromStart = reachableFromStart.has(el.id)
      const toEnd = reachesEnd.has(el.id)

      if (!fromStart || !toEnd) {
        const issues = []
        if (!fromStart) issues.push('not reachable from start')
        if (!toEnd) issues.push('does not reach end')

        findings.push({
          ruleId: 'CONN-001',
          severity: 'error',
          elementId: el.id,
          message: `Element "${el.name || el.id}" must be reachable from start and reach end (${issues.join(', ')})`,
          hint: !fromStart && !toEnd
            ? 'Connect this element to the main process flow'
            : !fromStart
              ? 'Add a flow from a preceding element to this element'
              : 'Add a flow from this element to a succeeding element',
          docUrl: 'docs/validation.md#conn-001',
        })
      }
    }

    return findings
  },
}

/**
 * CONN-002: Graph is weakly connected (no isolated islands).
 * Per BPMN 2.0, process should be a single connected component.
 */
const rule_CONN_002_GraphConnectivity: ValidationRule = {
  ruleId: 'CONN-002',
  severity: 'error',
  description: 'Process graph must be weakly connected (no isolated subgraphs)',
  validate(ir: ProcessIr): ValidationFinding[] {
    const allElements = ir.lanes.flatMap(lane => lane.elements)
    if (allElements.length <= 1) return []

    // Build undirected adjacency map
    const neighbors: Map<string, Set<string>> = new Map()
    for (const el of allElements) {
      neighbors.set(el.id, new Set())
    }

    for (const flow of ir.flows) {
      neighbors.get(flow.from)?.add(flow.to)
      neighbors.get(flow.to)?.add(flow.from)
    }

    // BFS to find connected component size
    const visited = new Set<string>()
    const stack = [allElements[0].id]

    while (stack.length > 0) {
      const node = stack.pop()!
      if (visited.has(node)) continue
      visited.add(node)

      const adjacent = neighbors.get(node) ?? new Set()
      for (const next of adjacent) {
        if (!visited.has(next)) {
          stack.push(next)
        }
      }
    }

    if (visited.size === allElements.length) {
      return [] // All connected
    }

    // Find isolated components
    const isolated = allElements.filter(el => !visited.has(el.id))

    return isolated.map(el => ({
      ruleId: 'CONN-002',
      severity: 'error' as const,
      elementId: el.id,
      message: `Element "${el.name || el.id}" is in an isolated subgraph`,
      hint: 'Connect this element to the main process flow',
      docUrl: 'docs/validation.md#conn-002',
    }))
  },
}

// Register connectivity rules (RD-106)
validator.register(rule_CONN_001_ElementReachability)
validator.register(rule_CONN_002_GraphConnectivity)

// ============================================================================
// Sequence Flow Rules (RD-104)
// ============================================================================

/**
 * SF-005: Condition expressions only on flows from Activity or XOR gateway.
 * A condition expression requires a gateway to evaluate it; regular tasks cannot have conditions.
 */
const rule_SF_005_ConditionSourceRestriction: ValidationRule = {
  ruleId: 'SF-005',
  severity: 'error',
  description: 'Condition expressions only allowed on flows from Activity or XOR gateway',
  validate(ir: ProcessIr): ValidationFinding[] {
    const findings: ValidationFinding[] = []
    const allElements = ir.lanes.flatMap(lane => lane.elements)
    const elementMap = new Map(allElements.map(el => [el.id, el]))

    for (const flow of ir.flows) {
      if (flow.condition) {
        const sourceEl = elementMap.get(flow.from)
        if (sourceEl && !['task', 'userTask', 'serviceTask', 'exclusiveGateway', 'inclusiveGateway'].includes(sourceEl.type)) {
          findings.push({
            ruleId: 'SF-005',
            severity: 'error',
            elementId: flow.id,
            message: `Flow "${flow.id}" with condition cannot originate from "${sourceEl.type}"`,
            hint: 'Condition expressions are only allowed on flows from Activities (task, userTask, serviceTask) or XOR/inclusive gateways',
            docUrl: 'docs/validation.md#sf-005',
          })
        }
      }
    }
    return findings
  },
}

/**
 * SF-006: Default flow marker only on flows from Activity or XOR gateway.
 * Default flows are used by gateways to route tokens when no conditions match.
 */
const rule_SF_006_DefaultFlowSourceRestriction: ValidationRule = {
  ruleId: 'SF-006',
  severity: 'error',
  description: 'Default flow marker only allowed on flows from Activity or XOR gateway',
  validate(ir: ProcessIr): ValidationFinding[] {
    const findings: ValidationFinding[] = []
    const allElements = ir.lanes.flatMap(lane => lane.elements)
    const elementMap = new Map(allElements.map(el => [el.id, el]))

    for (const flow of ir.flows) {
      if (flow.default) {
        const sourceEl = elementMap.get(flow.from)
        if (sourceEl && !['task', 'userTask', 'serviceTask', 'exclusiveGateway', 'inclusiveGateway'].includes(sourceEl.type)) {
          findings.push({
            ruleId: 'SF-006',
            severity: 'error',
            elementId: flow.id,
            message: `Flow "${flow.id}" marked as default cannot originate from "${sourceEl.type}"`,
            hint: 'Default flow marker is only allowed on flows from Activities (task, userTask, serviceTask) or XOR/inclusive gateways',
            docUrl: 'docs/validation.md#sf-006',
          })
        }
      }
    }
    return findings
  },
}

/**
 * SF-007: Default flow and condition expression are mutually exclusive on the same flow.
 * A flow cannot be both the default route AND have a condition.
 */
const rule_SF_007_DefaultAndConditionExclusive: ValidationRule = {
  ruleId: 'SF-007',
  severity: 'error',
  description: 'Flow cannot have both default marker and condition expression',
  validate(ir: ProcessIr): ValidationFinding[] {
    const findings: ValidationFinding[] = []

    for (const flow of ir.flows) {
      if (flow.default && flow.condition) {
        findings.push({
          ruleId: 'SF-007',
          severity: 'error',
          elementId: flow.id,
          message: `Flow "${flow.id}" cannot have both default marker and condition expression`,
          hint: 'A flow must be either the default route (default: true) or have a condition, not both',
          docUrl: 'docs/validation.md#sf-007',
        })
      }
    }
    return findings
  },
}

// Register sequence flow rules (RD-104)
validator.register(rule_SF_005_ConditionSourceRestriction)
validator.register(rule_SF_006_DefaultFlowSourceRestriction)
validator.register(rule_SF_007_DefaultAndConditionExclusive)

// ============================================================================
// Gateway Rules (RD-105, part 2 — part 1 is DSL extension in ir.ts + schemas)
// ============================================================================

/**
 * GW-XOR-01: XOR gateway cannot have both single incoming and single outgoing flow.
 * A single-in single-out XOR serves no purpose (it's just a routing stub); use a direct flow instead.
 */
const rule_GW_XOR_001_SingleInSingleOutForbidden: ValidationRule = {
  ruleId: 'GW-XOR-01',
  severity: 'error',
  description: 'XOR gateway cannot have single incoming and single outgoing flow',
  validate(ir: ProcessIr): ValidationFinding[] {
    const findings: ValidationFinding[] = []
    const xorGateways = ir.lanes.flatMap(lane => lane.elements).filter(el => el.type === 'exclusiveGateway')

    for (const gateway of xorGateways) {
      const incoming = ir.flows.filter(f => f.to === gateway.id).length
      const outgoing = ir.flows.filter(f => f.from === gateway.id).length

      if (incoming === 1 && outgoing === 1) {
        findings.push({
          ruleId: 'GW-XOR-01',
          severity: 'error',
          elementId: gateway.id,
          message: `XOR gateway "${gateway.name || gateway.id}" has single incoming and single outgoing flow`,
          hint: 'Use a direct flow instead of a single-in single-out gateway; XOR is for routing decisions',
          docUrl: 'docs/validation.md#gw-xor-01',
        })
      }
    }
    return findings
  },
}

/**
 * GW-XOR-02: XOR split (outgoing flows) constraints.
 * At most one default flow; all other outgoing flows must have a condition expression.
 */
const rule_GW_XOR_002_SplitConstraints: ValidationRule = {
  ruleId: 'GW-XOR-02',
  severity: 'error',
  description: 'XOR split: at most one default flow; all others must have condition',
  validate(ir: ProcessIr): ValidationFinding[] {
    const findings: ValidationFinding[] = []
    const xorGateways = ir.lanes.flatMap(lane => lane.elements).filter(el => el.type === 'exclusiveGateway')

    for (const gateway of xorGateways) {
      const outgoing = ir.flows.filter(f => f.from === gateway.id)
      if (outgoing.length <= 1) continue // Skip single-out gateways (covered by GW-XOR-01 for single-in)

      const defaultFlows = outgoing.filter(f => f.default)
      const conditional = outgoing.filter(f => f.condition)

      // At most one default flow
      if (defaultFlows.length > 1) {
        findings.push({
          ruleId: 'GW-XOR-02',
          severity: 'error',
          elementId: gateway.id,
          message: `XOR split "${gateway.name || gateway.id}" has ${defaultFlows.length} default flows (max 1)`,
          hint: 'Mark at most one outgoing flow as default; others must have explicit conditions',
          docUrl: 'docs/validation.md#gw-xor-02',
        })
      }

      // All non-default flows must have condition
      const unconditional = outgoing.filter(f => !f.default && !f.condition)
      if (unconditional.length > 0) {
        findings.push({
          ruleId: 'GW-XOR-02',
          severity: 'error',
          elementId: gateway.id,
          message: `XOR split "${gateway.name || gateway.id}" has ${unconditional.length} flow(s) without condition or default`,
          hint: 'All outgoing flows must either have a condition or be marked as default (but max 1 default)',
          docUrl: 'docs/validation.md#gw-xor-02',
        })
      }
    }
    return findings
  },
}

/**
 * GW-AND-04: Parallel (AND) split outgoing flows cannot have conditions.
 * Parallel gateways route all tokens to all outgoing branches simultaneously; conditions don't apply.
 */
const rule_GW_AND_004_NoConditionsOnParallelSplit: ValidationRule = {
  ruleId: 'GW-AND-04',
  severity: 'error',
  description: 'Parallel gateway split outgoing flows must not have conditions',
  validate(ir: ProcessIr): ValidationFinding[] {
    const findings: ValidationFinding[] = []
    const andGateways = ir.lanes.flatMap(lane => lane.elements).filter(el => el.type === 'parallelGateway')

    for (const gateway of andGateways) {
      const outgoing = ir.flows.filter(f => f.from === gateway.id)
      const withCondition = outgoing.filter(f => f.condition)

      if (withCondition.length > 0) {
        findings.push({
          ruleId: 'GW-AND-04',
          severity: 'error',
          elementId: gateway.id,
          message: `Parallel gateway "${gateway.name || gateway.id}" has ${withCondition.length} outgoing flow(s) with condition`,
          hint: 'Parallel gateways route all tokens to all branches; conditions are not evaluated',
          docUrl: 'docs/validation.md#gw-and-04',
        })
      }
    }
    return findings
  },
}

// Register gateway rules (RD-105)
validator.register(rule_GW_XOR_001_SingleInSingleOutForbidden)
validator.register(rule_GW_XOR_002_SplitConstraints)
validator.register(rule_GW_AND_004_NoConditionsOnParallelSplit)

// ============================================================================
// Intermediate Event Rules (IE-NNN)
// ============================================================================

/**
 * IE-001: Intermediate (catch) events must have at least one incoming and one
 * outgoing flow. They sit mid-flow, so a missing endpoint means the token is
 * stranded — distinct from start/end events which are intentionally one-sided.
 */
const rule_IE_001_IntermediateConnectivity: ValidationRule = {
  ruleId: 'IE-001',
  severity: 'error',
  description: 'Intermediate events must have at least one incoming and one outgoing flow',
  validate(ir: ProcessIr): ValidationFinding[] {
    const intermediateEvents = ir.lanes
      .flatMap((lane) => lane.elements)
      .filter((el) => INTERMEDIATE_EVENT_TYPES.has(el.type))

    const findings: ValidationFinding[] = []
    for (const event of intermediateEvents) {
      const incoming = ir.flows.filter((flow) => flow.to === event.id).length
      const outgoing = ir.flows.filter((flow) => flow.from === event.id).length

      if (incoming === 0 || outgoing === 0) {
        const issues: string[] = []
        if (incoming === 0) issues.push('no incoming')
        if (outgoing === 0) issues.push('no outgoing')
        findings.push({
          ruleId: 'IE-001',
          severity: 'error',
          elementId: event.id,
          message: `Intermediate event "${event.name || event.id}" must have incoming and outgoing flows (${issues.join(', ')})`,
          hint:
            incoming === 0 && outgoing === 0
              ? 'Connect this intermediate event to both a predecessor and successor'
              : incoming === 0
                ? 'Connect a flow from the previous element to this intermediate event'
                : 'Connect a flow from this intermediate event to the next element',
          docUrl: 'docs/validation.md#ie-001',
        })
      }
    }
    return findings
  },
}

// Register intermediate event rules
validator.register(rule_IE_001_IntermediateConnectivity)

// ============================================================================
// Anti-pattern Warning Rules (RD-107 onwards)
// ============================================================================

/**
 * AP-FLOAT (RD-107): Floating elements with no incoming or outgoing flows.
 * An element isolated from the main flow is typically a mistake.
 * Distinct from ACT-001 which covers tasks only and allows start/end events to be isolated.
 */
const rule_AP_FloatingElements: ValidationRule = {
  ruleId: 'AP-FLOAT',
  severity: 'warning',
  description: 'Element has no incoming or outgoing flows (floating)',
  validate(ir: ProcessIr): ValidationFinding[] {
    const findings: ValidationFinding[] = []
    const allElements = ir.lanes.flatMap(lane => lane.elements)

    for (const el of allElements) {
      const incoming = ir.flows.filter(f => f.to === el.id).length
      const outgoing = ir.flows.filter(f => f.from === el.id).length

      if (incoming === 0 && outgoing === 0) {
        findings.push({
          ruleId: 'AP-FLOAT',
          severity: 'warning',
          elementId: el.id,
          message: `Element "${el.name || el.id}" has no incoming or outgoing flows`,
          hint: 'Connect this element to the process flow, or remove it if it is unused',
          docUrl: 'docs/validation.md#ap-float',
        })
      }
    }
    return findings
  },
}

/**
 * AP-NO-DEFAULT (RD-108): XOR split with all conditional flows but no default.
 * If all conditions are false at runtime, a token cannot exit the gateway (deadlock).
 * This is distinct from GW-XOR-02 which allows a defaultless XOR if it has only one outgoing flow.
 */
const rule_AP_MissingDefaultOnConditionalXor: ValidationRule = {
  ruleId: 'AP-NO-DEFAULT',
  severity: 'warning',
  description: 'XOR split has all conditional flows but no default (risk of deadlock)',
  validate(ir: ProcessIr): ValidationFinding[] {
    const findings: ValidationFinding[] = []
    const xorGateways = ir.lanes.flatMap(lane => lane.elements).filter(el => el.type === 'exclusiveGateway')

    for (const gateway of xorGateways) {
      const outgoing = ir.flows.filter(f => f.from === gateway.id)
      if (outgoing.length <= 1) continue // Single-out has no risk

      const defaultFlows = outgoing.filter(f => f.default)
      const allConditional = outgoing.every(f => f.condition)

      if (defaultFlows.length === 0 && allConditional) {
        findings.push({
          ruleId: 'AP-NO-DEFAULT',
          severity: 'warning',
          elementId: gateway.id,
          message: `XOR split "${gateway.name || gateway.id}" has all conditional flows but no default`,
          hint: 'If all conditions are false, the token will be trapped; mark one flow as default or add a catch-all condition',
          docUrl: 'docs/validation.md#ap-no-default',
        })
      }
    }
    return findings
  },
}

/**
 * AP-IMPLICIT-JOIN (RD-109): Task with multiple incoming flows but no joining gateway.
 * Per BPMN 2.0 semantics, each token independently activates the task, often unintended.
 */
const rule_AP_ImplicitJoin: ValidationRule = {
  ruleId: 'AP-IMPLICIT-JOIN',
  severity: 'warning',
  description: 'Task has multiple incoming flows without a joining gateway',
  validate(ir: ProcessIr): ValidationFinding[] {
    const findings: ValidationFinding[] = []
    const allElements = ir.lanes.flatMap(lane => lane.elements)
    const tasks = allElements.filter(el => ['task', 'userTask', 'serviceTask'].includes(el.type))

    for (const task of tasks) {
      const incoming = ir.flows.filter(f => f.to === task.id)
      if (incoming.length > 1) {
        findings.push({
          ruleId: 'AP-IMPLICIT-JOIN',
          severity: 'warning',
          elementId: task.id,
          message: `Task "${task.name || task.id}" has ${incoming.length} incoming flows (implicit join)`,
          hint: 'Each incoming token independently activates the task; use an AND join gateway if synchronization is intended',
          docUrl: 'docs/validation.md#ap-implicit-join',
        })
      }
    }
    return findings
  },
}

/**
 * AP-GW-AS-TASK (RD-110): Gateway-as-task heuristic (off by default, enable via .cervinrc).
 * A gateway whose name starts with an imperative verb (e.g., "Validate", "Approve", "Check")
 * is likely a task mistakenly modeled as a gateway. Gateways are routing constructs only.
 * This is a heuristic hint, not a hard rule; some gateways may legitimately have action-like names.
 */
const IMPERATIVE_VERBS = [
  'accept', 'approve', 'assign', 'authorize', 'calculate', 'cancel', 'check', 'classify', 'confirm',
  'convert', 'create', 'decline', 'delete', 'derive', 'determine', 'distribute', 'document', 'evaluate',
  'execute', 'extract', 'generate', 'identify', 'implement', 'invoice', 'judge', 'log', 'manage',
  'notify', 'organize', 'pay', 'perform', 'prepare', 'process', 'produce', 'propose', 'publish',
  'read', 'receive', 'reconcile', 'record', 'reduce', 'register', 'reject', 'release', 'remove',
  'report', 'request', 'resolve', 'review', 'revise', 'schedule', 'send', 'sign', 'store',
  'submit', 'summarize', 'test', 'track', 'transfer', 'transform', 'validate', 'verify', 'write',
]

const rule_AP_GatewayAsTask: ValidationRule = {
  ruleId: 'AP-GW-AS-TASK',
  severity: 'warning',
  description: 'Gateway name suggests it might be a task (heuristic: starts with imperative verb)',
  offByDefault: true,
  validate(ir: ProcessIr): ValidationFinding[] {
    const findings: ValidationFinding[] = []
    const allElements = ir.lanes.flatMap(lane => lane.elements)
    const gateways = allElements.filter(el =>
      ['exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway'].includes(el.type)
    )

    for (const gateway of gateways) {
      if (!gateway.name) continue
      const lowerName = gateway.name.toLowerCase()
      const startsWithVerb = IMPERATIVE_VERBS.some(verb => lowerName.startsWith(verb))

      if (startsWithVerb) {
        findings.push({
          ruleId: 'AP-GW-AS-TASK',
          severity: 'warning',
          elementId: gateway.id,
          message: `Gateway "${gateway.name}" has a name starting with an imperative verb; ensure this is a routing construct, not a task`,
          hint: 'Gateways are for routing logic only. If this element performs work, use a task instead.',
          docUrl: 'docs/validation.md#ap-gw-as-task',
        })
      }
    }
    return findings
  },
}

// Register anti-pattern warning rules
validator.register(rule_AP_FloatingElements)
validator.register(rule_AP_MissingDefaultOnConditionalXor)
validator.register(rule_AP_ImplicitJoin)
validator.register(rule_AP_GatewayAsTask)

// ============================================================================
// Sequence Flow Additional Rules (RD-099, RD-100)
// ============================================================================

/**
 * SF-DUP (RD-099): No duplicate sequence flows between the same source and target.
 * Redundant flows with identical from→to pairs are forbidden per BPMN 2.0.
 */
const rule_SF_DUP_NoDuplicateFlows: ValidationRule = {
  ruleId: 'SF-DUP',
  severity: 'error',
  description: 'No duplicate sequence flows between same source and target',
  validate(ir: ProcessIr): ValidationFinding[] {
    const seen = new Map<string, string>() // key = "from→to", value = first flowId
    const findings: ValidationFinding[] = []

    for (const flow of ir.flows) {
      const key = `${flow.from}→${flow.to}`
      if (seen.has(key)) {
        findings.push({
          ruleId: 'SF-DUP',
          severity: 'error',
          elementId: flow.id,
          message: `Duplicate flow from "${flow.from}" to "${flow.to}" (first: ${seen.get(key)})`,
          hint: 'Remove one of the duplicate flows; only one flow can connect the same source-target pair',
          docUrl: 'docs/validation.md#sf-dup',
        })
      } else {
        seen.set(key, flow.id)
      }
    }
    return findings
  },
}

/**
 * SF-001 (RD-100): Flow endpoints must reference existing elements.
 * All flows must have valid from and to references within the pool.
 * Since Transitrix Studio enforces single pool, this validates endpoint existence.
 */
const rule_SF_01_ValidFlowEndpoints: ValidationRule = {
  ruleId: 'SF-001',
  severity: 'error',
  description: 'Flow endpoints must reference existing elements',
  validate(ir: ProcessIr): ValidationFinding[] {
    const elementIds = new Set(ir.lanes.flatMap((l) => l.elements.map((e) => e.id)))
    const findings: ValidationFinding[] = []

    for (const flow of ir.flows) {
      if (!elementIds.has(flow.from)) {
        findings.push({
          ruleId: 'SF-001',
          severity: 'error',
          elementId: flow.id,
          message: `Flow source element "${flow.from}" does not exist`,
          hint: 'Verify the source element ID is correct and exists in the process',
          docUrl: 'docs/validation.md#sf-01',
        })
      }
      if (!elementIds.has(flow.to)) {
        findings.push({
          ruleId: 'SF-001',
          severity: 'error',
          elementId: flow.id,
          message: `Flow target element "${flow.to}" does not exist`,
          hint: 'Verify the target element ID is correct and exists in the process',
          docUrl: 'docs/validation.md#sf-01',
        })
      }
    }
    return findings
  },
}

// Register sequence flow rules (RD-099, RD-100)
validator.register(rule_SF_DUP_NoDuplicateFlows)
validator.register(rule_SF_01_ValidFlowEndpoints)
