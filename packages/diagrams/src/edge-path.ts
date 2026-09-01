// Shared edge geometry for the static notation previews (Goals, FGCA, FGA,
// Activities). The default path is a cubic Bézier with horizontal control
// handles so the marker-end arrow sits flush on the node's vertical edge.
// Goals / DGCA / DGA can switch to a straight chord or an orthogonal polyline.
//
// Pulling the path math here (rather than duplicating it inline in each
// preview) makes the configurable-curvature behaviour
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

/** Path shape for Goals / DGCA / DGA preview edges. Default matches today's cubic. */
export type EdgeStyle = 'straight' | 'bezier' | 'polyline';
export const DEFAULT_EDGE_STYLE: EdgeStyle = 'bezier';

export function parseEdgeStyle(v: unknown): EdgeStyle {
  if (v === 'straight' || v === 'bezier' || v === 'polyline') return v;
  return DEFAULT_EDGE_STYLE;
}

/** Straight segment — the arrowhead follows the chord, not the node edge. */
export function straightEdgePath(sx: number, sy: number, tx: number, ty: number): string {
  return `M${sx},${sy} L${tx},${ty}`;
}

/**
 * Orthogonal (Manhattan) polyline: horizontal out, vertical, horizontal in.
 * The last segment is horizontal so `marker-end` still meets the node's
 * vertical edge the same way the cubic does.
 */
export function orthogonalEdgePath(sx: number, sy: number, tx: number, ty: number): string {
  const midX = sx + (tx - sx) / 2;
  return `M${sx},${sy} H${midX} V${ty} H${tx}`;
}

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

/**
 * Picks the SVG `d` for a Goals / DGCA / DGA preview edge.
 * Unknown styles fall back to the historical cubic.
 */
export function previewEdgePath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  style: EdgeStyle = DEFAULT_EDGE_STYLE,
  curvature: number = DEFAULT_EDGE_CURVATURE,
  entryCurvature?: number,
): string {
  if (style === 'straight') return straightEdgePath(sx, sy, tx, ty);
  if (style === 'polyline') return orthogonalEdgePath(sx, sy, tx, ty);
  return horizontalCubicEdgePath(sx, sy, tx, ty, curvature, entryCurvature);
}
