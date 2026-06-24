import { createRequire } from 'node:module';
import type { ELK, ElkNode } from 'elkjs/lib/elk-api.js';

import type { Bounds, LayoutIr, ProcessIr, PositionedSequenceFlow, PositionedAssociation, SequenceFlowIr } from './ir.js';
import { GATEWAY_TYPES } from './ir.js';
import { mergeLayoutDiagramOptions, type LayoutDiagramOptions } from './layout-options.js';
import { elkNodeSize } from './parser.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ELKCtor = require('elkjs/lib/elk.bundled.js') as new () => ELK;

const elk = new ELKCtor();

/** Pixels of overlap between a shape edge and the lane boundary before we
 *  choose the "below" exit rather than the "right" exit in cross-lane routing. */
const CROSS_LANE_EDGE_OVERLAP_EPSILON_PX = 4;

/** How far above the highest element the U-turn loop arc sits for backward
 *  (right-to-left) flows within the same lane.  Must be less than
 *  `elkDiagramPadding` (default 44 px) so the arc stays inside the lane band. */
const BACKWARD_LOOP_CLEARANCE_PX = 32;

/** Rotated lane/pool caption sizing — keep in sync with render-process.ts HEADER_* constants. */
const LANE_LABEL_AXIS_PAD = 32;
const LANE_LABEL_CHAR_W = 6.5;

function minLaneHeightForLabel(name: string): number {
  return name.length * LANE_LABEL_CHAR_W + 2 * LANE_LABEL_AXIS_PAD;
}

/** Vertical spread step between multiple forward flows leaving the same source
 *  element in the same lane.  Prevents arrows from overlapping at split gateways. */
const MULTI_EXIT_OFFSET_STEP_PX = 8;

/** Clearance (px) added above/below when routing a gateway branch flow out of the
 *  top or bottom vertex, so the first orthogonal segment clears the shape. */
const GATEWAY_BRANCH_CLEARANCE_PX = 20;

/** Port face of a shape used as an exit or entry point. */
type Port = 'left' | 'right' | 'top' | 'bottom';

/** Vertex coordinate on the shape boundary for a given port. */
function portPoint(b: Bounds, port: Port): { x: number; y: number } {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  switch (port) {
    case 'left':   return { x: b.x,              y: cy };
    case 'right':  return { x: b.x + b.width,    y: cy };
    case 'top':    return { x: cx,                y: b.y };
    case 'bottom': return { x: cx,                y: b.y + b.height };
  }
}

function laneElkLayoutOptions(o: LayoutDiagramOptions): Record<string, string> {
  const p = o.elkDiagramPadding;
  return {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.spacing.nodeNode': String(o.elkNodeSpacing),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(o.elkLayerSpacing),
    'elk.padding': `[${p},${p},${p},${p}]`,
    'elk.edgeRouting': 'ORTHOGONAL',
  };
}

function elementIdSet(ir: ProcessIr): Set<string> {
  const s = new Set<string>();
  for (const lane of ir.lanes) {
    for (const el of lane.elements) s.add(el.id);
  }
  return s;
}

/** O(1) element-to-lane lookup built once per layout call. */
function collectElementLaneMap(ir: ProcessIr): Map<string, string> {
  const m = new Map<string, string>();
  for (const lane of ir.lanes) {
    for (const el of lane.elements) m.set(el.id, lane.id);
  }
  return m;
}

function collectGraphicBounds(elkOut: ElkNode, ids: Set<string>): Map<string, Bounds> {
  const out = new Map<string, Bounds>();

  function visit(n: ElkNode, ox: number, oy: number): void {
    const x = ox + (n.x ?? 0);
    const y = oy + (n.y ?? 0);
    const w = n.width ?? 0;
    const h = n.height ?? 0;
    const hasChildren = Boolean(n.children?.length);
    if (ids.has(n.id) && w > 0 && h > 0 && !hasChildren) {
      out.set(n.id, { x, y, width: w, height: h });
    }
    if (hasChildren) {
      for (const c of n.children ?? []) visit(c, x, y);
    }
  }

  visit(elkOut, 0, 0);
  return out;
}

function boundsEnvelope(map: Map<string, Bounds>): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of map.values()) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Same delta applied to both rectangle maps and point arrays. */
function shiftBounds(m: Map<string, Bounds>, dx: number, dy: number): Map<string, Bounds> {
  const out = new Map<string, Bounds>();
  for (const [id, b] of m) out.set(id, { ...b, x: b.x + dx, y: b.y + dy });
  return out;
}

