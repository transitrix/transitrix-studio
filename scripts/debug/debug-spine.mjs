#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { compileTransitrixYamlWithLayout } from '../../dist/compiler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../')
const inputFile = process.argv[2] || path.join(projectRoot, 'tests/fixtures/notation-corpus/bpmn/feature-release.cervin.yaml')
const yaml = await fs.readFile(inputFile, 'utf-8')
const { layout } = await compileTransitrixYamlWithLayout(yaml, { layout: {} })

console.log('\n=== SPINE DEVIATION ANALYSIS ===\n')

for (const lane of layout.process.lanes) {
  const laneBounds = layout.laneBounds.get(lane.id)
  if (!laneBounds) continue

  const axisY = laneBounds.y + laneBounds.height / 2
  console.log(`Lane: ${lane.name} (axis Y = ${axisY.toFixed(0)} px, lane H = ${laneBounds.height})`)

  // Group elements by column
  const byColumn = new Map()
  for (const el of lane.elements) {
    const elBounds = layout.elements.get(el.id)
    if (!elBounds) continue

    const col = Math.round(elBounds.x)
    if (!byColumn.has(col)) byColumn.set(col, [])
    byColumn.get(col).push({ id: el.id, name: el.name, bounds: elBounds })
  }

  for (const [col, items] of Array.from(byColumn.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`  Column X≈${col}:`)
    for (const item of items) {
      const centerY = item.bounds.y + item.bounds.height / 2
      const deviation = Math.abs(centerY - axisY)
      const stacked = items.length > 1 ? ' (stacked)' : ' (alone)'
      console.log(`    ${item.id.padEnd(20)} centerY=${centerY.toFixed(0).padStart(4)} dev=${deviation.toFixed(1).padStart(6)} px${stacked}`)
    }
  }
  console.log()
}
