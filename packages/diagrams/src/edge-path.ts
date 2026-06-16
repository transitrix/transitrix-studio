// Shared edge geometry for the static notation previews (Goals, FGCA, FGA,
// Activities). All four render dependency/relationship edges as a single cubic
// Bézier with horizontal control handles: each control point shares its
// endpoint's Y, so the tangent is horizontal at both ends and the marker-end
// arrow reads as perpendicular to the node's vertical edge.
//
// Pulling the path math here (rather than duplicating it inline in each
// preview) makes the configurable-curvature behaviour (vkgeorgia/strategy#76)
// unit-testable — the extension has no test harness.

/**
 * Base handle length floor + span factors. The handle grows with both the
 * horizontal and vertical span so the curve stays visibly horizontal long
 * enough for the arrowhead to sit flush against the line.
 */
export const EDGE_MIN_HANDLE = 64;
const DX_FACTOR = 0.5;
const DY_FACTOR = 0.8;

/** Multiplier applied to the base handle length. 1 = historical appearance. */
export const DEFAULT_EDGE_CURVATURE = 1;

/**
 * Builds the SVG `d` for a horizontal-tangent cubic Bézier from (sx,sy) to
 * (tx,ty).
 *
 * `curvature` scales the exit control-handle (departure from source).
 * `entryCurvature` scales the entry control-handle (arrival at target);
 * defaults to `curvature` when omitted so callers that pass one value get
 * symmetric handles (the historical behaviour).
 *
 *   - 0   → handle collapses onto its endpoint ⇒ straight at that end.
 *   - 1   → the historical curve (no visual change from before #76).
 *   - >1  → progressively stronger arc at that end.
 */
export function horizontalCubicEdgePath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  curvature: number = DEFAULT_EDGE_CURVATURE,
  entryCurvature?: number,
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const baseHandle = Math.max(EDGE_MIN_HANDLE, Math.abs(dx) * DX_FACTOR, Math.abs(dy) * DY_FACTOR);
  const exitHandle = baseHandle * curvature;
  const entryHandle = baseHandle * (entryCurvature ?? curvature);
  return `M${sx},${sy} C${sx + exitHandle},${sy} ${tx - entryHandle},${ty} ${tx},${ty}`;
}
