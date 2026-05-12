import { describe, it, expect } from 'vitest'
import {
  countCrossings,
  countBends,
  computeEdgeLength,
  computeWaypointDensity,
  computeSpineDeviation,
  computeEmptyArea,
  countPortViolations,
  computePortUniqueness,
  computeLaneAxisAlignment,
  computeLayoutScore,
} from '../src/metrics.js'
import * as geom from '../src/metrics-geometry.js'
import type { LayoutIr } from '../src/ir.js'

describe('Geometric Primitives', () => {
  describe('orthogonalSegmentsIntersect', () => {
    it('should detect horizontal-vertical intersection', () => {
      const seg1 = { start: { x: 10, y: 15 }, end: { x: 10, y: 25 } }
      const seg2 = { start: { x: 5, y: 20 }, end: { x: 15, y: 20 } }
      expect(geom.orthogonalSegmentsIntersect(seg1, seg2)).toBe(true)
    })

    it('should return false for parallel segments', () => {
      const seg1 = { start: { x: 10, y: 10 }, end: { x: 10, y: 20 } }
      const seg2 = { start: { x: 20, y: 10 }, end: { x: 20, y: 20 } }
      expect(geom.orthogonalSegmentsIntersect(seg1, seg2)).toBe(false)
    })

    it('should return false for non-intersecting orthogonal segments', () => {
      const seg1 = { start: { x: 10, y: 10 }, end: { x: 10, y: 20 } }
      const seg2 = { start: { x: 15, y: 5 }, end: { x: 25, y: 5 } }
      expect(geom.orthogonalSegmentsIntersect(seg1, seg2)).toBe(false)
    })

    it('should return false for touching endpoints', () => {
      const seg1 = { start: { x: 10, y: 10 }, end: { x: 10, y: 20 } }
      const seg2 = { start: { x: 10, y: 20 }, end: { x: 20, y: 20 } }
      expect(geom.orthogonalSegmentsIntersect(seg1, seg2)).toBe(false)
    })
  })

  describe('distance functions', () => {
    it('should compute Manhattan distance', () => {
      const p1 = { x: 0, y: 0 }
      const p2 = { x: 3, y: 4 }
      expect(geom.manhattanDistance(p1, p2)).toBe(7)
    })

    it('should compute Euclidean distance', () => {
      const p1 = { x: 0, y: 0 }
      const p2 = { x: 3, y: 4 }
      expect(geom.euclideanDistance(p1, p2)).toBeCloseTo(5, 1)
    })
  })

  describe('polylineLength', () => {
    it('should compute length of horizontal-vertical polyline', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 20 },
      ]
      expect(geom.polylineLength(points)).toBe(30)
    })

    it('should return 0 for single point', () => {
      const points = [{ x: 0, y: 0 }]
      expect(geom.polylineLength(points)).toBe(0)
    })
  })

  describe('countPolylineBends', () => {
    it('should count one bend in L-shape', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]
      expect(geom.countPolylineBends(points)).toBe(1)
    })

    it('should count two bends in Z-shape', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 10 },
      ]
      expect(geom.countPolylineBends(points)).toBe(2)
    })

    it('should return 0 for straight line', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ]
      expect(geom.countPolylineBends(points)).toBe(0)
    })
  })

  describe('rectangle utilities', () => {
    it('should check point in rectangle', () => {
      const rect = { x: 0, y: 0, width: 10, height: 10 }
      expect(geom.pointInRectangle({ x: 5, y: 5 }, rect)).toBe(true)
      expect(geom.pointInRectangle({ x: 15, y: 5 }, rect)).toBe(false)
    })

    it('should compute bounding rectangle', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
      ]
      const bbox = geom.boundingRectangle(points)
      expect(bbox).toEqual({ x: 0, y: 0, width: 10, height: 20 })
    })

    it('should check rectangle overlap', () => {
      const rect1 = { x: 0, y: 0, width: 10, height: 10 }
      const rect2 = { x: 5, y: 5, width: 10, height: 10 }
      expect(geom.rectanglesOverlap(rect1, rect2)).toBe(true)

      const rect3 = { x: 20, y: 20, width: 10, height: 10 }
      expect(geom.rectanglesOverlap(rect1, rect3)).toBe(false)
    })

    it('should compute rectangle center', () => {
      const rect = { x: 0, y: 0, width: 10, height: 10 }
      const center = geom.rectangleCenter(rect)
      expect(center).toEqual({ x: 5, y: 5 })
    })
  })
})

