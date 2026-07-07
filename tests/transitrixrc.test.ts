import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  loadTransitrixrc,
  clearTransitrixrcCache,
  assertNoCriticalRuleDowngrade,
  mergeConfigWithDefaults,
} from '../src/transitrixrc.js'
import type { ValidationRule, TransitrixrcConfig, ConfigError } from '../src/validator-types.js'

describe('transitrixrc config loader', () => {
  const testDir = '/tmp/transitrixrc-loader-test'

  beforeEach(() => {
    clearTransitrixrcCache()
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('loads valid .transitrixrc with warning rule overridden to off', () => {
    const config: TransitrixrcConfig = {
      rules: {
        'AP-001': 'off',
        'AP-002': 'warn',
      },
    }
    writeFileSync(join(testDir, '.transitrixrc'), JSON.stringify(config))

    const loaded = loadTransitrixrc(testDir)
    expect(loaded.rules).toEqual(config.rules)
  })

  it('returns empty config when .transitrixrc does not exist', () => {
    const loaded = loadTransitrixrc(testDir)
    expect(loaded).toEqual({})
  })

  it('throws ConfigError on invalid JSON', () => {
    writeFileSync(join(testDir, '.transitrixrc'), '{ invalid json }')

    expect(() => loadTransitrixrc(testDir)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Invalid JSON'),
      })
    )
  })

  it('throws ConfigError on schema validation failure (unknown rule ID format)', () => {
    const config = { rules: { 'INVALID': 'off' } }
    writeFileSync(join(testDir, '.transitrixrc'), JSON.stringify(config))

    expect(() => loadTransitrixrc(testDir)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Config validation failed'),
      })
    )
  })

  it('throws ConfigError on invalid override value', () => {
    const config = { rules: { 'AP-001': 'invalid' } }
    writeFileSync(join(testDir, '.transitrixrc'), JSON.stringify(config))

    expect(() => loadTransitrixrc(testDir)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Config validation failed'),
      })
    )
  })

  it('rejects error-severity rule downgrade', () => {
    const rules = new Map<string, ValidationRule>([
      [
        'SE-001',
        {
          ruleId: 'SE-001',
          severity: 'error',
          description: 'Test error rule',
          validate: () => [],
        },
      ],
    ])

    const config: TransitrixrcConfig = {
      rules: { 'SE-001': 'off' },
    }

    expect(() => assertNoCriticalRuleDowngrade(rules, config)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('cannot be downgraded'),
      })
    )
  })

  it('allows warning-severity rule to be marked off', () => {
    const rules = new Map<string, ValidationRule>([
      [
        'AP-001',
        {
          ruleId: 'AP-001',
          severity: 'warning',
          description: 'Test warning rule',
          validate: () => [],
        },
      ],
    ])

    const config: TransitrixrcConfig = {
      rules: { 'AP-001': 'off' },
    }

    expect(() => assertNoCriticalRuleDowngrade(rules, config)).not.toThrow()
  })

  it('merges config with defaults: enabled rules are all by default', () => {
    const rules = new Map<string, ValidationRule>([
      ['SE-001', { ruleId: 'SE-001', severity: 'error', description: 'Test', validate: () => [] }],
      ['AP-001', { ruleId: 'AP-001', severity: 'warning', description: 'Test', validate: () => [] }],
      ['AP-002', { ruleId: 'AP-002', severity: 'warning', description: 'Test', validate: () => [] }],
    ])

    const enabled = mergeConfigWithDefaults(rules, {})
    expect(enabled.size).toBe(3)
    expect(enabled.has('SE-001')).toBe(true)
    expect(enabled.has('AP-001')).toBe(true)
    expect(enabled.has('AP-002')).toBe(true)
  })

  it('merges config: rules marked off are removed from enabled set', () => {
    const rules = new Map<string, ValidationRule>([
      ['SE-001', { ruleId: 'SE-001', severity: 'error', description: 'Test', validate: () => [] }],
      ['AP-001', { ruleId: 'AP-001', severity: 'warning', description: 'Test', validate: () => [] }],
      ['AP-002', { ruleId: 'AP-002', severity: 'warning', description: 'Test', validate: () => [] }],
    ])

    const config: TransitrixrcConfig = {
      rules: { 'AP-001': 'off' },
    }

    const enabled = mergeConfigWithDefaults(rules, config)
    expect(enabled.size).toBe(2)
    expect(enabled.has('SE-001')).toBe(true)
    expect(enabled.has('AP-001')).toBe(false)
    expect(enabled.has('AP-002')).toBe(true)
  })

  it('merges config: warn override does not remove rule from enabled set', () => {
    const rules = new Map<string, ValidationRule>([
      ['AP-001', { ruleId: 'AP-001', severity: 'warning', description: 'Test', validate: () => [] }],
    ])

    const config: TransitrixrcConfig = {
      rules: { 'AP-001': 'warn' },
    }

    const enabled = mergeConfigWithDefaults(rules, config)
    expect(enabled.has('AP-001')).toBe(true)
  })

  it('rejects additionalProperties in config root', () => {
    const config = { rules: {}, unknownField: true }
    writeFileSync(join(testDir, '.transitrixrc'), JSON.stringify(config))

    expect(() => loadTransitrixrc(testDir)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Config validation failed'),
      })
    )
  })

  it('off-by-default rules are excluded unless explicitly enabled in config', () => {
    const rules = new Map<string, ValidationRule>([
      ['SE-001', { ruleId: 'SE-001', severity: 'error', description: 'Test', validate: () => [] }],
      [
        'AP-GW-AS-TASK',
        {
          ruleId: 'AP-GW-AS-TASK',
          severity: 'warning',
          description: 'Test',
          offByDefault: true,
          validate: () => [],
        },
      ],
    ])

    const enabled = mergeConfigWithDefaults(rules, {})
    expect(enabled.has('SE-001')).toBe(true)
    expect(enabled.has('AP-GW-AS-TASK')).toBe(false)
  })

  it('off-by-default rules can be enabled via config with warn override', () => {
    const rules = new Map<string, ValidationRule>([
      ['SE-001', { ruleId: 'SE-001', severity: 'error', description: 'Test', validate: () => [] }],
      [
        'AP-GW-AS-TASK',
        {
          ruleId: 'AP-GW-AS-TASK',
          severity: 'warning',
          description: 'Test',
          offByDefault: true,
          validate: () => [],
        },
      ],
    ])

    const config: TransitrixrcConfig = {
      rules: { 'AP-GW-AS-TASK': 'warn' },
    }

    const enabled = mergeConfigWithDefaults(rules, config)
    expect(enabled.has('AP-GW-AS-TASK')).toBe(true)
  })
})

