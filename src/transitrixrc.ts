import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

import type { ValidationRule } from './validator-types.js'
import type { TransitrixrcConfig, ConfigError } from './validator-types.js'

const require = createRequire(import.meta.url)
type AjvClass = typeof import('ajv').default
const Ajv = require('ajv') as AjvClass
const addFormats = require('ajv-formats') as (instance: InstanceType<AjvClass>) => void

// Load schema at module initialization
const TRANSITRIXRC_SCHEMA = {
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
const validateConfig = ajv.compile(TRANSITRIXRC_SCHEMA)

function formatAjvErrors(): string[] {
  const e = validateConfig.errors
  if (!e?.length) return []
  return e.map(
    (err: { instancePath?: string; message?: string; keyword: string }) =>
      `${err.instancePath || '/'} ${err.message ?? err.keyword}`.trim(),
  )
}

function validateTransitrixrcDocument(data: unknown): asserts data is TransitrixrcConfig {
  if (!validateConfig(data)) {
    const err = new Error('Config validation failed') as ConfigError
    err.errors = formatAjvErrors()
    throw err
  }
}

const TRANSITRIXRC_FILE = '.transitrixrc'

function loadRcFile(rcPath: string, fileLabel: string): TransitrixrcConfig {
  try {
    const content = readFileSync(rcPath, 'utf8')
    const parsed = JSON.parse(content) as unknown
    validateTransitrixrcDocument(parsed)
    return parsed
  } catch (e) {
    if (e instanceof SyntaxError) {
      const err = new Error(`Invalid JSON in ${fileLabel}: ${e.message}`) as ConfigError
      throw err
    }
    if ((e as ConfigError).errors) {
      throw e
    }
    const err = e as Error
    throw new Error(`Failed to load ${fileLabel}: ${err.message}`)
  }
}

/**
 * Load and parse the project config from `.transitrixrc` in the given
 * directory. Returns an empty config when the file is absent.
 *
 * @param startPath Directory to search (default: current working directory)
 * @returns Validated config, or empty config if no file is found
 * @throws ConfigError if the file exists but is invalid JSON or fails schema validation
 */
export function loadTransitrixrc(startPath: string = process.cwd()): TransitrixrcConfig {
  const transitrixPath = join(startPath, TRANSITRIXRC_FILE)
  if (existsSync(transitrixPath)) {
    return loadRcFile(transitrixPath, TRANSITRIXRC_FILE)
  }
  return {}
}

/**
 * @deprecated Removed in 2.0.0 — use {@link loadTransitrixrc}.
 */
export function loadCervinrc(startPath: string = process.cwd()): TransitrixrcConfig {
  return loadTransitrixrc(startPath)
}

/**
 * Prevent downgrade of error-severity rules.
 * Error rules are BPMN conformance gates and cannot be disabled or demoted.
 */
export function assertNoCriticalRuleDowngrade(
  registeredRules: Map<string, ValidationRule>,
  config: TransitrixrcConfig,
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
 * Merge config with rule registry to produce a set of enabled rule IDs.
 * Rules marked 'off' are excluded; off-by-default rules must be explicitly enabled.
 */
export function mergeConfigWithDefaults(
  registeredRules: Map<string, ValidationRule>,
  config: TransitrixrcConfig,
): Set<string> {
  const enabledRules = new Set<string>()

  for (const [ruleId, rule] of registeredRules.entries()) {
    if (!rule.offByDefault) {
      enabledRules.add(ruleId)
    }
  }

  if (config.rules) {
    for (const [ruleId, override] of Object.entries(config.rules)) {
      if (override === 'off') {
        enabledRules.delete(ruleId)
      } else if (override === 'warn') {
        enabledRules.add(ruleId)
      }
    }
  }

  return enabledRules
}