describe('Layout Metrics', () => {
  describe('countBends', () => {
    it('should count bends correctly on L-shape flow', () => {
      const layout: Partial<LayoutIr> = {
        flows: [
          {
            id: 'f1',
            from: 'a',
            to: 'b',
            waypoints: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
            ],
          },
        ] as PositionedSequenceFlow[],
      }
      expect(countBends(layout as LayoutIr)).toBe(1)
    })

    it('should return 0 for straight flow', () => {
      const layout: Partial<LayoutIr> = {
        flows: [
          {
            id: 'f1',
            from: 'a',
            to: 'b',
            waypoints: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
          },
        ] as PositionedSequenceFlow[],
      }
      expect(countBends(layout as LayoutIr)).toBe(0)
    })

    it('should handle multiple flows', () => {
      const layout: Partial<LayoutIr> = {
        flows: [
          {
            id: 'f1',
            from: 'a',
            to: 'b',
            waypoints: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
            ],
          },
          {
            id: 'f2',
            from: 'b',
            to: 'c',
            waypoints: [
              { x: 10, y: 10 },
              { x: 20, y: 10 },
              { x: 20, y: 20 },
              { x: 30, y: 20 },
            ],
          },
        ] as PositionedSequenceFlow[],
      }
      expect(countBends(layout as LayoutIr)).toBe(3) // 1 + 2
    })
  })

  describe('computeEdgeLength', () => {
    it('should compute total Manhattan distance of flows', () => {
      const layout: Partial<LayoutIr> = {
        flows: [
          {
            id: 'f1',
            from: 'a',
            to: 'b',
            waypoints: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
            ],
          },
        ] as PositionedSequenceFlow[],
      }
      expect(computeEdgeLength(layout as LayoutIr)).toBe(20) // 10 + 10
    })
  })

  describe('computeWaypointDensity', () => {
    it('should compute average waypoints per flow', () => {
      const layout: Partial<LayoutIr> = {
        flows: [
          {
            id: 'f1',
            from: 'a',
            to: 'b',
            waypoints: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
            ],
          },
          {
            id: 'f2',
            from: 'b',
            to: 'c',
            waypoints: [
              { x: 10, y: 10 },
              { x: 20, y: 10 },
            ],
          },
        ] as PositionedSequenceFlow[],
      }
      expect(computeWaypointDensity(layout as LayoutIr)).toBe(2.5) // (3 + 2) / 2
    })
  })

  describe('computeLayoutScore', () => {
    it('should compute a positive score for good layout', () => {
      const score = computeLayoutScore({
        crossings: 0,
        spineDeviation: 2,
        portViolations: 0,
        emptyArea: 0.2,
        laneAxisAlignment: 0.95,
        crossingsBaseline: 5,
        spineDeviationBaseline: 8,
        portViolationsBaseline: 3,
      })
      expect(score).toBeGreaterThan(500) // Should be good
    })

    it('should penalize crossings heavily', () => {
      const scoreGood = computeLayoutScore({
        crossings: 0,
        spineDeviation: 2,
        portViolations: 0,
        emptyArea: 0.2,
        laneAxisAlignment: 0.95,
        crossingsBaseline: 5,
        spineDeviationBaseline: 8,
        portViolationsBaseline: 3,
      })

      const scoreBad = computeLayoutScore({
        crossings: 10,
        spineDeviation: 2,
        portViolations: 0,
        emptyArea: 0.2,
        laneAxisAlignment: 0.95,
        crossingsBaseline: 5,
        spineDeviationBaseline: 8,
        portViolationsBaseline: 3,
      })

      expect(scoreBad).toBeLessThan(scoreGood)
    })

    it('should penalize empty area', () => {
      const scoreCompact = computeLayoutScore({
        crossings: 0,
        spineDeviation: 2,
        portViolations: 0,
        emptyArea: 0.1,
        laneAxisAlignment: 0.95,
        crossingsBaseline: 5,
        spineDeviationBaseline: 8,
        portViolationsBaseline: 3,
      })

      const scoreSpaced = computeLayoutScore({
        crossings: 0,
        spineDeviation: 2,
        portViolations: 0,
        emptyArea: 0.7,
        laneAxisAlignment: 0.95,
        crossingsBaseline: 5,
        spineDeviationBaseline: 8,
        portViolationsBaseline: 3,
      })

      expect(scoreSpaced).toBeLessThan(scoreCompact)
    })
  })
})

