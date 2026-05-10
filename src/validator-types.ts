import type { ProcessIr } from './ir.js'

/**
 * Severity level for validation findings.
 * - 'error': Blocking; invalid BPMN or critical structural issue.
 * - 'warning': Advisory; conformance risk or style issue.
 * - 'info': Diagnostic; metrics, hints, or quality suggestions.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info'

/**
 * Single validation finding: one rule violation or advisory.
 */
export interface ValidationFinding {
  /** Unique rule identifier, e.g. 'SE-001', 'EE-002'. */
  ruleId: string
  /** Severity of this finding. */
  severity: ValidationSeverity
  /** Optional: element ID that triggered this finding. */
  elementId?: string
  /** Human-readable message describing the issue. */
  message: string
  /** Optional: hint for remediation. */
  hint?: string
  /** Optional: link to rule documentation. */
  docUrl?: string
}

/**
 * Result of validation pass over a ProcessIr.
 */
export interface ValidationReport {
  /** True if no errors detected (warnings are allowed). */
  isValid: boolean
  /** All findings, sorted by severity (errors first). */
  findings: ValidationFinding[]
  /** Summary of finding counts. */
  summary: {
    errorCount: number
    warningCount: number
    infoCount: number
  }
}

/**
 * Configuration for validator execution.
 */
export interface ValidatorConfig {
  /** Which rules to run; if undefined, all registered rules run. */
  enabledRules?: Set<string>
  /** Optional limit on findings per category (not enforced at registry level). */
  maxFindingsPerCategory?: number
}

/**
 * Signature for a single validation rule.
 * Each rule is responsible for returning findings it detects in the IR.
 */
export interface ValidationRule {
  /** Unique rule ID, e.g. 'SE-001'. */
  ruleId: string
  /** Severity of findings this rule produces. */
  severity: ValidationSeverity
  /** Brief description of what this rule validates. */
  description: string
  /** Execute this rule and return findings (empty array if none). */
  validate(ir: ProcessIr): ValidationFinding[]
  /** If true, rule is disabled by default and must be explicitly enabled via .cervinrc. */
  offByDefault?: boolean
}

/**
 * Rule categories (for documentation and organization).
 * - SE-NNN: Structural Elements (pool, lanes, etc.)
 * - EE-NNN: Event Elements (start, end, intermediate)
 * - GW-NNN: Gateway Elements (XOR, AND, OR, etc.)
 * - ACT-NNN: Activity Elements (tasks, sub-processes)
 * - SF-NNN: Sequence Flows (connections, routing)
 * - CONN-NNN: Connections and Ports (entry/exit ports, overlaps)
 * - AP-NNN: Anti-patterns (deadlocks, unreachable paths, etc.)
 */
export enum RuleCategory {
  STRUCTURAL_ELEMENTS = 'SE',
  EVENT_ELEMENTS = 'EE',
  GATEWAY_ELEMENTS = 'GW',
  ACTIVITY_ELEMENTS = 'ACT',
  SEQUENCE_FLOWS = 'SF',
  CONNECTIONS = 'CONN',
  ANTIPATTERNS = 'AP',
}

/**
 * RD-097: Configuration for rule overrides via .cervinrc file.
 */

/** Override value for a validation rule: 'off' to disable, 'warn' to demote to warning (only for warnings). */
export type RuleOverride = 'off' | 'warn'

/** Configuration file format for .cervinrc. */
export interface CervinrcConfig {
  /** Rule overrides: { ruleId: 'off' | 'warn' }. Errors cannot be downgraded. */
  rules?: Record<string, RuleOverride>
}

/** Error thrown when .cervinrc validation fails. */
export interface ConfigError extends Error {
  /** Detailed error messages from AJV validation. */
  errors?: string[]
}
