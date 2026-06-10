import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  loadCervinrc,
  loadTransitrixrc,
  assertNoCriticalRuleDowngrade,
  mergeConfigWithDefaults,
  CERVINRC_DEPRECATION_NOTICE,
} from '../src/cervinrc.js'
import type { ValidationRule, CervinrcConfig, ConfigError } from '../src/validator-types.js'

describe('cervinrc config loader', () => {
  const testDir = '/tmp/cervinrc-test'

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('loads valid .cervinrc with warning rule overridden to off', () => {
    const config: CervinrcConfig = {
      rules: {
        'AP-001': 'off',
        'AP-002': 'warn',
      },
    }
    writeFileSync(join(testDir, '.cervinrc'), JSON.stringify(config))

    const loaded = loadCervinrc(testDir)
    expect(loaded.rules).toEqual(config.rules)
  })

  it('returns empty config when .cervinrc does not exist', () => {
    const loaded = loadCervinrc(testDir)
    expect(loaded).toEqual({})
  })

  it('throws ConfigError on invalid JSON', () => {
    writeFileSync(join(testDir, '.cervinrc'), '{ invalid json }')

    expect(() => loadCervinrc(testDir)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Invalid JSON'),
      })
    )
  })

  it('throws ConfigError on schema validation failure (unknown rule ID format)', () => {
    const config = { rules: { 'INVALID': 'off' } }
    writeFileSync(join(testDir, '.cervinrc'), JSON.stringify(config))

    expect(() => loadCervinrc(testDir)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Config validation failed'),
      })
    )
  })

  it('throws ConfigError on invalid override value', () => {
    const config = { rules: { 'AP-001': 'invalid' } }
    writeFileSync(join(testDir, '.cervinrc'), JSON.stringify(config))

    expect(() => loadCervinrc(testDir)).toThrow(
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

    const config: CervinrcConfig = {
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

    const config: CervinrcConfig = {
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

    const config: CervinrcConfig = {
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

    const config: CervinrcConfig = {
      rules: { 'AP-001': 'warn' },
    }

    const enabled = mergeConfigWithDefaults(rules, config)
    expect(enabled.has('AP-001')).toBe(true)
  })

  it('rejects additionalProperties in config root', () => {
    const config = { rules: {}, unknownField: true }
    writeFileSync(join(testDir, '.cervinrc'), JSON.stringify(config))

    expect(() => loadCervinrc(testDir)).toThrow(
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

    const config: CervinrcConfig = {
      rules: { 'AP-GW-AS-TASK': 'warn' },
    }

    const enabled = mergeConfigWithDefaults(rules, config)
    expect(enabled.has('AP-GW-AS-TASK')).toBe(true)
  })
})

describe('loadTransitrixrc (Cervin deprecation P4)', () => {
  const testDir = '/tmp/transitrixrc-test'

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('loads .transitrixrc when present', () => {
    const config: CervinrcConfig = { rules: { 'AP-001': 'off' } }
    writeFileSync(join(testDir, '.transitrixrc'), JSON.stringify(config))

    const loaded = loadTransitrixrc(testDir)
    expect(loaded.rules).toEqual(config.rules)
  })

  it('falls back to .cervinrc when .transitrixrc is absent', () => {
    const config: CervinrcConfig = { rules: { 'AP-002': 'warn' } }
    writeFileSync(join(testDir, '.cervinrc'), JSON.stringify(config))

    const loaded = loadTransitrixrc(testDir)
    expect(loaded.rules).toEqual(config.rules)
  })

  it('prefers .transitrixrc over a present .cervinrc', () => {
    writeFileSync(join(testDir, '.transitrixrc'), JSON.stringify({ rules: { 'AP-001': 'off' } }))
    writeFileSync(join(testDir, '.cervinrc'), JSON.stringify({ rules: { 'AP-002': 'warn' } }))

    const loaded = loadTransitrixrc(testDir)
    expect(loaded.rules).toEqual({ 'AP-001': 'off' })
  })

  it('returns empty config when neither file exists', () => {
    expect(loadTransitrixrc(testDir)).toEqual({})
  })

  it('surfaces invalid JSON against the file actually read (.transitrixrc)', () => {
    writeFileSync(join(testDir, '.transitrixrc'), '{ invalid json }')
    expect(() => loadTransitrixrc(testDir)).toThrow(
      expect.objectContaining({ message: expect.stringContaining('Invalid JSON in .transitrixrc') }),
    )
  })

  it('loadCervinrc is an alias that still resolves .transitrixrc', () => {
    writeFileSync(join(testDir, '.transitrixrc'), JSON.stringify({ rules: { 'AP-001': 'off' } }))
    expect(loadCervinrc(testDir).rules).toEqual({ 'AP-001': 'off' })
  })

  it('exposes a deprecation notice naming .transitrixrc', () => {
    expect(CERVINRC_DEPRECATION_NOTICE).toMatch(/\.transitrixrc/)
    expect(CERVINRC_DEPRECATION_NOTICE).toMatch(/deprecated/i)
  })
})
