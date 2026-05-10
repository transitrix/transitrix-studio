/**
 * Geometric Primitives for Layout Metrics
 *
 * Low-level geometric utilities for measuring diagram quality:
 * segment intersection, polyline length, point-in-polygon, etc.
 *
 * All functions are pure and deterministic.
 */

export interface Point {
  x: number
  y: number
}

export interface Segment {
  start: Point
  end: Point
}

export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Check if two orthogonal segments (axis-aligned) intersect at an interior point.
 * Returns true if they cross; false if they only touch at endpoints or are parallel.
 */
export function orthogonalSegmentsIntersect(seg1: Segment, seg2: Segment): boolean {
  const [p1, p2] = [seg1.start, seg1.end]
  const [p3, p4] = [seg2.start, seg2.end]

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
 * Compute Manhattan distance between two points.
 */
export function manhattanDistance(p1: Point, p2: Point): number {
  return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y)
}

/**
 * Compute Euclidean distance between two points.
 */
export function euclideanDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x
  const dy = p1.y - p2.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Compute Manhattan distance of a polyline (sum of segment lengths).
 */
export function polylineLength(points: Point[]): number {
  if (!points || points.length < 2) return 0
  let length = 0
  for (let i = 0; i < points.length - 1; i++) {
    length += manhattanDistance(points[i], points[i + 1])
  }
  return length
}

/**
 * Count the number of direction changes (bends) in a polyline.
 * Requires ≥3 points. Collinear segments do not count as a bend.
 */
export function countPolylineBends(points: Point[]): number {
  if (!points || points.length < 3) return 0

  let bends = 0
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]

    // Check if there's a 90° turn at curr (orthogonal directions)
    const prevDir = { x: curr.x - prev.x, y: curr.y - prev.y }
    const nextDir = { x: next.x - curr.x, y: next.y - curr.y }

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
 * Check if a point is inside a rectangle (inclusive of boundaries).
 */
export function pointInRectangle(point: Point, rect: Rectangle): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/**
 * Check if a point is strictly inside a rectangle (exclusive of boundaries).
 */
export function pointStrictlyInRectangle(point: Point, rect: Rectangle): boolean {
  return (
    point.x > rect.x &&
    point.x < rect.x + rect.width &&
    point.y > rect.y &&
    point.y < rect.y + rect.height
  )
}

/**
 * Compute the bounding rectangle of a set of points.
 */
export function boundingRectangle(points: Point[]): Rectangle {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity,
    maxX = -Infinity
  let minY = Infinity,
    maxY = -Infinity

  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Check if two rectangles overlap (including touching at edges).
 */
export function rectanglesOverlap(rect1: Rectangle, rect2: Rectangle): boolean {
  return !(
    rect1.x + rect1.width < rect2.x ||
    rect2.x + rect2.width < rect1.x ||
    rect1.y + rect1.height < rect2.y ||
    rect2.y + rect2.height < rect1.y
  )
}

/**
 * Check if two rectangles strictly overlap (not just touching).
 */
export function rectanglesStrictlyOverlap(rect1: Rectangle, rect2: Rectangle): boolean {
  return !(
    rect1.x + rect1.width <= rect2.x ||
    rect2.x + rect2.width <= rect1.x ||
    rect1.y + rect1.height <= rect2.y ||
    rect2.y + rect2.height <= rect1.y
  )
}

/**
 * Compute the area of intersection of two rectangles.
 * Returns 0 if they don't overlap.
 */
export function rectangleIntersectionArea(rect1: Rectangle, rect2: Rectangle): number {
  const x1 = Math.max(rect1.x, rect2.x)
  const y1 = Math.max(rect1.y, rect2.y)
  const x2 = Math.min(rect1.x + rect1.width, rect2.x + rect2.width)
  const y2 = Math.min(rect1.y + rect1.height, rect2.y + rect2.height)

  if (x2 <= x1 || y2 <= y1) return 0
  return (x2 - x1) * (y2 - y1)
}

/**
 * Compute direction of a vector (in degrees, 0 = right, 90 = down, 180 = left, 270 = up).
 * Assumes orthogonal vector (horizontal or vertical).
 */
export function vectorDirection(from: Point, to: Point): 'up' | 'down' | 'left' | 'right' {
  const dx = to.x - from.x
  const dy = to.y - from.y

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left'
  } else {
    return dy > 0 ? 'down' : 'up'
  }
}

/**
 * Get the center point of a rectangle.
 */
export function rectangleCenter(rect: Rectangle): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}

/**
 * Clamp a point to be inside a rectangle (nearest point on/in the rectangle).
 */
export function clampPointToRectangle(point: Point, rect: Rectangle): Point {
  return {
    x: Math.max(rect.x, Math.min(point.x, rect.x + rect.width)),
    y: Math.max(rect.y, Math.min(point.y, rect.y + rect.height)),
  }
}
