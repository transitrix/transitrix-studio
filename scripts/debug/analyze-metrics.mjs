#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { compileCervinYamlWithLayout } from '../../dist/compiler.js'
import { computeLayoutMetrics } from '../../dist/metrics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../')
const inputFile = process.argv[2] || path.join(projectRoot, 'examples/bpmn/feature-release.cervin.yaml')
const yaml = await fs.readFile(inputFile, 'utf-8')
const { ir, layout } = await compileCervinYamlWithLayout(yaml)
const metrics = computeLayoutMetrics(layout)

console.log(`\n=== CURRENT LAYOUT METRICS (${path.basename(inputFile)}) ===\n`)
console.log('Structural Metrics:')
console.log(`  Crossings:      ${metrics.crossings}`)
console.log(`  Bends:          ${metrics.bends}`)
console.log(`  Edge Length:    ${metrics.edgeLength.toFixed(0)} px`)
console.log(`  Waypoint Dens:  ${metrics.waypointDensity.toFixed(3)}`)

console.log('\nBPMN-Specific Metrics:')
console.log(`  Spine Dev:      ${metrics.spineDeviation.toFixed(2)} px  (RD-054 target: ≤4 px)`)
console.log(`  Empty Area:     ${(metrics.emptyArea * 100).toFixed(1)}%   (RD-054 target: ≤30%)`)
console.log(`  Port Violations:${metrics.portViolations}         (RD-054 target: =0)`)
console.log(`  Port Uniqueness:${metrics.portUniqueness.toFixed(2)}`)
console.log(`  Lane Axis Align:${metrics.laneAxisAlignment.toFixed(2)}`)

console.log('\nLayout IR Stats:')
console.log(`  Lanes:          ${ir.lanes.length}`)
console.log(`  Elements:       ${ir.lanes.reduce((s, l) => s + l.elements.length, 0)}`)
console.log(`  Flows:          ${ir.flows.length}`)

const laneBounds = layout.laneBounds
const elementBounds = layout.elements
let totalLaneWidth = 0
for (const lb of laneBounds.values()) {
  totalLaneWidth = Math.max(totalLaneWidth, lb.width)
}
console.log(`  Max Lane Width: ${totalLaneWidth.toFixed(0)} px`)

// Find max element X position
let maxX = 0
for (const eb of elementBounds.values()) {
  maxX = Math.max(maxX, eb.x + eb.width)
}
console.log(`  Max Element X:  ${maxX.toFixed(0)} px`)

// Lane-wise breakdown
console.log('\nPer-Lane Breakdown:')
for (const lane of ir.lanes) {
  const lb = laneBounds.get(lane.id)
  if (!lb) continue

  let minX = Infinity, maxX = -Infinity
  const elements = lane.elements.filter(el => {
    const eb = elementBounds.get(el.id)
    if (!eb) return false
    minX = Math.min(minX, eb.x)
    maxX = Math.max(maxX, eb.x + eb.width)
    return true
  })

  if (minX === Infinity) continue

  const usedW = maxX - minX
  const contentW = lb.width - 72 - 40  // subtract laneLabelWidth and laneContentRightPad
  const emptiness = ((contentW - usedW) / contentW * 100).toFixed(1)

  console.log(`  ${lane.id.padEnd(20)} elements: ${elements.length.toString().padStart(2)}  width: ${contentW.toFixed(0).padStart(4)} px (used: ${usedW.toFixed(0).padStart(4)} px, empty: ${emptiness}%)`)
}
