/**
 * Layout Quality Metrics
 *
 * Computes objective, measurable indicators of BPMN diagram layout quality.
 * All functions are pure, deterministic, and inexpensive (polynomial time).
 *
 * See `docs/internal/metrics.md` for formal definitions and rationale.
 */

import type { LayoutIr, Bounds, PositionedSequenceFlow, FlowElement } from './ir.js';
import { GATEWAY_TYPES } from './ir.js'

/**
 * Result of layout metrics computation.
 * All values are deterministic functions of LayoutIr.
 */
export interface LayoutMetrics {
  // Structural metrics
  crossings: number
  bends: number
  edgeLength: number
  waypointDensity: number

  // BPMN-specific metrics
  spineDeviation: number
  emptyArea: number
  portViolations: number
  portUniqueness: number
  laneAxisAlignment: number

  // Composite score
  layoutScore: number
}

/**
 * Configuration for score computation.
 * Baseline values are set after the first corpus run (RD-088).
 */
export interface ScoreConfig {
  crossingsBaseline: number
  spineDeviationBaseline: number
  portViolationsBaseline: number
}

/**
 * Compute all layout metrics for a given LayoutIr.
 * @param layout - The positioned layout
 * @param scoreConfig - Baseline values for normalization (optional; if omitted, score defaults to 0)
 * @returns LayoutMetrics with all metrics and composite score
 */
export function computeLayoutMetrics(
  layout: LayoutIr,
  scoreConfig?: ScoreConfig,
): LayoutMetrics {
  const crossings = countCrossings(layout)
  const bends = countBends(layout)
  const edgeLength = computeEdgeLength(layout)
  const waypointDensity = computeWaypointDensity(layout)
  const spineDeviation = computeSpineDeviation(layout)
  const emptyArea = computeEmptyArea(layout)
  const portViolations = countPortViolations(layout)
  const portUniqueness = computePortUniqueness(layout)
  const laneAxisAlignment = computeLaneAxisAlignment(layout)

  const layoutScore = scoreConfig
    ? computeLayoutScore({
        crossings,
        spineDeviation,
        portViolations,
        emptyArea,
        laneAxisAlignment,
        ...scoreConfig,
      })
    : 0

  return {
    crossings,
    bends,
    edgeLength,
    waypointDensity,
    spineDeviation,
    emptyArea,
    portViolations,
    portUniqueness,
    laneAxisAlignment,
    layoutScore,
  }
}

/**
 * Count orthogonal segment intersections in the final routing.
 * Two flows intersect if their orthogonal paths cross at an interior point.
 * Shared endpoints do not count as a crossing.
 */
export function countCrossings(layout: LayoutIr): number {
  const flows = layout.flows
  if (!flows || flows.length < 2) return 0

  let count = 0
  for (let i = 0; i < flows.length; i++) {
    for (let j = i + 1; j < flows.length; j++) {
      if (pathsIntersect(flows[i].waypoints, flows[j].waypoints)) {
        count++
      }
    }
  }
  return count
}

/**
 * Check if two orthogonal paths intersect at an interior point.
 */
function pathsIntersect(path1: Array<{ x: number; y: number }>, path2: Array<{ x: number; y: number }>): boolean {
  if (!path1 || !path2 || path1.length < 2 || path2.length < 2) return false

  for (let i = 0; i < path1.length - 1; i++) {
    for (let j = 0; j < path2.length - 1; j++) {
      const seg1 = [path1[i], path1[i + 1]] as const
      const seg2 = [path2[j], path2[j + 1]] as const
      if (orthogonalSegmentsIntersect(seg1, seg2)) {
        return true
      }
    }
  }
  return false
}

/**
 * Check if two orthogonal segments intersect at an interior point.
 * Both segments must be axis-aligned.
 */
function orthogonalSegmentsIntersect(
  seg1: readonly [{ x: number; y: number }, { x: number; y: number }],
  seg2: readonly [{ x: number; y: number }, { x: number; y: number }],
): boolean {
  const [p1, p2] = seg1
  const [p3, p4] = seg2

  const seg1Vertical = Math.abs(p1.x - p2.x) < 0.01
  const seg1Horizontal = Math.abs(p1.y - p2.y) < 0.01
  const seg2Vertical = Math.abs(p3.x - p4.x) < 0.01
  const seg2Horizontal = Math.abs(p3.y - p4.y) < 0.01

  // One must be vertical, the other horizontal
  if (seg1Vertical && seg2Horizontal) {
    const x = p1.x
    const y = p3.y
    const xInRange = x > Math.min(p3.x, p4.x) && x < Math.max(p3.x, p4.x)
    const yInRange = y > Math.min(p1.y, p2.y) && y < Math.max(p1.y, p2.y)
    return xInRange && yInRange
  }

  if (seg1Horizontal && seg2Vertical) {
    const x = p3.x
    const y = p1.y
    const xInRange = x > Math.min(p1.x, p2.x) && x < Math.max(p1.x, p2.x)
    const yInRange = y > Math.min(p3.y, p4.y) && y < Math.max(p3.y, p4.y)
    return xInRange && yInRange
  }

  return false
}