describe('Metrics on Empty/Minimal Inputs', () => {
  it('should handle empty flow list', () => {
    const layout: Partial<LayoutIr> = {
      flows: [],
      process: {
        id: 'p1',
        name: 'Empty',
        poolId: 'pool1',
        poolName: 'Pool',
        lanes: [],
        flows: [],
      },
      elements: new Map(),
      laneBounds: new Map(),
      poolBounds: { x: 0, y: 0, width: 0, height: 0 },
    }
    expect(countBends(layout as LayoutIr)).toBe(0)
    expect(computeEdgeLength(layout as LayoutIr)).toBe(0)
    expect(computeWaypointDensity(layout as LayoutIr)).toBe(0)
  })

  it('should handle missing LayoutIr properties', () => {
    const layout: Partial<LayoutIr> = {
      flows: undefined,
    }
    expect(() => countBends(layout as LayoutIr)).not.toThrow()
  })
})

// Helper for both RD-115 and RD-116 tests
function createCrossLaneLayoutWithWaypoints(
  sourceLaneId: string,
  targetLaneId: string,
  waypoints: Array<{ x: number; y: number }>,
): LayoutIr {
  const lanes = [
    {
      id: 'lane1',
      name: 'Lane 1',
      elements: [{ id: 'el1', type: 'task', name: 'Task 1', laneId: sourceLaneId }],
    },
    {
      id: 'lane2',
      name: 'Lane 2',
      elements: [{ id: 'el2', type: 'task', name: 'Task 2', laneId: targetLaneId }],
    },
    {
      id: 'lane3',
      name: 'Lane 3',
      elements: [{ id: 'el3', type: 'task', name: 'Task 3', laneId: 'lane3' }],
    },
  ]

  return {
    process: {
      id: 'process1',
      lanes,
      flows: [
        { id: 'flow1', from: 'el1', to: 'el2', waypoints },
      ],
    },
    flows: [{ id: 'flow1', from: 'el1', to: 'el2', waypoints }],
    elements: new Map([
      ['el1', { x: 100, y: 100, width: 50, height: 50 }],
      ['el2', { x: 100, y: 300, width: 50, height: 50 }],
      ['el3', { x: 100, y: 500, width: 50, height: 50 }],
    ]),
    laneBounds: new Map(),
      poolBounds: { x: 0, y: 0, width: 300, height: 600 },
    } as LayoutIr
}

