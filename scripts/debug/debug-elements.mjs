#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { compileCervinYamlWithLayout } from '../../dist/compiler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../')
const inputFile = process.argv[2] || path.join(projectRoot, 'examples/bpmn/feature-release.cervin.yaml')
const yaml = await fs.readFile(inputFile, 'utf-8')
const { ir, layout } = await compileCervinYamlWithLayout(yaml)

console.log('\n=== ELEMENT POSITIONS (sorted by X) ===\n')

// Collect all elements with their positions
const elements = []
for (const [id, bounds] of layout.elements) {
  const ir_el = ir.lanes.flatMap(l => l.elements).find(e => e.id === id)
  const lane = ir.lanes.find(l => l.elements.some(e => e.id === id))
  elements.push({
    id,
    name: ir_el?.name || id,
    lane: lane?.name || 'unknown',
    x: bounds.x,
    xEnd: bounds.x + bounds.width,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  })
}

elements.sort((a, b) => a.xEnd - b.xEnd)

for (const el of elements) {
  console.log(`${el.xEnd.toFixed(0).padStart(4)} px  [${el.x.toFixed(0).padStart(4)}-${el.xEnd.toFixed(0).padStart(4)}]  ${el.id.padEnd(20)} "${el.name}" (${el.lane})`)
}

// Find element by max x
const maxEl = elements[elements.length - 1]
console.log(`\n=== RIGHTMOST ELEMENT ===`)
console.log(`ID: ${maxEl.id}`)
console.log(`Name: ${maxEl.name}`)
console.log(`Lane: ${maxEl.lane}`)
console.log(`Position: X ${maxEl.x.toFixed(0)}-${maxEl.xEnd.toFixed(0)} (width ${maxEl.width})`)

// Check ELK layers from global pass
console.log(`\n=== GLOBAL ELK GRAPH ===`)
const globalFlows = ir.flows
const islandsByX = new Map()
for (const [id, bounds] of layout.elements) {
  const x = Math.round(bounds.x)
  if (!islandsByX.has(x)) islandsByX.set(x, [])
  islandsByX.get(x).push(id)
}

const sortedXs = Array.from(islandsByX.keys()).sort((a, b) => a - b)
console.log(`Layer columns (X positions): ${sortedXs.length} total`)
for (let i = 0; i < Math.min(sortedXs.length, 10); i++) {
  const x = sortedXs[i]
  const ids = islandsByX.get(x) || []
  console.log(`  Layer ${i}: X≈${x}px, ${ids.length} element(s)`)
}
if (sortedXs.length > 10) {
  const lastX = sortedXs[sortedXs.length - 1]
  const ids = islandsByX.get(lastX) || []
  console.log(`  ... (${sortedXs.length - 10} more layers)`)
  console.log(`  Layer ${sortedXs.length - 1}: X≈${lastX}px, ${ids.length} element(s)`)
}