/**
 * Count total direction changes (90° turns) in all sequence flows.
 * A straight path with no turns has 0 bends.
 */
export function countBends(layout: LayoutIr): number {
  const flows = layout.flows
  if (!flows) return 0

  let totalBends = 0
  for (const flow of flows) {
    totalBends += computeFlowBends(flow.waypoints)
  }
  return totalBends
}

/**
 * Count bends in a single flow waypoint path.
 * A flow with waypoints [p1, p2, p3] where p1→p2→p3 are collinear has 0 bends.
 * A turn [p1, p2, p3] where p1→p2 is orthogonal to p2→p3 has 1 bend at p2.
 */
function computeFlowBends(waypoints: Array<{ x: number; y: number }>): number {
  if (!waypoints || waypoints.length < 3) return 0

  let bends = 0
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1]
    const curr = waypoints[i]
    const next = waypoints[i + 1]

    // Check if there's a 90° turn at curr
    const prevDir = { x: curr.x - prev.x, y: curr.y - prev.y }
    const nextDir = { x: next.x - curr.x, y: next.y - curr.y }

    // Orthogonal if one is horizontal and the other is vertical
    const prevHorizontal = Math.abs(prevDir.y) < 0.01
    const nextVertical = Math.abs(nextDir.x) < 0.01
    const prevVertical = Math.abs(prevDir.x) < 0.01
    const nextHorizontal = Math.abs(nextDir.y) < 0.01

    if ((prevHorizontal && nextVertical) || (prevVertical && nextHorizontal)) {
      bends++
    }
  }

  return bends
}

/**
 * Compute sum of Manhattan distances of all flow segments.
 */
export function computeEdgeLength(layout: LayoutIr): number {
  const flows = layout.flows
  if (!flows) return 0

  let totalLength = 0
  for (const flow of flows) {
    totalLength += computeFlowLength(flow.waypoints)
  }
  return totalLength
}

/**
 * Compute Manhattan distance of a single flow.
 */
function computeFlowLength(waypoints: Array<{ x: number; y: number }>): number {
  if (!waypoints || waypoints.length < 2) return 0

  let length = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i]
    const p2 = waypoints[i + 1]
    length += Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y)
  }
  return length
}

/**
 * Compute average number of waypoints per flow.
 */
export function computeWaypointDensity(layout: LayoutIr): number {
  const flows = layout.flows
  if (!flows || flows.length === 0) return 0

  const totalWaypoints = flows.reduce((sum: number, f: PositionedSequenceFlow) => sum + (f.waypoints?.length || 0), 0)
  return totalWaypoints / flows.length
}

/**
 * Compute spine deviation: max deviation of "happy path" elements from lane axis.
 * Per-lane metric; aggregate is the median across all lanes.
 */
export function computeSpineDeviation(layout: LayoutIr): number {
  const lanes = layout.process?.lanes || []
  if (lanes.length === 0) return 0

  const laneDeviations: number[] = []
  for (const lane of lanes) {
    const laneBounds = layout.laneBounds.get(lane.id)
    if (!laneBounds) continue

    const axisY = laneBounds.y + laneBounds.height / 2
    const elements = lane.elements || []

    if (elements.length === 0) continue

    const maxDev = Math.max(
      ...elements.map((el: FlowElement) => {
        const elBounds = layout.elements.get(el.id)
        if (!elBounds) return 0
        return Math.abs(elBounds.y + elBounds.height / 2 - axisY)
      }),
    )
    laneDeviations.push(maxDev)
  }

  return laneDeviations.length > 0 ? median(laneDeviations) : 0
}

/**
 * Compute empty area ratio: median of (empty area / lane bbox area) across all lanes.
 * Lanes with ≤1 element are excluded.
 */