describe('loadTransitrixrc (Cervin deprecation P7)', () => {
  const testDir = '/tmp/transitrixrc-test'

  beforeEach(() => {
    clearTransitrixrcCache()
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('loads .transitrixrc when present', () => {
    const config: TransitrixrcConfig = { rules: { 'AP-001': 'off' } }
    writeFileSync(join(testDir, '.transitrixrc'), JSON.stringify(config))

    const loaded = loadTransitrixrc(testDir)
    expect(loaded.rules).toEqual(config.rules)
  })

  it('returns empty config when .transitrixrc does not exist', () => {
    expect(loadTransitrixrc(testDir)).toEqual({})
  })

  it('surfaces invalid JSON against the file actually read (.transitrixrc)', () => {
    writeFileSync(join(testDir, '.transitrixrc'), '{ invalid json }')
    expect(() => loadTransitrixrc(testDir)).toThrow(
      expect.objectContaining({ message: expect.stringContaining('Invalid JSON in .transitrixrc') }),
    )
  })

  it('caches an unchanged file (same instance on repeat reads)', () => {
    writeFileSync(join(testDir, '.transitrixrc'), JSON.stringify({ rules: { 'AP-001': 'off' } }))
    const first = loadTransitrixrc(testDir)
    const second = loadTransitrixrc(testDir)
    expect(second).toBe(first)
  })

  it('re-reads when the file content changes', () => {
    const rcPath = join(testDir, '.transitrixrc')
    writeFileSync(rcPath, JSON.stringify({ rules: { 'AP-001': 'off' } }))
    expect(loadTransitrixrc(testDir).rules).toEqual({ 'AP-001': 'off' })
    // A different-sized payload invalidates the cache even at coarse mtime
    // resolution.
    writeFileSync(rcPath, JSON.stringify({ rules: { 'AP-001': 'warn', 'AP-002': 'off' } }))
    expect(loadTransitrixrc(testDir).rules).toEqual({ 'AP-001': 'warn', 'AP-002': 'off' })
  })

  it('forgets the cached config once the file is removed', () => {
    const rcPath = join(testDir, '.transitrixrc')
    writeFileSync(rcPath, JSON.stringify({ rules: { 'AP-001': 'off' } }))
    expect(loadTransitrixrc(testDir).rules).toEqual({ 'AP-001': 'off' })
    rmSync(rcPath)
    expect(loadTransitrixrc(testDir)).toEqual({})
  })
})
