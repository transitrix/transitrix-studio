import { readFileSync, statSync } from 'node:fs'
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

interface RcCacheEntry {
  mtimeMs: number
  size: number
  config: TransitrixrcConfig
}

/**
 * Process-level cache keyed by the resolved `.transitrixrc` path. The compiler
 * reads the config on every `compileTransitrixYamlWithLayout` call, so batch
 * compiles (repo-validate over a whole tree, serve-ui, metrics regression) and
 * the VS Code extension would otherwise re-read + JSON.parse + AJV-validate the
 * same file hundreds of times. Cache hits are gated on the file's mtime+size so
 * an edit in a long-lived host (the extension) is still picked up immediately.
 */
const rcCache = new Map<string, RcCacheEntry>()

/**
 * Drop the cached configs. Exported for tests, which write the same
 * `.transitrixrc` path repeatedly and must not be subject to coarse filesystem
 * mtime resolution.
 */
export function clearTransitrixrcCache(): void {
  rcCache.clear()
}

/**
 * Load and parse the project config from `.transitrixrc` in the given
 * directory. Returns an empty config when the file is absent. Results are
 * cached per process and invalidated when the file's mtime or size changes.
 *
 * @param startPath Directory to search (default: current working directory)
 * @returns Validated config, or empty config if no file is found
 * @throws ConfigError if the file exists but is invalid JSON or fails schema validation
 */
export function loadTransitrixrc(startPath: string = process.cwd()): TransitrixrcConfig {
  const transitrixPath = join(startPath, TRANSITRIXRC_FILE)
  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(transitrixPath)
  } catch {
    // Absent (or unreadable) — behave as "no config" and forget any prior entry.
    rcCache.delete(transitrixPath)
    return {}
  }
  const cached = rcCache.get(transitrixPath)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.config
  }
  // Parse/validate errors propagate without being cached, so they keep
  // surfacing on every call until the file is fixed.
  const config = loadRcFile(transitrixPath, TRANSITRIXRC_FILE)
  rcCache.set(transitrixPath, { mtimeMs: stat.mtimeMs, size: stat.size, config })
  return config
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
 * Merge config with rule registry to produce a set of *enabled* rule IDs.
 *
 * An override only toggles whether a rule runs — it never changes a rule's
 * built-in severity:
 *   - `"off"`  → exclude the rule (forbidden for error-severity rules; see
 *                {@link assertNoCriticalRuleDowngrade}).
 *   - `"warn"` → include the rule. This enables an off-by-default rule; for an
 *                already-enabled rule it is a no-op. It does NOT demote an
 *                error-severity rule to a warning.
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
        // Enables the rule; severity is owned by the rule definition, not here.
        enabledRules.add(ruleId)
      }
    }
  }

  return enabledRules
}