export function computeEmptyArea(layout: LayoutIr): number {
  const lanes = layout.process?.lanes || []
  if (lanes.length === 0) return 0

  const ratios: number[] = []
  for (const lane of lanes) {
    const elements = lane.elements || []
    if (elements.length <= 1) continue

    const laneBounds = layout.laneBounds.get(lane.id)
    if (!laneBounds) continue

    // Compute lane bounding box from element bounds
    let minX = Infinity,
      maxX = -Infinity
    let minY = Infinity,
      maxY = -Infinity
    for (const el of elements) {
      const elBounds = layout.elements.get(el.id)
      if (!elBounds) continue
      minX = Math.min(minX, elBounds.x)
      maxX = Math.max(maxX, elBounds.x + elBounds.width)
      minY = Math.min(minY, elBounds.y)
      maxY = Math.max(maxY, elBounds.y + elBounds.height)
    }

    if (minX === Infinity) continue

    const laneBoxArea = (maxX - minX) * (maxY - minY)
    const occupiedArea = elements.reduce((sum: number, el: FlowElement) => {
      const elBounds = layout.elements.get(el.id)
      return sum + (elBounds ? elBounds.width * elBounds.height : 0)
    }, 0)
    const emptyArea = laneBoxArea - occupiedArea

    const ratio = emptyArea / laneBoxArea
    ratios.push(ratio)
  }

  return ratios.length > 0 ? median(ratios) : 0
}

/**
 * Count flows that violate the horizontal port rule.
 * Same-lane flows must exit/enter LEFT or RIGHT.
 * Cross-lane flows may exit/enter TOP/BOTTOM if target is adjacent.
 */
export function countPortViolations(layout: LayoutIr): number {
  const flows = layout.flows
  if (!flows) return 0

  const elementMap = new Map<string, FlowElement>()
  for (const lane of layout.process?.lanes ?? []) {
    for (const el of lane.elements) {
      elementMap.set(el.id, el)
    }
  }

  let violations = 0
  for (const flow of flows) {
    const fromEl = elementMap.get(flow.from)
    const toEl = elementMap.get(flow.to)

    if (!fromEl || !toEl) continue

    const isSameLane = fromEl.laneId === toEl.laneId
    const fromBounds = layout.elements.get(fromEl.id)
    const toBounds = layout.elements.get(toEl.id)

    if (!fromBounds || !toBounds) continue

    // Determine exit and entry ports from waypoints
    const exitPort = determinePort(flow.waypoints, fromBounds, 'exit')
    const entryPort = determinePort(flow.waypoints, toBounds, 'entry')

    if (isSameLane) {
      // Entry must always be LEFT or RIGHT.
      // Exit must be LEFT or RIGHT for non-gateways.
      // Gateways may also exit TOP (target above) or BOTTOM (target below) — R2 vertex rule.
      const isSourceGateway = GATEWAY_TYPES.has(fromEl.type)
      const validExit = isSourceGateway
        ? ['LEFT', 'RIGHT', 'TOP', 'BOTTOM'].includes(exitPort)
        : ['LEFT', 'RIGHT'].includes(exitPort)
      if (!validExit || !['LEFT', 'RIGHT'].includes(entryPort)) {
        violations++
      }
    } else {
      // Cross-lane: validate using lane ordering
      const sourceLaneIdx = layout.process?.lanes.findIndex((l) => l.id === fromEl.laneId)
      const targetLaneIdx = layout.process?.lanes.findIndex((l) => l.id === toEl.laneId)

      if (sourceLaneIdx === undefined || targetLaneIdx === undefined) continue

      if (sourceLaneIdx < targetLaneIdx) {
        // Target lane is below source: exit must be RIGHT or BOTTOM.
        // Entry: determinePort returns the direction-of-travel of the last segment, not the
        // physical side of the target. Rightward last segment (RIGHT) = entering LEFT side of
        // target (normal). Downward last segment (BOTTOM) = entering TOP of target (straight-down).
        if (!['RIGHT', 'BOTTOM'].includes(exitPort) || !['RIGHT', 'BOTTOM'].includes(entryPort)) {
          violations++
        }
      } else if (sourceLaneIdx > targetLaneIdx) {
        // Target lane is above source: exit must be RIGHT or TOP.
        // Rightward last segment (RIGHT) = entering LEFT side of target (normal).
        // Upward last segment (TOP) = entering BOTTOM of target (straight-up).
        if (!['RIGHT', 'TOP'].includes(exitPort) || !['RIGHT', 'TOP'].includes(entryPort)) {
          violations++
        }
      }
      // Note: sourceLaneIdx === targetLaneIdx should not occur (same-lane case handled above)
    }
  }

  return violations
}

/**
 * Determine exit or entry port based on the first/last segment direction.
 */