function translatePointList(
  pts: readonly { x: number; y: number }[],
  dx: number,
  dy: number,
): { x: number; y: number }[] {
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

function dedupePoints(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const res: { x: number; y: number }[] = [];
  for (const p of pts) {
    const last = res[res.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    res.push(p);
  }
  return res;
}

function diagonalFallbackRects(a: Bounds, b: Bounds): { x: number; y: number }[] {
  return [
    { x: a.x + a.width / 2, y: a.y + a.height / 2 },
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
  ];
}


/** Orthogonal route for two elements within the same lane.
 *
 *  Backward flow (target to the left):
 *    - Gateway source: left-side U-turn (exits left vertex, arcs around the left
 *      of both elements) so the arc never clashes with top/bottom vertex assignments
 *      that the port-distribution logic may have given to other forward flows.
 *    - Non-gateway source: top-arc above both elements (conventional loop back).
 *  Forward flow: defaults to right-exit / left-entry S-curve.
 *  `exitPort` overrides the connection vertex — used by the gateway port-distribution
 *  logic to route branches through top/bottom vertices so no two forward flows share
 *  the same exit point.
 *  `exitYOffset` is ignored when a non-default exit port is supplied. */
function routeSameLane(
  fromB: Bounds,
  toB: Bounds,
  exitYOffset = 0,
  exitPort: Port = 'right',
  isSourceGateway = false,
): { x: number; y: number }[] {
  const backward = toB.x + toB.width < fromB.x + CROSS_LANE_EDGE_OVERLAP_EPSILON_PX;

  if (backward) {
    // Left-side U-turn for ALL backward flows (gateway or not): exits the LEFT vertex,
    // arcs past the left edge of both elements, enters LEFT face of target.
    // This maintains the horizontal port rule: no TOP/BOTTOM exits for same-lane flows.
    const arcX = Math.min(fromB.x, toB.x) - BACKWARD_LOOP_CLEARANCE_PX;
    return dedupePoints([
      { x: fromB.x,  y: fromB.y + fromB.height / 2 },
      { x: arcX,     y: fromB.y + fromB.height / 2 },
      { x: arcX,     y: toB.y   + toB.height   / 2 },
      { x: toB.x,    y: toB.y   + toB.height   / 2 },
    ]);
  }

  // Non-default exit port: used by gateway port distribution.
  if (exitPort !== 'right') {
    const ep = portPoint(fromB, exitPort);
    const ip = portPoint(toB, 'left');
    if (exitPort === 'top' || exitPort === 'bottom') {
      // Minimal L-shape: exit vertically to target entry Y, then enter horizontally.
      // 3 points, 1 bend — minimum for a vertical exit with horizontal left-entry.
      return dedupePoints([ep, { x: ep.x, y: ip.y }, ip]);
    }
    // Generic fallback for other exit ports.
    const midX = (ep.x + ip.x) / 2;
    return dedupePoints([ep, { x: midX, y: ep.y }, { x: midX, y: ip.y }, ip]);
  }

  // Default: right-edge exit → orthogonal route to left-edge entry.
  const ex = fromB.x + fromB.width;
  const ey = fromB.y + fromB.height / 2 + exitYOffset;
  const ix = toB.x;
  const iy = toB.y + toB.height / 2;
  if (exitYOffset === 0 && Math.abs(ey - iy) < 1) return [{ x: ex, y: ey }, { x: ix, y: iy }];
  // When the Y difference is small (elements differ only in height, e.g. gateway→task),
  // use a late elbow near the target so the long horizontal segment stays straight.
  // For larger Y differences, use midX so the bend is centred in the available space.
  if (exitYOffset === 0 && Math.abs(ey - iy) < GATEWAY_BRANCH_CLEARANCE_PX) {
    const approachX = ix - GATEWAY_BRANCH_CLEARANCE_PX;
    return dedupePoints([{ x: ex, y: ey }, { x: approachX, y: ey }, { x: approachX, y: iy }, { x: ix, y: iy }]);
  }
  const midX = (ex + ix) / 2;
  return dedupePoints([{ x: ex, y: ey }, { x: midX, y: ey }, { x: midX, y: iy }, { x: ix, y: iy }]);
}

/** Returns true if no element in `els` intersects the vertical segment at x=segX
 *  between y1 and y2 (inclusive, with epsilon tolerance on the x-axis). */
function verticalSegmentClear(
  segX: number,
  y1: number,
  y2: number,
  els: Bounds[],
): boolean {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const eps = CROSS_LANE_EDGE_OVERLAP_EPSILON_PX;
  return els.every(
    (el) =>
      segX < el.x - eps ||
      segX > el.x + el.width + eps ||
      el.y + el.height <= minY ||
      el.y >= maxY,
  );
}

/** Orthogonal route for two elements in different lanes.
 *
 *  Preferred port: exit right-center of source, enter left-center of target.
 *
 *  For gateway flows with 'top'/'bottom' exit port, three paths apply in order:
 *
 *  1. Straight-down/up (2-point): when the exit x falls within the target's
 *     horizontal extent and the target lane has no blocking elements, a single
 *     vertical segment lands on the target's top or bottom face.
 *
 *  2. 3-point L-path: when the exit x is at or left of the target's left face
 *     and the lane is clear, drop straight down then right into the left face.
 *
 *  3. 5-point chanY elbow: travel via the inter-lane gap to avoid blocking
 *     elements in the target lane.
 *
 *  For right-exit flows: horizontal from source right face to the approach
 *  column (20 px left of target), then vertical to target centre Y, then
 *  horizontal into target left face (4-point elbow).
 *
 *  Fallback (target clearly to the left): left-side U-turn arc.
 *  Fallback (horizontally adjacent lanes): right-exit S-curve.
 *
 *  `exitPort` lets gateway port-distribution override the exit vertex: 'bottom'
 *  routes downward out of the bottom vertex, 'top' upward.
 *  `laneVerticalGap` is the vertical spacing between lanes; used to compute the
 *  inter-lane channel coordinate for vertical gateway exits.
 *  `targetLaneElements` is the list of target-lane element bounds (excluding the
 *  target itself); when provided, enables the straight-down/up and 3-point L-path optimisations. */
function routeCrossLane(
  fromB: Bounds,
  toB: Bounds,
  fromLaneBound?: Bounds,
  toLaneBound?: Bounds,
  exitPort: Port = 'right',
  laneVerticalGap = 40,
  targetLaneElements?: Bounds[],
): { x: number; y: number }[] {
  const targetBelow = toB.y >= fromB.y + fromB.height - CROSS_LANE_EDGE_OVERLAP_EPSILON_PX;
  const targetAbove = toB.y + toB.height <= fromB.y + CROSS_LANE_EDGE_OVERLAP_EPSILON_PX;

  // "Clearly left" = target center is to the left of source center by more than
  // one element width.  Right-exit would produce an ugly leftward detour there.
  const targetClearlyLeft =
    toB.x + toB.width / 2 < fromB.x - fromB.width / 2;

  if ((targetBelow || targetAbove) && !targetClearlyLeft) {
    const ep = portPoint(fromB, exitPort === 'bottom' || exitPort === 'top' ? exitPort : 'right');
    const ix = toB.x;
    const iy = toB.y + toB.height / 2;

    if (exitPort === 'bottom' || exitPort === 'top') {
      if (!fromLaneBound) return diagonalFallbackRects(fromB, toB);

      // Straight-down/up rule: when the exit x is within the target's horizontal
      // extent and the target lane is clear, connect directly to the top or bottom
      // face — the connection is a single vertical segment with no bends.
      if (
        targetLaneElements !== undefined &&
        ep.x >= toB.x - CROSS_LANE_EDGE_OVERLAP_EPSILON_PX &&
        ep.x <= toB.x + toB.width + CROSS_LANE_EDGE_OVERLAP_EPSILON_PX
      ) {
        const entryY = targetBelow ? toB.y : toB.y + toB.height;
        if (verticalSegmentClear(ep.x, ep.y, entryY, targetLaneElements)) {
          return dedupePoints([ep, { x: ep.x, y: entryY }]);
        }
      }

      const chanY = targetBelow
        ? fromLaneBound.y + fromLaneBound.height + laneVerticalGap / 2
        : fromLaneBound.y - laneVerticalGap / 2;
      const approachX = toB.x - GATEWAY_BRANCH_CLEARANCE_PX;

      // 3-point L-path: exit x at or left of target's left face and lane clear.
      if (
        ep.x <= toB.x &&
        targetLaneElements !== undefined &&
        verticalSegmentClear(ep.x, chanY, iy, targetLaneElements)
      ) {
        return dedupePoints([ep, { x: ep.x, y: iy }, { x: toB.x, y: iy }]);
      }

      // Travel via chanY (inter-lane gap) to avoid elements in the target lane,
      // then drop to target centre Y and approach from the left.
      return dedupePoints([ep, { x: ep.x, y: chanY }, { x: approachX, y: chanY }, { x: approachX, y: iy }, { x: toB.x, y: iy }]);
    }

    // Right exit: symmetric S-curve with bend at midpoint, enter target from left.
    const midX = (ep.x + ix) / 2;
    return dedupePoints([ep, { x: midX, y: ep.y }, { x: midX, y: iy }, { x: ix, y: iy }]);
  }

  // Backward cross-lane (target to the left, lanes stacked vertically):
  // Left-side U-turn — mirrors the same-lane backward arc but rotated 90°.
  // Exit the left centre of source → arc left past both elements → enter
  // the left centre of target.  Avoids top/bottom ports that read as
  // "vertical flow" rather than "backward loop".
  if (targetBelow || targetAbove) {
    const arcX = Math.min(fromB.x, toB.x) - BACKWARD_LOOP_CLEARANCE_PX;
    return dedupePoints([
      { x: fromB.x,               y: fromB.y + fromB.height / 2 },
      { x: arcX,                  y: fromB.y + fromB.height / 2 },
      { x: arcX,                  y: toB.y   + toB.height   / 2 },
      { x: toB.x,                 y: toB.y   + toB.height   / 2 },
    ]);
  }

  // Horizontally adjacent lanes: right-exit S-curve.
  const ex = fromB.x + fromB.width;
  const ey = fromB.y + fromB.height / 2;
  const ix = toB.x;
  const iy = toB.y + toB.height / 2;
  const midX = (ex + ix) / 2;
  return dedupePoints([{ x: ex, y: ey }, { x: midX, y: ey }, { x: midX, y: iy }, { x: ix, y: iy }]);
}

/**
 * Flat ELK graph containing ALL elements and ALL flows (no lane structure).
 * Phase 1 uses this to derive globally-consistent X positions: ELK sees every
 * cross-lane connection and assigns layers (columns) that honour all of them.
 */
function buildGlobalGraph(ir: ProcessIr, elkOpts: Record<string, string>): ElkNode {
  return {
    id: '__global',
    layoutOptions: elkOpts,
    children: ir.lanes.flatMap((lane) =>
      lane.elements.map((el) => {
        const { width, height } = elkNodeSize(el.type);
        return { id: el.id, width, height };
      }),
    ),
    edges: ir.flows.map((f) => ({ id: f.id, sources: [f.from], targets: [f.to] })),
  };
}

/**
 * Per-lane ELK graph containing only this lane's elements and internal flows.
 * Phase 2 uses this exclusively for Y positions and lane height; X is discarded.
 */
function buildLaneGraph(
  laneId: string,
  els: ProcessIr['lanes'][number]['elements'],
  internal: SequenceFlowIr[],
  elkOpts: Record<string, string>,
): ElkNode {
  return {
    id: `laneRoot_${laneId}`,
    layoutOptions: elkOpts,
    children: els.map((el) => {
      const { width, height } = elkNodeSize(el.type);
      return { id: el.id, width, height };
    }),
    edges: internal.map((f) => ({ id: f.id, sources: [f.from], targets: [f.to] })),
  };
}

export async function layoutProcess(
  ir: ProcessIr,
  layoutOpts?: Partial<LayoutDiagramOptions>,
): Promise<LayoutIr> {
  const o = mergeLayoutDiagramOptions(layoutOpts ?? {});
  const elkOpts = laneElkLayoutOptions(o);
  const ids = elementIdSet(ir);
  const elementLane = collectElementLaneMap(ir);

  // Phase 1 — global ELK pass.
  // All elements and all flows in a single flat graph.  ELK computes a layer
  // (column) assignment that is consistent across lanes: connected elements
  // land in adjacent or identical columns regardless of which lane they are in.
  // We keep only the X coordinates from this result.
  const globalElkOut = await elk.layout(buildGlobalGraph(ir, elkOpts));
  const globalBounds = collectGraphicBounds(globalElkOut, ids);

  const globalMinX = Math.min(...[...globalBounds.values()].map((b) => b.x));
  const contentW = Math.max(
    ...[...globalBounds.values()].map((b) => b.x - globalMinX + b.width),
    100,
  );

  // Phase 2 — per-lane ELK passes (run in parallel).
  // Each lane is laid out independently using only its internal flows.
  // We keep only the Y coordinates and lane height from these results;
  // X is intentionally discarded in favour of the globally-aligned X from Phase 1.
  const laneData = await Promise.all(
    ir.lanes.map(async (lane) => {
      const internalFlows = ir.flows.filter(
        (f) => elementLane.get(f.from) === lane.id && elementLane.get(f.to) === lane.id,
      );
      const graph = buildLaneGraph(lane.id, lane.elements, internalFlows, elkOpts);
      const elkOut = await elk.layout(graph);
      const graphic = collectGraphicBounds(elkOut, ids);
      const env = boundsEnvelope(graphic);
      // Normalize Y to lane-local origin (0 = top of lane content).
      const localY = new Map(
        [...graphic.entries()].map(([id, b]) => [id, b.y - env.y]),
      );
      return { laneId: lane.id, height: elkOut.height ?? env.height, localY, envY: env.y };
    }),
  );

  // Phase 3 — assemble final element positions.
  //   X  →  from Phase 1 global ELK, normalized to start at laneOriginX + laneLabelWidth
  //   Y  →  from Phase 2 per-lane ELK, shifted by the lane's accumulated Y offset
  //
  // Because every element's X comes from the same global layout run, cross-lane
  // connected elements share the same horizontal column in the output diagram.
  //
  // Step A computes lane-local Y for each element.
  // Step B de-overlaps within each lane: the 2-phase combination can collapse
  //   elements that per-lane ELK separated horizontally into the same X column,
  //   causing vertical overlap.  A Y-sweep guarantees elkNodeSpacing between them.
  // Step C converts local Y to absolute positions and computes lane / pool bounds.

  const laneOriginX = o.poolOriginX + o.participantLabelBand;

  // Step A — lane-local positions (Y relative to lane top).
  type LocalItem = { id: string; x: number; localY: number; width: number; height: number };
  const laneLocalItems = new Map<string, LocalItem[]>();
  for (const ld of laneData) {
    const laneDef = ir.lanes.find((l) => l.id === ld.laneId);
    if (!laneDef) throw new Error(`Layout invariant violated: lane "${ld.laneId}" not found in IR`);
    const items: LocalItem[] = [];
    for (const el of laneDef.elements) {
      const gb = globalBounds.get(el.id);
      if (!gb) continue;
      items.push({
        id: el.id,
        x: laneOriginX + o.laneLabelWidth + o.laneContentLeftPad + (gb.x - globalMinX),
        // Ensure at least elkDiagramPadding of top margin so backward arc clearance
        // (BACKWARD_LOOP_CLEARANCE_PX = 32) always stays inside the lane boundary.
        localY: Math.max((ld.localY.get(el.id) ?? 0) + ld.envY, o.elkDiagramPadding),
        width: gb.width,
        height: gb.height,
      });
    }
    laneLocalItems.set(ld.laneId, items);
  }

  // Step B — de-overlap within each X column of each lane.
  // Only elements sharing the same global-X column (same ELK layer) can overlap
  // after the 2-phase combination; elements in different columns are unaffected.
  for (const items of laneLocalItems.values()) {
    const byColumn = new Map<number, LocalItem[]>();
    for (const item of items) {
      const col = Math.round(item.x);
      const arr = byColumn.get(col) ?? [];
      arr.push(item);
      byColumn.set(col, arr);
    }
    for (const col of byColumn.values()) {
      if (col.length <= 1) continue;
      col.sort((a, b) => a.localY - b.localY);
      for (let i = 1; i < col.length; i++) {
        const prev = col[i - 1];
        const curr = col[i];
        const minY = prev.localY + prev.height + o.elkNodeSpacing;
        if (curr.localY < minY) curr.localY = minY;
      }
    }
  }

  // Step C — absolute positions, lane bounds, pool bounds.
  // Sub-pass C1: compute individual lane heights to allow optional equalization.
  const rawLaneHeights = new Map<string, number>();
  for (const ld of laneData) {
    const items = laneLocalItems.get(ld.laneId) ?? [];
    const laneDef = ir.lanes.find((l) => l.id === ld.laneId);
    const contentBottom = items.length > 0
      ? Math.max(...items.map((item) => item.localY + item.height))
      : 0;
    const labelMinH = laneDef ? minLaneHeightForLabel(laneDef.name) : 0;
    rawLaneHeights.set(ld.laneId, Math.max(ld.height, contentBottom + ld.envY, labelMinH));
  }
  // When uniformLaneHeight is on, all lanes in the pool share the tallest height.
  const uniformH = o.uniformLaneHeight && rawLaneHeights.size > 0
    ? Math.max(...rawLaneHeights.values())
    : undefined;

  // Sub-pass C2: set absolute element positions and lane bounds using final heights.
  let yCursor = o.poolPad;
  const elements = new Map<string, Bounds>();
  const laneBounds = new Map<string, Bounds>();

  for (const ld of laneData) {
    const items = laneLocalItems.get(ld.laneId) ?? [];
    const laneHeight = uniformH ?? rawLaneHeights.get(ld.laneId)!;

    for (const item of items) {
      elements.set(item.id, {
        x: item.x,
        y: yCursor + item.localY,
        width: item.width,
        height: item.height,
      });
    }

    laneBounds.set(ld.laneId, {
      x: laneOriginX,
      y: yCursor,
      width: o.laneLabelWidth + o.laneContentLeftPad + contentW + o.laneContentRightPad,
      height: laneHeight,
    });

    yCursor += laneHeight + o.laneVerticalGap;
  }

  const innerBottom = yCursor - o.laneVerticalGap;
  const participantW =
    o.participantLabelBand + o.laneLabelWidth + o.laneContentLeftPad + contentW + o.laneContentRightPad;
  const participantH = innerBottom - o.poolOriginY;

  const poolBounds: Bounds = {
    x: o.poolOriginX,
    y: o.poolOriginY,
    width: participantW,
    height: participantH,
  };

  for (const lb of laneBounds.values()) {
    lb.width = participantW - o.participantLabelBand;
  }

  // Step D — swimlane axis snap.
  // The swimlane axis is the horizontal centreline of the lane: axisY = lb.y + lb.height / 2.
  // Elements that stand alone in their X column (no stacking peers within the lane) are
  // snapped to the axis so their vertical centre aligns with the lane centre.  When elements
  // in adjacent lanes share the same column and are both on their respective axes, the
  // cross-lane flow between them is a straight horizontal line with no bends.
  // Stacked elements (column count > 1) are never moved — de-overlap in Step B already
  // placed them correctly.
  for (const [laneId, items] of laneLocalItems) {
    const lb = laneBounds.get(laneId);
    if (!lb) continue;
    const axisY = lb.y + lb.height / 2;

    const byColumn = new Map<number, LocalItem[]>();
    for (const item of items) {
      const col = Math.round(item.x);
      const arr = byColumn.get(col) ?? [];
      arr.push(item);
      byColumn.set(col, arr);
    }

    for (const col of byColumn.values()) {
      if (col.length !== 1) continue;
      const item = col[0];
      const el = elements.get(item.id);
      if (!el) continue;

      // Preferred margin: BACKWARD_LOOP_CLEARANCE_PX so backward arcs stay inside.
      // When the lane is too compact for that (minY > maxY), fall back to a 4 px
      // soft margin — the element centres as best it can without clipping the edge.
      let snapMinY = lb.y + BACKWARD_LOOP_CLEARANCE_PX;
      let snapMaxY = lb.y + lb.height - item.height - BACKWARD_LOOP_CLEARANCE_PX;
      if (snapMinY > snapMaxY) {
        snapMinY = lb.y + 4;
        snapMaxY = lb.y + lb.height - item.height - 4;
      }
      const snappedY = Math.max(snapMinY, Math.min(snapMaxY, axisY - item.height / 2));
      elements.set(item.id, { ...el, y: snappedY });
    }
  }

  // Phase 4 — route all flows orthogonally using the aligned final positions.
  // Geometric routing is used for all flows because the X override in Phase 3
  // invalidates per-lane ELK waypoints; orthogonal routing on aligned positions
  // produces clean arrows without diagonal segments.

  // Build element-type lookup for gateway port-distribution decisions.
  const elementTypeMap = new Map<string, string>();
  for (const lane of ir.lanes) {
    for (const el of lane.elements) elementTypeMap.set(el.id, el.type);
  }

  // --- Gateway exit port distribution ---
  // A gateway (diamond) has 4 distinct vertices.  When a gateway has multiple
  // outgoing same-lane forward flows, assign a different exit Port to each so
  // no two arrows leave from the same point.
  //
  // Rule: sort flows by target centre-Y relative to gateway centre.
  //   Targets clearly above  → TOP vertex.
  //   Targets clearly below  → BOTTOM vertex.
  //   Targets at similar Y   → sort by target X; rightmost gets RIGHT, others BOTTOM.
  //
  // Multiple inputs to a join gateway converge at a single point by design —
  // that is correct BPMN semantics and requires no special treatment.
  const flowExitPort = new Map<string, Port>();

  const fwdSameLaneBySource = new Map<string, Array<{ id: string; toB: Bounds }>>();
  for (const f of ir.flows) {
    const fb = elements.get(f.from);
    const tb = elements.get(f.to);
    if (!fb || !tb) continue;
    if (elementLane.get(f.from) !== elementLane.get(f.to)) continue;
    if (!GATEWAY_TYPES.has(elementTypeMap.get(f.from) ?? '')) continue;
    const backward = tb.x + tb.width < fb.x + CROSS_LANE_EDGE_OVERLAP_EPSILON_PX;
    if (backward) continue;
    const arr = fwdSameLaneBySource.get(f.from) ?? [];
    arr.push({ id: f.id, toB: tb });
    fwdSameLaneBySource.set(f.from, arr);
  }

  // Assign exit ports for cross-lane gateway flows: bottom when target is in a
  // lower lane, top when target is in a higher lane.  This makes the first segment
  // leave in the port direction (down/up) rather than always going right first.
  for (const f of ir.flows) {
    const fb = elements.get(f.from);
    const tb = elements.get(f.to);
    if (!fb || !tb) continue;
    if (elementLane.get(f.from) === elementLane.get(f.to)) continue;
    if (!GATEWAY_TYPES.has(elementTypeMap.get(f.from) ?? '')) continue;
    const targetClearlyLeft = tb.x + tb.width / 2 < fb.x - fb.width / 2;
    if (targetClearlyLeft) continue;
    const targetBelow = tb.y >= fb.y + fb.height - CROSS_LANE_EDGE_OVERLAP_EPSILON_PX;
    const targetAbove = tb.y + tb.height <= fb.y + CROSS_LANE_EDGE_OVERLAP_EPSILON_PX;
    if (targetBelow) flowExitPort.set(f.id, 'bottom');
    else if (targetAbove) flowExitPort.set(f.id, 'top');
  }

  // Pre-compute vertical exit offsets for same-lane forward flows from NON-gateway sources.
  const flowExitYOffset = new Map<string, number>();
  const sameLaneFwdByNonGwSource = new Map<string, Array<{ id: string; targetX: number }>>();
  for (const f of ir.flows) {
    const fb = elements.get(f.from);
    const tb = elements.get(f.to);
    if (!fb || !tb) continue;
    if (elementLane.get(f.from) !== elementLane.get(f.to)) continue;
    if (GATEWAY_TYPES.has(elementTypeMap.get(f.from) ?? '')) continue;
    const backward = tb.x + tb.width < fb.x + CROSS_LANE_EDGE_OVERLAP_EPSILON_PX;
    if (backward) continue;
    const arr = sameLaneFwdByNonGwSource.get(f.from) ?? [];
    arr.push({ id: f.id, targetX: tb.x });
    sameLaneFwdByNonGwSource.set(f.from, arr);
  }
  for (const flows of sameLaneFwdByNonGwSource.values()) {
    if (flows.length <= 1) continue;
    flows.sort((a, b) => a.targetX - b.targetX);
    const totalSpread = (flows.length - 1) * MULTI_EXIT_OFFSET_STEP_PX;
    flows.forEach((f, i) => {
      flowExitYOffset.set(f.id, -totalSpread / 2 + i * MULTI_EXIT_OFFSET_STEP_PX);
    });
  }

  // Gateway same-lane forward flows: assign a unique diamond vertex per directional group.
  // Each exit of a gateway represents a distinct decision — two flows must never share
  // the same vertex.  Assignment (by target centre Y relative to gateway centre):
  //   clearly above  → top vertex    (the most-above target if multiple)
  //   clearly below  → bottom vertex (the most-below target if multiple)
  //   level / extras → right vertex  (with Y-offset spread to avoid overlapping segments)
  const GATEWAY_VERTEX_THRESHOLD_PX = 10;
  for (const [sourceId, flows] of fwdSameLaneBySource) {
    if (flows.length <= 1) continue;
    const gwB = elements.get(sourceId)!;
    const gwCY = gwB.y + gwB.height / 2;

    const above = flows
      .filter(f => f.toB.y + f.toB.height / 2 < gwCY - GATEWAY_VERTEX_THRESHOLD_PX)
      .sort((a, b) => (a.toB.y + a.toB.height / 2) - (b.toB.y + b.toB.height / 2)); // ascending cy
    const below = flows
      .filter(f => f.toB.y + f.toB.height / 2 > gwCY + GATEWAY_VERTEX_THRESHOLD_PX)
      .sort((a, b) => (b.toB.y + b.toB.height / 2) - (a.toB.y + a.toB.height / 2)); // descending cy

    // Direction-aware vertex assignment:
    //   most-above flow  → TOP vertex  (distinct diamond point, clean L-shape)
    //   most-below flow  → BOTTOM vertex
    //   remaining (level or extras beyond first above/below) → RIGHT + Y-offset
    if (above.length > 0) flowExitPort.set(above[0].id, 'top');
    if (below.length > 0) flowExitPort.set(below[0].id, 'bottom');

    const rightFlows = [
      ...above.slice(1),
      ...flows.filter(f =>
        Math.abs(f.toB.y + f.toB.height / 2 - gwCY) <= GATEWAY_VERTEX_THRESHOLD_PX,
      ),
      ...below.slice(1),
    ].sort((a, b) => a.toB.y - b.toB.y);

    if (rightFlows.length > 1) {
      const total = (rightFlows.length - 1) * MULTI_EXIT_OFFSET_STEP_PX;
      rightFlows.forEach((f, i) => {
        flowExitYOffset.set(f.id, -total / 2 + i * MULTI_EXIT_OFFSET_STEP_PX);
      });
    }
  }

  const flows: PositionedSequenceFlow[] = ir.flows.map((f) => {
    const fb = elements.get(f.from);
    const tb = elements.get(f.to);
    let wps: { x: number; y: number }[] = [];
    if (fb && tb) {
      const fromL = elementLane.get(f.from);
      const toL = elementLane.get(f.to);
      const exitOffset = flowExitYOffset.get(f.id) ?? 0;
      const exitPort = flowExitPort.get(f.id) ?? 'right';
      const fromLaneBound = fromL ? laneBounds.get(fromL) : undefined;
      const toLaneBound = toL ? laneBounds.get(toL) : undefined;
      const isSourceGateway = GATEWAY_TYPES.has(elementTypeMap.get(f.from) ?? '');
      const targetLaneEls: Bounds[] | undefined = toL
        ? ir.lanes
            .find((l) => l.id === toL)
            ?.elements.filter((el) => el.id !== f.to)
            .flatMap((el) => { const b = elements.get(el.id); return b ? [b] : []; })
        : undefined;
      wps = fromL === toL
        ? routeSameLane(fb, tb, exitOffset, exitPort, isSourceGateway)
        : routeCrossLane(fb, tb, fromLaneBound, toLaneBound, exitPort, o.laneVerticalGap, targetLaneEls);
      if (wps.length < 2) wps = diagonalFallbackRects(fb, tb);
    }
    return { ...f, waypoints: wps };
  });

  flows.sort((a, b) => a.id.localeCompare(b.id));

  const associations: PositionedAssociation[] = (ir.associations ?? []).map((a) => {
    const fb = elements.get(a.from);
    const tb = elements.get(a.to);
    return {
      ...a,
      waypoints: fb && tb ? diagonalFallbackRects(fb, tb) : [],
    };
  });
  associations.sort((a, b) => a.id.localeCompare(b.id));

  return { process: ir, elements, laneBounds, poolBounds, flows, associations };
}
