import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

import type { ValidationRule } from './validator-types.js'
import type { CervinrcConfig, ConfigError } from './validator-types.js'

const require = createRequire(import.meta.url)
type AjvClass = typeof import('ajv').default
const Ajv = require('ajv') as AjvClass
const addFormats = require('ajv-formats') as (instance: InstanceType<AjvClass>) => void

// Load schema at module initialization
const CERVINRC_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    rules: {
      type: 'object',
      patternProperties: {
        '^[A-Z]+-[0-9-]+$': {
          type: 'string',
          enum: ['off', 'warn'],
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
  required: [] as string[],
} as const

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validateConfig = ajv.compile(CERVINRC_SCHEMA)

/**
 * Format AJV validation errors into human-readable messages.
 */
function formatAjvErrors(): string[] {
  const e = validateConfig.errors
  if (!e?.length) return []
  return e.map(
    (err: { instancePath?: string; message?: string; keyword: string }) =>
      `${err.instancePath || '/'} ${err.message ?? err.keyword}`.trim(),
  )
}

/**
 * Validate raw data against .cervinrc schema.
 */
function validateCervinrcDocument(data: unknown): asserts data is CervinrcConfig {
  if (!validateConfig(data)) {
    const err = new Error('Config validation failed') as ConfigError
    err.errors = formatAjvErrors()
    throw err
  }
}

/**
 * Load and parse .cervinrc config file from the given directory.
 * Returns empty config if file doesn't exist.
 *
 * @param startPath Directory to search for .cervinrc (default: current working directory)
 * @returns Validated CervinrcConfig, or empty config if file not found
 * @throws ConfigError if file exists but is invalid JSON or fails schema validation
 */
export function loadCervinrc(startPath: string = process.cwd()): CervinrcConfig {
  const rcPath = join(startPath, '.cervinrc')

  if (!existsSync(rcPath)) {
    return {} // Optional config file
  }

  try {
    const content = readFileSync(rcPath, 'utf8')
    const parsed = JSON.parse(content) as unknown
    validateCervinrcDocument(parsed)
    return parsed
  } catch (e) {
    if (e instanceof SyntaxError) {
      const err = new Error(`Invalid JSON in .cervinrc: ${e.message}`) as ConfigError
      throw err
    }
    if ((e as ConfigError).errors) {
      throw e // Re-throw validation errors
    }
    const err = e as Error
    throw new Error(`Failed to load .cervinrc: ${err.message}`)
  }
}

/**
 * Prevent downgrade of error-severity rules.
 * Error rules are BPMN conformance gates and cannot be disabled or demoted.
 *
 * @throws ConfigError if any error-severity rule is marked 'off'
 */
export function assertNoCriticalRuleDowngrade(
  registeredRules: Map<string, ValidationRule>,
  config: CervinrcConfig,
): void {
  if (!config.rules) return

  for (const [ruleId, override] of Object.entries(config.rules)) {
    const rule = registeredRules.get(ruleId)
    if (rule && rule.severity === 'error' && override === 'off') {
      const err = new Error(
        `Config error: rule "${ruleId}" is an error-severity rule and cannot be downgraded to "${override}"`,
      ) as ConfigError
      err.errors = [
        `Rule "${ruleId}" has severity "error" and is a BPMN conformance gate; it cannot be disabled or demoted.`,
        'Only warning-severity rules can be overridden.',
      ]
      throw err
    }
  }
}

/**
 * Merge .cervinrc config with rule registry to produce a set of enabled rule IDs.
 * Rules marked 'off' are excluded; unmarked rules are included (except off-by-default rules).
 * Off-by-default rules must be explicitly enabled via config.
 *
 * @param registeredRules All registered validation rules
 * @param config Loaded .cervinrc config
 * @returns Set of rule IDs that should be executed
 */
export function mergeConfigWithDefaults(
  registeredRules: Map<string, ValidationRule>,
  config: CervinrcConfig,
): Set<string> {
  const enabledRules = new Set<string>()

  // Start with all registered rules except those marked offByDefault
  for (const [ruleId, rule] of registeredRules.entries()) {
    if (!rule.offByDefault) {
      enabledRules.add(ruleId)
    }
  }

  // Apply overrides from config
  if (config.rules) {
    for (const [ruleId, override] of Object.entries(config.rules)) {
      if (override === 'off') {
        enabledRules.delete(ruleId)
      } else if (override === 'warn') {
        // 'warn' override: explicitly enable the rule (useful for off-by-default rules)
        enabledRules.add(ruleId)
      }
    }
  }

  return enabledRules
}
