#!/usr/bin/env node
/**
 * Measure baseline metrics for the test corpus
 *
 * Compiles all corpus diagrams, computes layout metrics, and stores results
 * in tests/snapshots/metrics-baseline.json for regression testing.
 *
 * Usage: node scripts/measure-baseline.mjs
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { compileCervinYamlWithLayout } from '../dist/compiler.js'
import { computeLayoutMetrics } from '../dist/metrics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const examplesDir = path.join(projectRoot, 'examples', 'bpmn')
const snapshotsDir = path.join(projectRoot, 'tests', 'snapshots')
const baselineFile = path.join(snapshotsDir, 'metrics-baseline.json')

/**
 * Find all BPMN example YAML files (*.bpmn.yaml)
 */
async function findCorpusFiles() {
  const files = await fs.readdir(examplesDir)
  return files
    .filter((f) => f.endsWith('.bpmn.yaml'))
    .map((f) => path.join(examplesDir, f))
    .sort()
}

/**
 * Run baseline measurement
 */
async function main() {
  try {
    const corpusFiles = await findCorpusFiles()
    if (corpusFiles.length === 0) {
      console.warn('⚠️  No corpus files found in', examplesDir)
      process.exit(1)
    }

    console.log(`📊 Measuring baseline metrics for ${corpusFiles.length} diagrams...`)

    const results = {}
    let successCount = 0
    let errorCount = 0

    for (const filepath of corpusFiles) {
      const filename = path.basename(filepath)
      try {
        const yaml = await fs.readFile(filepath, 'utf-8')
        const { ir, layout } = await compileCervinYamlWithLayout(yaml)

        const metrics = computeLayoutMetrics(layout)
        const elementCount = ir.lanes.reduce((sum, l) => sum + l.elements.length, 0)
        const flowCount = ir.flows.length

        results[filename] = {
          status: 'success',
          elementCount,
          flowCount,
          metrics,
          timestamp: new Date().toISOString(),
        }

        console.log(`✓ ${filename}`)
        console.log(`  - Elements: ${elementCount}, Flows: ${flowCount}`)
        console.log(`  - Crossings: ${metrics.crossings}, Bends: ${metrics.bends}, Length: ${Math.round(metrics.edgeLength)}`)
        console.log(
          `  - SpineDev: ${Math.round(metrics.spineDeviation * 10) / 10}, EmptyArea: ${Math.round(metrics.emptyArea * 100)}%`,
        )
        successCount++
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        results[filename] = {
          status: 'error',
          error: msg,
        }
        console.error(`✗ ${filename}: ${msg}`)
        errorCount++
      }
    }

    // Create snapshots directory if needed
    await fs.mkdir(snapshotsDir, { recursive: true })

    // Write baseline
    const baseline = {
      version: '0.1',
      date: new Date().toISOString(),
      corpusCount: corpusFiles.length,
      successCount,
      errorCount,
      results,
    }

    await fs.writeFile(baselineFile, JSON.stringify(baseline, null, 2) + '\n', 'utf-8')

    console.log(`\n✅ Baseline saved to ${baselineFile}`)
    console.log(`   ${successCount} succeeded, ${errorCount} failed`)

    if (errorCount > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

main()
