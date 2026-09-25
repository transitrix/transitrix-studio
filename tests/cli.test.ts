import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { describe, it, expect } from 'vitest'

// Spawns the built CLI (dist/cli.js — produced by the `pretest` build step).
const cliPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js')
const cliVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const diagramsVersion = JSON.parse(readFileSync(new URL('../packages/diagrams/package.json', import.meta.url), 'utf8')).version

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' })
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

describe('CLI top-level help (#187)', () => {
  it('exits 0 and prints usage for --help', () => {
    const { status, stderr } = runCli(['--help'])
    expect(status).toBe(0)
    expect(stderr).toContain('Transitrix Studio CLI')
    expect(stderr).toContain('transitrix serve')
  })

  it('exits 0 for -h and the `help` subcommand', () => {
    expect(runCli(['-h']).status).toBe(0)
    expect(runCli(['help']).status).toBe(0)
  })

  it('exits non-zero for an unknown command', () => {
    expect(runCli(['definitely-not-a-command']).status).not.toBe(0)
  })
})

describe('CLI --version', () => {
  it('exits 0 and reports both the cli and bundled @transitrix/diagrams version', () => {
    const { status, stdout } = runCli(['--version'])
    expect(status).toBe(0)
    expect(stdout.trim()).toBe(`transitrix ${cliVersion} (bundles @transitrix/diagrams ${diagramsVersion})`)
  })

  it('-v is an alias for --version', () => {
    const { status, stdout } = runCli(['-v'])
    expect(status).toBe(0)
    expect(stdout.trim()).toBe(`transitrix ${cliVersion} (bundles @transitrix/diagrams ${diagramsVersion})`)
  })
})
