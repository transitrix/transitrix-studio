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

/**
 * Ceiling on each span factor's contribution. Uncapped, a tall edge with a
 * narrow column gap (large dy, small dx — the common case in a many-row
 * network view) grows a handle far past the endpoints' actual x-distance;
 * the two control points then overshoot each other, producing an
 * exaggerated S-bow instead of a gentle curve. Capping keeps typical spans
 * (within the existing historical range) untouched while reining in outliers.
 */
const MAX_HANDLE = 160;

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
  const baseHandle = Math.max(
    EDGE_MIN_HANDLE,
    Math.min(Math.abs(dx) * DX_FACTOR, MAX_HANDLE),
    Math.min(Math.abs(dy) * DY_FACTOR, MAX_HANDLE),
  );
  const exitHandle = baseHandle * curvature;
  const entryHandle = baseHandle * (entryCurvature ?? curvature);
  return `M${sx},${sy} C${sx + exitHandle},${sy} ${tx - entryHandle},${ty} ${tx},${ty}`;
}

/**
 * Builds the SVG `d` for a "skip" edge that must arc over an intermediate
 * node sitting on the direct (sx,sy)→(tx,ty) line — e.g. a Network/PSND view
 * where a multi-predecessor activity's nearer predecessor shares a row with
 * one of the columns in between, so the direct line would be drawn straight
 * through that node. Both control points target `bowY` instead of each
 * endpoint's own Y, producing a hump that departs/arrives at an angle rather
 * than the flat horizontal tangent of `horizontalCubicEdgePath`.
 *
 * A cubic's actual apex only reaches part-way from an endpoint Y to the
 * control-point Y (75% at the midpoint for a fully symmetric sy=ty curve),
 * so callers must pick `bowY` well past the obstacle for the apex to clear
 * it — see `render-activities.ts`'s `blockingNodes`/`bowY` for the margin.
 */
export function bowedCubicEdgePath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  bowY: number,
  curvature: number = DEFAULT_EDGE_CURVATURE,
): string {
  const dx = tx - sx;
  const handle = Math.max(EDGE_MIN_HANDLE, Math.min(Math.abs(dx) * DX_FACTOR, MAX_HANDLE)) * curvature;
  return `M${sx},${sy} C${sx + handle},${bowY} ${tx - handle},${bowY} ${tx},${ty}`;
}
