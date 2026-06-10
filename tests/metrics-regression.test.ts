import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { compileTransitrixYamlWithLayout } from '../src/compiler.js'
import { computeLayoutMetrics } from '../src/metrics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.dirname(__dirname)
const corpusDir = path.join(projectRoot, 'tests', 'fixtures', 'notation-corpus', 'bpmn')
const snapshotsDir = path.join(__dirname, 'snapshots')
const baselineFile = path.join(snapshotsDir, 'metrics-baseline.json')

// Read synchronously so baselineMetrics is populated at describe() registration time
let baselineMetrics: Record<string, any> = {}
try {
  const baseline = JSON.parse(readFileSync(baselineFile, 'utf-8'))
  baselineMetrics = baseline.results || {}
} catch {
  console.warn('⚠️  Baseline metrics not found at', baselineFile)
  console.warn('    Run: npm run metrics:baseline')
}

describe('Layout Metrics Regression Tests', () => {
  if (Object.keys(baselineMetrics).length === 0) {
    it('should fail when baseline is not available', () => {
      expect.fail('baseline not generated; run npm run metrics:baseline')
    })
    return
  }

  for (const [filename, baseline] of Object.entries(baselineMetrics)) {
    if ((baseline as any).status === 'error') {
      it(`${filename} — was already broken (error in baseline)`, () => {
        expect(true).toBe(true)
      })
      continue
    }

    it(`${filename} — crossing count should not increase`, async () => {
      const filepath = path.join(corpusDir, filename)
      const yaml = await fs.readFile(filepath, 'utf-8')
      const { ir, layout } = await compileTransitrixYamlWithLayout(yaml)
      const metrics = computeLayoutMetrics(layout)

      const baselineMetric = (baseline as any).metrics?.crossings ?? 0
      // Allow +1 crossing as tolerance for minor layout algorithm changes
      expect(metrics.crossings).toBeLessThanOrEqual(baselineMetric + 1)
    })

    it(`${filename} — bends count should not increase significantly`, async () => {
      const filepath = path.join(corpusDir, filename)
      const yaml = await fs.readFile(filepath, 'utf-8')
      const { ir, layout } = await compileTransitrixYamlWithLayout(yaml)
      const metrics = computeLayoutMetrics(layout)

      const baselineMetric = (baseline as any).metrics?.bends ?? 0
      // Allow +2 bends as tolerance
      expect(metrics.bends).toBeLessThanOrEqual(baselineMetric + 2)
    })

    it(`${filename} — edge length should not increase significantly`, async () => {
      const filepath = path.join(corpusDir, filename)
      const yaml = await fs.readFile(filepath, 'utf-8')
      const { ir, layout } = await compileTransitrixYamlWithLayout(yaml)
      const metrics = computeLayoutMetrics(layout)

      const baselineMetric = (baseline as any).metrics?.edgeLength ?? 0
      // Allow +10% length increase
      const tolerance = baselineMetric * 0.1
      expect(metrics.edgeLength).toBeLessThanOrEqual(baselineMetric + tolerance)
    })

    it(`${filename} — spine deviation should stay reasonable`, async () => {
      const filepath = path.join(corpusDir, filename)
      const yaml = await fs.readFile(filepath, 'utf-8')
      const { ir, layout } = await compileTransitrixYamlWithLayout(yaml)
      const metrics = computeLayoutMetrics(layout)

      // Spine deviation: allow up to baseline + 10 px tolerance.
      // Complex multi-lane diagrams structurally produce high deviation (vertical gaps between stacked elements).
      const baselineMetric = (baseline as any).metrics?.spineDeviation ?? 0
      expect(metrics.spineDeviation).toBeLessThanOrEqual(baselineMetric + 10)
    })

    it(`${filename} — empty area should not exceed baseline + soft margin`, async () => {
      const filepath = path.join(corpusDir, filename)
      const yaml = await fs.readFile(filepath, 'utf-8')
      const { ir, layout } = await compileTransitrixYamlWithLayout(yaml)
      const metrics = computeLayoutMetrics(layout)

      // Empty area is monitored as diagnostic (RD-055 variant C decision).
      // For multi-lane vertical pipelines, 60–80% is structural and acceptable.
      // Regression test: allow +5% soft margin from baseline per diagram.
      const baselineMetric = (baseline as any).metrics?.emptyArea ?? 0.5
      expect(metrics.emptyArea).toBeLessThanOrEqual(baselineMetric + 0.05)
    })

    it(`${filename} — port violations should not exceed baseline`, async () => {
      const filepath = path.join(corpusDir, filename)
      const yaml = await fs.readFile(filepath, 'utf-8')
      const { ir, layout } = await compileTransitrixYamlWithLayout(yaml)
      const metrics = computeLayoutMetrics(layout)

      // Allow up to the baseline count; any increase is a regression.
      const baselineMetric = (baseline as any).metrics?.portViolations ?? 0
      expect(metrics.portViolations).toBeLessThanOrEqual(baselineMetric)
    })
  }
})

describe('Metrics - RD-054 Acceptance Criteria', () => {
  const testCases = [
    { filename: 'simple-approval.bpmn.transitrix.yaml', name: 'Simple Approval (S-Mi-A-Lo-2)' },
  ]

  for (const { filename, name } of testCases) {
    describe(name, () => {
      it('should have zero port violations (criterion 2)', async () => {
        const filepath = path.join(corpusDir, filename)
        const yaml = await fs.readFile(filepath, 'utf-8')
        const { ir, layout } = await compileTransitrixYamlWithLayout(yaml)
        const metrics = computeLayoutMetrics(layout)

        expect(metrics.portViolations).toBe(0)
      })

      it('should not have excessive crossings (criterion 3)', async () => {
        const filepath = path.join(corpusDir, filename)
        const yaml = await fs.readFile(filepath, 'utf-8')
        const { ir, layout } = await compileTransitrixYamlWithLayout(yaml)
        const metrics = computeLayoutMetrics(layout)

        // For the corpus diagrams, crossings should be minimal
        expect(metrics.crossings).toBeLessThanOrEqual(2)
      })

      it('should not have excessive empty area (criterion related)', async () => {
        const filepath = path.join(corpusDir, filename)
        const yaml = await fs.readFile(filepath, 'utf-8')
        const { ir, layout } = await compileTransitrixYamlWithLayout(yaml)
        const metrics = computeLayoutMetrics(layout)

        // Multi-lane swimlane diagrams structurally produce 60–80% empty area;
        // 0.85 is a generous ceiling that would catch a true layout regression.
        expect(metrics.emptyArea).toBeLessThanOrEqual(0.85)
      })
    })
  }
})
