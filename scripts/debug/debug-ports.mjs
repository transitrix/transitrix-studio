#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { compileCervinYamlWithLayout } from '../../dist/compiler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../')
const inputFile = process.argv[2] || path.join(projectRoot, 'tests/fixtures/notation-corpus/bpmn/feature-release.cervin.yaml')
const yaml = await fs.readFile(inputFile, 'utf-8')
const { layout } = await compileCervinYamlWithLayout(yaml, { layout: {} })

function determinePort(waypoints, elementBounds, type) {
  if (!waypoints || waypoints.length < 2) return 'CENTER'

  const centerX = elementBounds.x + elementBounds.width / 2
  const centerY = elementBounds.y + elementBounds.height / 2

  if (type === 'exit') {
    const p1 = waypoints[0]
    const p2 = waypoints[1]
    if (Math.abs(p1.x - p2.x) < 0.01) return 'TOP'
    if (Math.abs(p1.y - p2.y) < 0.01) return p2.x > p1.x ? 'RIGHT' : 'LEFT'
  } else {
    const pn = waypoints[waypoints.length - 1]
    const pn1 = waypoints[waypoints.length - 2]
    if (Math.abs(pn.x - pn1.x) < 0.01) return 'BOTTOM'
    if (Math.abs(pn.y - pn1.y) < 0.01) return pn.x > pn1.x ? 'RIGHT' : 'LEFT'
  }

  return 'CENTER'
}

console.log('\n=== PORT VIOLATIONS ANALYSIS ===\n')

let violCount = 0
for (const flow of layout.flows || []) {
  const fromEl = layout.process?.lanes.flatMap(l => l.elements).find(el => el.id === flow.from)
  const toEl = layout.process?.lanes.flatMap(l => l.elements).find(el => el.id === flow.to)

  if (!fromEl || !toEl) continue

  const isSameLane = fromEl.laneId === toEl.laneId
  const fromBounds = layout.elements.get(fromEl.id)
  const toBounds = layout.elements.get(toEl.id)

  if (!fromBounds || !toBounds) continue

  if (isSameLane) {
    const exitPort = determinePort(flow.waypoints, fromBounds, 'exit')
    const entryPort = determinePort(flow.waypoints, toBounds, 'entry')

    const isViolation = !['LEFT', 'RIGHT'].includes(exitPort) || !['LEFT', 'RIGHT'].includes(entryPort)

    if (isViolation) {
      violCount++
      console.log(`❌ ${flow.from} → ${flow.to}`)
      console.log(`   Lane: ${fromEl.laneId}`)
      console.log(`   Exit: ${exitPort} (from bounds: x ${fromBounds.x.toFixed(0)}-${fromBounds.x + fromBounds.width}, y ${fromBounds.y.toFixed(0)}-${fromBounds.y + fromBounds.height})`)
      console.log(`   Entry: ${entryPort} (to bounds: x ${toBounds.x.toFixed(0)}-${toBounds.x + toBounds.width}, y ${toBounds.y.toFixed(0)}-${toBounds.y + toBounds.height})`)
      console.log(`   Waypoints: ${flow.waypoints.length} points`)
      if (flow.waypoints.length >= 2) {
        console.log(`   First segment: (${flow.waypoints[0].x.toFixed(0)}, ${flow.waypoints[0].y.toFixed(0)}) → (${flow.waypoints[1].x.toFixed(0)}, ${flow.waypoints[1].y.toFixed(0)})`)
      }
      console.log()
    }
  }
}

console.log(`Total violations: ${violCount}`)