// Strategy-1 semantics: determinePort returns direction-of-travel of the first/last segment.
// Cross-lane DOWN (srcIdx < tgtIdx): valid exit = {RIGHT, BOTTOM}, valid entry = {RIGHT, BOTTOM}
//   RIGHT exit = last exit segment goes rightward; BOTTOM exit = last exit segment goes downward
//   RIGHT entry = last entry segment goes rightward (enters target from LEFT side physically)
//   BOTTOM entry = last entry segment goes downward (enters target from TOP physically)
// Cross-lane UP (srcIdx > tgtIdx): valid exit = {RIGHT, TOP}, valid entry = {RIGHT, TOP}
//   TOP exit = last exit segment goes upward; TOP entry = last entry segment goes upward
describe('Cross-lane port validation (RD-116)', () => {
  describe('Cross-lane DOWN (target lane index > source lane index)', () => {
    it('should accept RIGHT exit and RIGHT entry', () => {
      // Flow goes: right → down → left bend → right to target (enters target from LEFT side)
      const layout = createCrossLaneLayoutWithWaypoints('lane1', 'lane2', [
        { x: 125, y: 125 }, // p1: source center
        { x: 200, y: 125 }, // p2: going right → RIGHT exit
        { x: 200, y: 325 }, // bend: go down
        { x: 50, y: 325 },  // go left past target
        { x: 125, y: 325 }, // pn: go right to target → RIGHT entry
      ])
      expect(countPortViolations(layout)).toBe(0)
    })

    it('should accept RIGHT exit and BOTTOM entry', () => {
      // Flow goes right then down, approaches target from above going downward
      const layout = createCrossLaneLayoutWithWaypoints('lane1', 'lane2', [
        { x: 125, y: 125 }, // p1: source center
        { x: 200, y: 125 }, // p2: going right → RIGHT exit
        { x: 200, y: 275 }, // bend: go down
        { x: 125, y: 275 }, // go left to target column
        { x: 125, y: 325 }, // pn: going down → BOTTOM entry
      ])
      expect(countPortViolations(layout)).toBe(0)
    })

    it('should accept BOTTOM exit and RIGHT entry', () => {
      // Flow exits downward then routes left and approaches target going rightward
      const layout = createCrossLaneLayoutWithWaypoints('lane1', 'lane2', [
        { x: 125, y: 125 }, // p1: source center
        { x: 125, y: 200 }, // p2: going down → BOTTOM exit
        { x: 50, y: 200 },  // bend: go left
        { x: 50, y: 325 },  // go down to target row
        { x: 125, y: 325 }, // pn: going right → RIGHT entry
      ])
      expect(countPortViolations(layout)).toBe(0)
    })

    it('should accept BOTTOM exit and BOTTOM entry', () => {
      // Flow exits downward and enters target from above going downward
      const layout = createCrossLaneLayoutWithWaypoints('lane1', 'lane2', [
        { x: 125, y: 125 }, // p1: source center
        { x: 125, y: 200 }, // p2: going down → BOTTOM exit
        { x: 125, y: 275 }, // pn1: continue down
        { x: 125, y: 325 }, // pn: going down → BOTTOM entry
      ])
      expect(countPortViolations(layout)).toBe(0)
    })

    it('should reject LEFT exit (invalid for down)', () => {
      // Flow goes left from source — invalid for a cross-lane DOWN flow
      const layout = createCrossLaneLayoutWithWaypoints('lane1', 'lane2', [
        { x: 125, y: 125 }, // p1: source center
        { x: 50, y: 125 },  // p2: going left → LEFT exit (INVALID)
        { x: 50, y: 325 },  // bend: go down
        { x: 125, y: 325 }, // pn: going right → RIGHT entry (valid)
      ])
      expect(countPortViolations(layout)).toBe(1)
    })

    it('should reject LEFT entry (invalid for down)', () => {
      // Flow exits right but last segment goes leftward (enters from right side going left)
      const layout = createCrossLaneLayoutWithWaypoints('lane1', 'lane2', [
        { x: 125, y: 125 }, // p1: source center
        { x: 200, y: 125 }, // p2: going right → RIGHT exit (valid)
        { x: 200, y: 325 }, // bend: go down
        { x: 100, y: 325 }, // pn: going left → LEFT entry (INVALID)
      ])
      expect(countPortViolations(layout)).toBe(1)
    })
  })

  describe('Cross-lane UP (target lane index < source lane index)', () => {
    it('should accept RIGHT exit and RIGHT entry', () => {
      // Flow goes: right → up → left bend → right to target
      const layout = createCrossLaneLayoutWithWaypoints('lane2', 'lane1', [
        { x: 125, y: 325 }, // p1: source center (lane2, lower)
        { x: 200, y: 325 }, // p2: going right → RIGHT exit
        { x: 200, y: 125 }, // bend: go up
        { x: 50, y: 125 },  // go left past target
        { x: 125, y: 125 }, // pn: going right → RIGHT entry
      ])
      expect(countPortViolations(layout)).toBe(0)
    })

    it('should accept RIGHT exit and TOP entry', () => {
      // Flow exits right then approaches target from below going upward
      const layout = createCrossLaneLayoutWithWaypoints('lane2', 'lane1', [
        { x: 125, y: 325 }, // p1: source center (lane2, lower)
        { x: 200, y: 325 }, // p2: going right → RIGHT exit
        { x: 200, y: 175 }, // bend: go up
        { x: 125, y: 175 }, // go left to target column
        { x: 125, y: 125 }, // pn: going up → TOP entry
      ])
      expect(countPortViolations(layout)).toBe(0)
    })

    it('should accept TOP exit and RIGHT entry', () => {
      // Flow exits upward then routes and enters target going rightward
      const layout = createCrossLaneLayoutWithWaypoints('lane2', 'lane1', [
        { x: 125, y: 325 }, // p1: source center (lane2, lower)
        { x: 125, y: 250 }, // p2: going up → TOP exit
        { x: 50, y: 250 },  // bend: go left
        { x: 50, y: 125 },  // go up to target row
        { x: 125, y: 125 }, // pn: going right → RIGHT entry
      ])
      expect(countPortViolations(layout)).toBe(0)
    })

    it('should accept TOP exit and TOP entry', () => {
      // Flow exits upward and enters target from below going upward
      const layout = createCrossLaneLayoutWithWaypoints('lane2', 'lane1', [
        { x: 125, y: 325 }, // p1: source center (lane2, lower)
        { x: 125, y: 250 }, // p2: going up → TOP exit
        { x: 125, y: 175 }, // pn1: continue up
        { x: 125, y: 125 }, // pn: going up → TOP entry
      ])
      expect(countPortViolations(layout)).toBe(0)
    })

    it('should reject LEFT exit (invalid for up)', () => {
      // Flow goes left from source — invalid for a cross-lane UP flow
      const layout = createCrossLaneLayoutWithWaypoints('lane2', 'lane1', [
        { x: 125, y: 325 }, // p1: source center
        { x: 50, y: 325 },  // p2: going left → LEFT exit (INVALID)
        { x: 50, y: 125 },  // bend: go up
        { x: 125, y: 125 }, // pn: going right → RIGHT entry (valid)
      ])
      expect(countPortViolations(layout)).toBe(1)
    })

    it('should reject LEFT entry (invalid for up)', () => {
      // Flow exits right but last segment goes leftward
      const layout = createCrossLaneLayoutWithWaypoints('lane2', 'lane1', [
        { x: 125, y: 325 }, // p1: source center
        { x: 200, y: 325 }, // p2: going right → RIGHT exit (valid)
        { x: 200, y: 125 }, // bend: go up
        { x: 100, y: 125 }, // pn: going left → LEFT entry (INVALID)
      ])
      expect(countPortViolations(layout)).toBe(1)
    })
  })
})

