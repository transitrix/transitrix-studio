import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { describe, it, expect } from 'vitest'

// Spawns the built CLI (dist/cli.js — produced by the `pretest` build step),
// same pattern as cli.test.ts.
const cliPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js')
const acmeCorpRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'organizations', 'acme_corp')

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' })
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

// `validate --scope=repo --json --include-model` emits the resolved
// canon/elements/** and canon/relations/** records, for a non-JS consumer
// (DSM's Go importer) that wants the parsed model without re-implementing
// the notation schema.
describe('CLI validate --scope=repo --include-model', () => {
  it('omits the `model` key by default (existing --json consumers unaffected)', () => {
    const { stdout } = runCli(['validate', '--scope=repo', '--root', acmeCorpRoot, '--json'])
    const output = JSON.parse(stdout)
    expect('model' in output).toBe(false)
  })

  it('emits resolved element and relation records with --include-model', () => {
    const { stdout } = runCli(['validate', '--scope=repo', '--root', acmeCorpRoot, '--json', '--include-model'])
    const output = JSON.parse(stdout)
    expect(Array.isArray(output.model.elements)).toBe(true)
    expect(Array.isArray(output.model.relations)).toBe(true)
    expect(output.model.elements.length).toBeGreaterThan(0)
    expect(output.model.relations.length).toBeGreaterThan(0)

    const driver = output.model.elements.find((e: { id: string }) => e.id === 'DRIVER-COMP-1')
    expect(driver).toMatchObject({
      id: 'DRIVER-COMP-1',
      name: 'Support response time',
      notation: 'driver',
      type: 'internal',
      layer: 'motivation',
    })
    expect(driver.sourceFile).toMatch(/canon\/elements\/01_motivation\/factors\/DRIVER-COMP-1\.yaml$/)

    const relation = output.model.relations.find((r: { id: string }) => r.id === 'REL-EMP-PERSON-OPS-1')
    expect(relation).toMatchObject({
      id: 'REL-EMP-PERSON-OPS-1',
      kind: 'employment',
      source: 'ACTOR-PERSON-1',
      target: 'ACTOR-OPS-1',
    })
  })

  it('every relation record resolves to non-empty source/target ids', () => {
    const { stdout } = runCli(['validate', '--scope=repo', '--root', acmeCorpRoot, '--json', '--include-model'])
    const output = JSON.parse(stdout)
    for (const r of output.model.relations) {
      expect(typeof r.source).toBe('string')
      expect(r.source.length).toBeGreaterThan(0)
      expect(typeof r.target).toBe('string')
      expect(r.target.length).toBeGreaterThan(0)
    }
  })

  it('--include-model without --json does not error (flag is a no-op outside JSON mode)', () => {
    const { status } = runCli(['validate', '--scope=repo', '--root', acmeCorpRoot, '--include-model'])
    // acme_corp has pre-existing compliance findings unrelated to this flag —
    // only assert the process ran and did not crash on the new flag.
    expect([0, 1]).toContain(status)
  })
})