function determinePort(
  waypoints: Array<{ x: number; y: number }>,
  elementBounds: Bounds,
  type: 'exit' | 'entry',
): string {
  if (!waypoints || waypoints.length < 2) return 'CENTER'

  const centerX = elementBounds.x + elementBounds.width / 2
  const centerY = elementBounds.y + elementBounds.height / 2

  if (type === 'exit') {
    const p1 = waypoints[0]
    const p2 = waypoints[1]
    if (Math.abs(p1.x - p2.x) < 0.01) {
      // Vertical segment: determine direction by comparing Y coordinates
      return p2.y > p1.y ? 'BOTTOM' : 'TOP'
    }
    if (Math.abs(p1.y - p2.y) < 0.01) return p2.x > p1.x ? 'RIGHT' : 'LEFT'
  } else {
    const pn = waypoints[waypoints.length - 1]
    const pn1 = waypoints[waypoints.length - 2]
    if (Math.abs(pn.x - pn1.x) < 0.01) {
      // Vertical segment: determine direction by comparing Y coordinates
      return pn.y > pn1.y ? 'BOTTOM' : 'TOP'
    }
    if (Math.abs(pn.y - pn1.y) < 0.01) return pn.x > pn1.x ? 'RIGHT' : 'LEFT'
  }

  return 'CENTER'
}

/**
 * Compute port uniqueness: fraction of distinct ports used at gateways with ≥2 outgoing flows.
 * Mean across all such gateways.
 */
export function computePortUniqueness(layout: LayoutIr): number {
  const gateways = layout.process?.lanes
    .flatMap((l) => l.elements)
    .filter((el) => GATEWAY_TYPES.has(el.type)) ?? []

  if (gateways.length === 0) return 1.0

  let sumUniqueness = 0
  let countGateways = 0

  for (const gw of gateways) {
    const outflows = layout.flows.filter((f) => f.from === gw.id)
    if (outflows.length < 2) continue

    const portsUsed = new Set<string>()
    const gwBounds = layout.elements.get(gw.id)
    if (!gwBounds) continue

    for (const flow of outflows) {
      const port = determinePort(flow.waypoints, gwBounds, 'exit')
      portsUsed.add(port)
    }

    const uniqueness = portsUsed.size / outflows.length
    sumUniqueness += uniqueness
    countGateways++
  }

  return countGateways > 0 ? sumUniqueness / countGateways : 1.0
}

/**
 * Compute lane axis alignment: fraction of single-column elements snapped to their lane axis.
 * An element is single-column if it's alone in its X range within its lane.
 * On-axis means |center.y - axisY| ≤ 4 px.
 */
export function computeLaneAxisAlignment(layout: LayoutIr): number {
  const lanes = layout.process?.lanes || []
  if (lanes.length === 0) return 1.0

  let totalOnAxis = 0
  let totalSingleColumn = 0

  for (const lane of lanes) {
    const elements = lane.elements || []
    if (elements.length === 0) continue

    const laneBounds = layout.laneBounds.get(lane.id)
    if (!laneBounds) continue

    // Group by rounded X coordinate
    const columnGroups = new Map<number, typeof elements>()
    for (const el of elements) {
      const elBounds = layout.elements.get(el.id)
      if (!elBounds) continue
      const roundedX = Math.round((elBounds.x + elBounds.width / 2) / 10) * 10 // group by 10px grid
      if (!columnGroups.has(roundedX)) {
        columnGroups.set(roundedX, [])
      }
      columnGroups.get(roundedX)!.push(el)
    }

    // Count single-column elements on axis
    const axisY = laneBounds.y + laneBounds.height / 2
    for (const [, group] of columnGroups) {
      if (group.length === 1) {
        totalSingleColumn++
        const el = group[0]
        const elBounds = layout.elements.get(el.id)
        if (elBounds && Math.abs(elBounds.y + elBounds.height / 2 - axisY) <= 4) {
          totalOnAxis++
        }
      }
    }
  }

  return totalSingleColumn > 0 ? totalOnAxis / totalSingleColumn : 1.0
}

/**
 * Compute aggregate layout score.
 * Multiplicative formula with normalized metrics.
 */
export interface ScoreInput {
  crossings: number
  spineDeviation: number
  portViolations: number
  emptyArea: number
  laneAxisAlignment: number
  crossingsBaseline: number
  spineDeviationBaseline: number
  portViolationsBaseline: number
}

export function computeLayoutScore(input: ScoreInput): number {
  const crossingsNorm = Math.min(input.crossings / Math.max(input.crossingsBaseline, 1), 1.0)
  const spineDevNorm = Math.min(input.spineDeviation / Math.max(input.spineDeviationBaseline, 0.1), 1.0)
  const portViolNorm = Math.min(input.portViolations / Math.max(input.portViolationsBaseline, 1), 1.0)
  const emptyAreaNorm = input.emptyArea

  return (
    1000 *
    (1 - crossingsNorm) *
    (1 - spineDevNorm) *
    (1 - portViolNorm) *
    (1 - emptyAreaNorm) *
    input.laneAxisAlignment
  )
}

/**
 * Compute median of an array of numbers.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