describe('Vertical port direction detection (RD-115)', () => {
  // RD-115 tests verify that vertical (TOP/BOTTOM) port directions are correctly detected
  // and accepted when valid under Strategy-1 semantics.
  // All tests use valid port combinations so expect 0 violations.

  it('should detect and accept exit port BOTTOM (DOWN flow with BOTTOM+RIGHT)', () => {
    // Source in lane1, target in lane2 (below) — DOWN flow
    // BOTTOM exit: first segment goes downward; RIGHT entry: last segment goes rightward
    const layout = createCrossLaneLayoutWithWaypoints('lane1', 'lane2', [
      { x: 125, y: 125 }, // p1: source center
      { x: 125, y: 200 }, // p2: going down → BOTTOM exit
      { x: 50, y: 200 },  // go left
      { x: 50, y: 325 },  // go down to target row
      { x: 125, y: 325 }, // pn: going right → RIGHT entry
    ])
    expect(countPortViolations(layout)).toBe(0)
  })

  it('should detect and accept exit port TOP (UP flow with TOP+RIGHT)', () => {
    // Source in lane2, target in lane1 (above) — UP flow
    // TOP exit: first segment goes upward; RIGHT entry: last segment goes rightward
    const layout = createCrossLaneLayoutWithWaypoints('lane2', 'lane1', [
      { x: 125, y: 325 }, // p1: source center (lane2)
      { x: 125, y: 250 }, // p2: going up → TOP exit
      { x: 50, y: 250 },  // go left
      { x: 50, y: 125 },  // go up to target row
      { x: 125, y: 125 }, // pn: going right → RIGHT entry
    ])
    expect(countPortViolations(layout)).toBe(0)
  })

  it('should detect and accept entry port BOTTOM (DOWN flow with RIGHT+BOTTOM)', () => {
    // Source in lane1, target in lane2 (below) — DOWN flow
    // RIGHT exit + BOTTOM entry: last segment goes downward (enters target from above)
    const layout = createCrossLaneLayoutWithWaypoints('lane1', 'lane2', [
      { x: 125, y: 125 }, // p1: source center (lane1)
      { x: 200, y: 125 }, // p2: going right → RIGHT exit
      { x: 200, y: 275 }, // go down to approach target
      { x: 125, y: 275 }, // go left to target column
      { x: 125, y: 325 }, // pn: going down → BOTTOM entry
    ])
    expect(countPortViolations(layout)).toBe(0)
  })

  it('should detect and accept entry port TOP (UP flow with RIGHT+TOP)', () => {
    // Source in lane2, target in lane1 (above) — UP flow
    // RIGHT exit + TOP entry: last segment goes upward (enters target from below)
    const layout = createCrossLaneLayoutWithWaypoints('lane2', 'lane1', [
      { x: 125, y: 325 }, // p1: source center (lane2)
      { x: 200, y: 325 }, // p2: going right → RIGHT exit
      { x: 200, y: 175 }, // go up to approach target
      { x: 125, y: 175 }, // go left to target column
      { x: 125, y: 125 }, // pn: going up → TOP entry
    ])
    expect(countPortViolations(layout)).toBe(0)
  })
})
