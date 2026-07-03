/**
 * BPMN sequence-flow router — channel-based orthogonal A* (layout v2).
 *
 * Replaces the per-flow routing heuristics with a coordinated router:
 *
 *   1. Port assignment    — keeps the established conventions: right exit by
 *                           default, gateway diamond-vertex distribution
 *                           (top/bottom/right), top/bottom exits for
 *                           cross-lane gateway branches, left-face U-turns
 *                           for backward flows.
 *   2. Sparse grid        — vertical channels between columns and horizontal
 *                           corridors between rows / lanes; obstacle-free by
 *                           construction, so routed paths never clip shapes.
 *   3. A* search          — minimises length + bends, with a congestion
 *                           penalty for reusing segments occupied by earlier
 *                           flows and a micro-bias that places vertical runs
 *                           near the target column (late-turn convention).
 *   4. Nudging            — parallel overlapping segments inside a channel
 *                           are spread onto distinct tracks, ordered to avoid
 *                           crossings within the channel.
 */

import type { Bounds, ProcessIr, PositionedSequenceFlow } from './ir.js';
import { GATEWAY_TYPES } from './ir.js';
import type { LayoutDiagramOptions } from './layout-options.js';
import type { Placement } from './layout-placement.js';

interface Point {
  x: number;
  y: number;
}

/** Pixels of overlap tolerance used in geometric direction classification. */
const EPSILON_PX = 4;

/** Clearance used for loop arcs and left/right routing margins. */
const LOOP_CLEARANCE_PX = 32;

/** Vertical spread step between multiple forward flows leaving one source. */
const MULTI_EXIT_OFFSET_STEP_PX = 8;

/** Target-Y band treated as "level with the gateway" for vertex distribution. */
const GATEWAY_VERTEX_THRESHOLD_PX = 10;

/** Obstacle inflation: routed segments keep at least this distance to shapes. */
const OBSTACLE_MARGIN_PX = 6;

/** A* cost of one 90° turn, in pixel-equivalents. */
const BEND_COST = 40;

/** A* penalty for traversing a grid segment already used by an earlier flow. */
const REUSE_COST = 32;

/** A* penalty for crossing (or T-touching) a perpendicular routed segment.
 *  Higher than a bend: the router adds up to two extra bends to avoid one
 *  crossing, but does not produce long detours (length still counts). */
const CROSS_COST = 45;

/** Length of the straight stub leaving/entering a port before the first bend. */
const STUB_PX = 12;

/** Track spacing when nudging parallel segments apart. */
const TRACK_STEP_PX = 6;

/** Maximum nudge offset — stays well inside a layer-spacing channel. */
const TRACK_MAX_OFFSET_PX = 18;

/** Minimum free strip height to qualify as a horizontal corridor. */
const MIN_CORRIDOR_PX = 14;

/**
 * Clearance for the per-element "hug" rows a skip-level flow uses to bypass
 * a single node (buildGrid, below) — comfortably larger than the minimum
 * legal OBSTACLE_MARGIN_PX. A* minimises path length, so it always prefers
 * the tightest legal candidate row; without a deliberately wider gap here,
 * a bypass arc reads as skimming the node's edge even when the lane has
 * plenty of headroom to spare.
 */
const HUG_CLEARANCE_PX = 20;

type Dir = 0 | 1 | 2 | 3; // R, D, L, U
const DX = [1, 0, -1, 0] as const;
const DY = [0, 1, 0, -1] as const;

type Port = 'left' | 'right' | 'top' | 'bottom';

function portPoint(b: Bounds, port: Port, yOffset = 0): Point {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2 + yOffset;
  switch (port) {
    case 'left':   return { x: b.x,             y: cy };
    case 'right':  return { x: b.x + b.width,   y: cy };
    case 'top':    return { x: cx,              y: b.y };
    case 'bottom': return { x: cx,              y: b.y + b.height };
  }
}

function portDir(port: Port): Dir {
  switch (port) {
    case 'right':  return 0;
    case 'bottom': return 1;
    case 'left':   return 2;
    case 'top':    return 3;
  }
}

/** Direction of travel when ARRIVING at (moving into) the given face. */
function entryDir(port: Port): Dir {
  switch (port) {
    case 'left':   return 0; // moving right, into the left face
    case 'top':    return 1; // moving down, into the top face
    case 'right':  return 2; // moving left, into the right face
    case 'bottom': return 3; // moving up, into the bottom face
  }
}

export function dedupePoints(pts: Point[]): Point[] {
  const res: Point[] = [];
  for (const p of pts) {
    const last = res[res.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    res.push(p);
  }
  return res;
}

/** Remove intermediate waypoints collinear with their neighbours. */
export function removeCollinear(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const prevHoriz = Math.abs(prev.y - curr.y) < 0.5;
    const nextHoriz = Math.abs(curr.y - next.y) < 0.5;
    const prevVert  = Math.abs(prev.x - curr.x) < 0.5;
    const nextVert  = Math.abs(curr.x - next.x) < 0.5;
    if ((prevHoriz && nextHoriz) || (prevVert && nextVert)) continue;
    out.push(curr);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function diagonalFallback(a: Bounds, b: Bounds): Point[] {
  return [
    { x: a.x + a.width / 2, y: a.y + a.height / 2 },
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
  ];
}

/** Endpoint specification for one flow, produced by port assignment. */
interface FlowPlan {
  id: string;
  fromB: Bounds;
  toB: Bounds;
  start: Point;
  startDir: Dir;
  end: Point;
  endDir: Dir;
  backward: boolean;
  columnSpan: number;
}

/**
 * Port assignment — the routing conventions, applied globally before any
 * path is searched.
 */
export function planPorts(ir: ProcessIr, p: Placement): Map<string, FlowPlan> {
  const isBackward = (fb: Bounds, tb: Bounds): boolean =>
    tb.x + tb.width < fb.x + EPSILON_PX;

  // Exit-port overrides (gateway vertex distribution + cross-lane verticals).
  const flowExitPort = new Map<string, Port>();
  const flowExitYOffset = new Map<string, number>();
  // Entry-port overrides (join-side vertex distribution — see below).
  const flowEntryPort = new Map<string, Port>();

  // Same-lane forward gateway flows grouped by source.
  const fwdSameLaneByGw = new Map<string, Array<{ id: string; toB: Bounds; colSpan: number }>>();
  // Same-lane forward flows from non-gateway sources grouped by source.
  const fwdSameLaneByTask = new Map<string, Array<{ id: string; targetX: number }>>();
  // Same-lane forward flows INTO a gateway, grouped by target (join side).
  const fwdSameLaneIntoGw = new Map<string, Array<{ id: string; colSpan: number }>>();

  for (const f of ir.flows) {
    const fb = p.elements.get(f.from);
    const tb = p.elements.get(f.to);
    if (!fb || !tb) continue;
    const sameLane = p.laneOf.get(f.from) === p.laneOf.get(f.to);
    if (!sameLane || isBackward(fb, tb)) continue;
    if (GATEWAY_TYPES.has(p.typeOf.get(f.from) ?? '')) {
      const colSpan = Math.abs((p.columnOf.get(f.to) ?? 0) - (p.columnOf.get(f.from) ?? 0));
      const arr = fwdSameLaneByGw.get(f.from) ?? [];
      arr.push({ id: f.id, toB: tb, colSpan });
      fwdSameLaneByGw.set(f.from, arr);
    } else {
      const arr = fwdSameLaneByTask.get(f.from) ?? [];
      arr.push({ id: f.id, targetX: tb.x });
      fwdSameLaneByTask.set(f.from, arr);
    }
    if (GATEWAY_TYPES.has(p.typeOf.get(f.to) ?? '')) {
      const colSpan = Math.abs((p.columnOf.get(f.to) ?? 0) - (p.columnOf.get(f.from) ?? 0));
      const arr = fwdSameLaneIntoGw.get(f.to) ?? [];
      arr.push({ id: f.id, colSpan });
      fwdSameLaneIntoGw.set(f.to, arr);
    }
  }

  // Join-side vertex distribution: when a gateway receives both a "direct"
  // same-lane predecessor (the immediately preceding column) and a
  // "skip-level" one (bypassing an intervening node in the same row),
  // forcing both onto the default LEFT face makes the skip-level flow
  // converge on the exact same entry point as the direct one — it then has
  // to detour around the intervening node just to reach that shared point.
  // Routing the skip-level entry through TOP (falling back to BOTTOM for a
  // second one) instead gives it a short, independent approach and keeps
  // the direct flow's straight-through path uncluttered.
  for (const [, flows] of fwdSameLaneIntoGw) {
    if (flows.length <= 1) continue;
    const direct = flows.some((f) => f.colSpan <= 1);
    const skip = flows.filter((f) => f.colSpan > 1);
    if (!direct || skip.length === 0) continue;
    skip.forEach((f, i) => {
      flowEntryPort.set(f.id, i % 2 === 0 ? 'top' : 'bottom');
    });
  }

  // Non-gateway sources with several forward same-lane exits: spread the exit
  // Y so the arrows do not overlap at the source face.
  for (const flows of fwdSameLaneByTask.values()) {
    if (flows.length <= 1) continue;
    flows.sort((a, b) => a.targetX - b.targetX);
    const total = (flows.length - 1) * MULTI_EXIT_OFFSET_STEP_PX;
    flows.forEach((f, i) => {
      flowExitYOffset.set(f.id, -total / 2 + i * MULTI_EXIT_OFFSET_STEP_PX);
    });
  }

  // Gateway same-lane forward flows: one diamond vertex per directional
  // group — most-above target → TOP, most-below → BOTTOM, everything else
  // → RIGHT. A gateway has three usable forward vertices (left is reserved
  // for backward loops); never let two or more flows double up on one of
  // them while another sits completely unclaimed. Whichever flows don't win
  // the top/bottom vertex outright are ranked by how much they'd benefit
  // from a vertex of their own — a skip-level flow (colSpan > 1, bypassing
  // an intervening node) has genuine travel budget for a wide arc from
  // TOP/BOTTOM; a merely-further-above/below extra is next; a flow that's
  // level with the gateway and adjacent (colSpan ≤ 1, nothing to detour
  // around) benefits least and is the last to be moved off RIGHT. Only once
  // every vertex is spoken for does a further flow double up on RIGHT,
  // spread by Y-offset — an inherent limit of a 3-vertex shape.
  for (const [sourceId, flows] of fwdSameLaneByGw) {
    if (flows.length <= 1) continue;
    const gwB = p.elements.get(sourceId)!;
    const gwCY = gwB.y + gwB.height / 2;

    const above = flows
      .filter((f) => f.toB.y + f.toB.height / 2 < gwCY - GATEWAY_VERTEX_THRESHOLD_PX)
      .sort((a, b) => (a.toB.y + a.toB.height / 2) - (b.toB.y + b.toB.height / 2));
    const below = flows
      .filter((f) => f.toB.y + f.toB.height / 2 > gwCY + GATEWAY_VERTEX_THRESHOLD_PX)
      .sort((a, b) => (b.toB.y + b.toB.height / 2) - (a.toB.y + a.toB.height / 2));

    let topTaken = false;
    let bottomTaken = false;
    if (above.length > 0) { flowExitPort.set(above[0].id, 'top'); topTaken = true; }
    if (below.length > 0) { flowExitPort.set(below[0].id, 'bottom'); bottomTaken = true; }

    const overflow = [
      ...above.slice(1),
      ...flows.filter(
        (f) => Math.abs(f.toB.y + f.toB.height / 2 - gwCY) <= GATEWAY_VERTEX_THRESHOLD_PX,
      ),
      ...below.slice(1),
    ].sort((a, b) => b.colSpan - a.colSpan || a.toB.y - b.toB.y);

    if (overflow.length > 1 && !topTaken) {
      flowExitPort.set(overflow.shift()!.id, 'top');
      topTaken = true;
    }
    if (overflow.length > 1 && !bottomTaken) {
      flowExitPort.set(overflow.shift()!.id, 'bottom');
      bottomTaken = true;
    }

    const rightFlows = overflow.sort((a, b) => a.toB.y - b.toB.y);
    if (rightFlows.length > 1) {
      const total = (rightFlows.length - 1) * MULTI_EXIT_OFFSET_STEP_PX;
      rightFlows.forEach((f, i) => {
        flowExitYOffset.set(f.id, -total / 2 + i * MULTI_EXIT_OFFSET_STEP_PX);
      });
    }
  }

  // Vertex ports already claimed at a node by the join-side entry
  // distribution above (e.g. a skip-level flow entering via 'top') — consulted
  // below so a gateway's own outgoing cross-lane flow doesn't converge on the
  // same vertex an incoming flow is already using.
  const usedEntryPort = new Map<string, Set<Port>>();
  for (const f of ir.flows) {
    const port = flowEntryPort.get(f.id);
    if (!port) continue;
    const set = usedEntryPort.get(f.to) ?? new Set<Port>();
    set.add(port);
    usedEntryPort.set(f.to, set);
  }

  // Cross-lane gateway flows: bottom vertex when the target lane is below,
  // top vertex when above (unless the target is clearly to the left —
  // those route as backward-style left U-turns, or the vertex is already
  // claimed by an incoming join-side flow at this same gateway — see above —
  // in which case the default RIGHT exit is left in place instead).
  for (const f of ir.flows) {
    const fb = p.elements.get(f.from);
    const tb = p.elements.get(f.to);
    if (!fb || !tb) continue;
    if (p.laneOf.get(f.from) === p.laneOf.get(f.to)) continue;
    if (!GATEWAY_TYPES.has(p.typeOf.get(f.from) ?? '')) continue;
    if (isBackward(fb, tb)) continue;
    const targetClearlyLeft = tb.x + tb.width / 2 < fb.x - fb.width / 2;
    if (targetClearlyLeft) continue;
    const targetBelow = tb.y >= fb.y + fb.height - EPSILON_PX;
    const targetAbove = tb.y + tb.height <= fb.y + EPSILON_PX;
    const claimed = usedEntryPort.get(f.from);
    if (targetBelow && !claimed?.has('bottom')) flowExitPort.set(f.id, 'bottom');
    else if (targetAbove && !claimed?.has('top')) flowExitPort.set(f.id, 'top');
  }

  const plans = new Map<string, FlowPlan>();
  for (const f of ir.flows) {
    const fb = p.elements.get(f.from);
    const tb = p.elements.get(f.to);
    if (!fb || !tb) continue;
    const backward = isBackward(fb, tb);
    const targetClearlyLeft = tb.x + tb.width / 2 < fb.x - fb.width / 2;

    let exitPort: Port;
    if (backward || targetClearlyLeft) {
      // Backward loop convention: exit the LEFT face, arc around, enter the
      // LEFT face of the target.
      exitPort = 'left';
    } else {
      exitPort = flowExitPort.get(f.id) ?? 'right';
    }
    const yOffset = exitPort === 'right' ? (flowExitYOffset.get(f.id) ?? 0) : 0;

    const start = portPoint(fb, exitPort, yOffset);
    // Entry defaults to the left face, approached moving right; join-side
    // vertex distribution (above) overrides this for a skip-level incoming
    // flow sharing a gateway with a direct one. The straight vertical fast
    // path (top/bottom face) is handled before the search.
    const entryPort = backward || targetClearlyLeft ? 'left' : (flowEntryPort.get(f.id) ?? 'left');
    const end = portPoint(tb, entryPort);

    const colSpan = Math.abs(
      (p.columnOf.get(f.to) ?? 0) - (p.columnOf.get(f.from) ?? 0),
    );
    plans.set(f.id, {
      id: f.id,
      fromB: fb,
      toB: tb,
      start,
      startDir: portDir(exitPort),
      end,
      endDir: entryDir(entryPort),
      backward,
      columnSpan: colSpan,
    });
  }
  return plans;
}

/** Sorted unique coordinates (0.01 px tolerance). */
function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || v - out[out.length - 1] > 0.01) out.push(v);
  }
  return out;
}

interface Grid {
  xs: number[];
  ys: number[];
  /** hBlocked[yi * (nx-1) + xi]: segment (xi,yi)→(xi+1,yi) blocked. */
  hBlocked: Uint8Array;
  /** vBlocked[yi * nx + xi]: segment (xi,yi)→(xi,yi+1) blocked. */
  vBlocked: Uint8Array;
}

export function buildGrid(
  p: Placement,
  o: LayoutDiagramOptions,
  plans: Map<string, FlowPlan>,
): Grid {
  const xs: number[] = [];
  const ys: number[] = [];

  // Vertical channels: margins left/right of the content plus the gap centre
  // between each pair of adjacent columns; column centres allow straight
  // pass-through verticals.
  const nCols = p.colX.length;
  if (nCols > 0) {
    xs.push(p.colX[0] - LOOP_CLEARANCE_PX);
    for (let c = 0; c < nCols; c++) {
      xs.push(p.colX[c] + p.colW[c] / 2);
      if (c + 1 < nCols) {
        xs.push((p.colX[c] + p.colW[c] + p.colX[c + 1]) / 2);
      }
    }
    xs.push(p.colX[nCols - 1] + p.colW[nCols - 1] + LOOP_CLEARANCE_PX);
  }

  // Horizontal corridors: free strips inside each lane (computed from the
  // merged vertical extents of the lane's elements) + inter-lane gap centres.
  const lanesSorted = p.laneOrder
    .map((id) => p.laneBounds.get(id))
    .filter((b): b is Bounds => b !== undefined);
  for (const laneId of p.laneOrder) {
    const lb = p.laneBounds.get(laneId);
    if (!lb) continue;
    const intervals: Array<[number, number]> = [];
    for (const [id, b] of p.elements) {
      if (p.laneOf.get(id) !== laneId) continue;
      intervals.push([b.y - OBSTACLE_MARGIN_PX, b.y + b.height + OBSTACLE_MARGIN_PX]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const iv of intervals) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push([iv[0], iv[1]]);
    }
    let cursor = lb.y;
    for (const [top, bottom] of merged) {
      if (top - cursor >= MIN_CORRIDOR_PX) ys.push((cursor + top) / 2);
      cursor = Math.max(cursor, bottom);
    }
    if (lb.y + lb.height - cursor >= MIN_CORRIDOR_PX) {
      ys.push((cursor + lb.y + lb.height) / 2);
    }

    // Per-element hug rows, in addition to the merge above. The lane-wide
    // merge treats any two elements that overlap in Y as one obstacle block —
    // right for elements genuinely stacked at the same X, but it also erases
    // the local clearance around a *shorter* neighbour standing next to a
    // taller one at a different column (same row-centre, common case: a
    // gateway beside a task). A skip-level edge that only needs to hop over
    // that one taller node then finds no row until the lane's outer margin,
    // producing a detour spanning the whole lane instead of hugging the node.
    // Adding each element's own top/bottom edge as a raw candidate fixes
    // this without touching the merge: hBlocked/vBlocked already gate every
    // grid segment per element, so a row that's genuinely blocked somewhere
    // along its length simply goes unused there — safe to add unconditionally.
    for (const [id, b] of p.elements) {
      if (p.laneOf.get(id) !== laneId) continue;
      ys.push(b.y - HUG_CLEARANCE_PX, b.y + b.height + HUG_CLEARANCE_PX);
    }
  }
  if (o.laneVerticalGap >= 8) {
    for (let i = 0; i + 1 < lanesSorted.length; i++) {
      ys.push(lanesSorted[i].y + lanesSorted[i].height + o.laneVerticalGap / 2);
    }
  }

  // Rows: every element centre Y is a legal horizontal travel level (the
  // blocked-segment test prevents slicing through the row's own elements).
  for (const b of p.elements.values()) ys.push(b.y + b.height / 2);

  // Flow endpoints (with their stub offsets) must be grid coordinates.
  for (const plan of plans.values()) {
    const startStub = {
      x: plan.start.x + DX[plan.startDir] * STUB_PX,
      y: plan.start.y + DY[plan.startDir] * STUB_PX,
    };
    const endStub = {
      x: plan.end.x - DX[plan.endDir] * STUB_PX,
      y: plan.end.y - DY[plan.endDir] * STUB_PX,
    };
    xs.push(startStub.x, endStub.x);
    ys.push(startStub.y, endStub.y);
  }

  const uxs = uniqueSorted(xs);
  const uys = uniqueSorted(ys);
  const nx = uxs.length;
  const nyv = uys.length;

  // Blocked-segment tables against inflated element rectangles.
  const rects = [...p.elements.values()].map((b) => ({
    x1: b.x - OBSTACLE_MARGIN_PX + 0.5,
    y1: b.y - OBSTACLE_MARGIN_PX + 0.5,
    x2: b.x + b.width + OBSTACLE_MARGIN_PX - 0.5,
    y2: b.y + b.height + OBSTACLE_MARGIN_PX - 0.5,
  }));

  const hBlocked = new Uint8Array(Math.max(0, (nx - 1) * nyv));
  const vBlocked = new Uint8Array(Math.max(0, nx * (nyv - 1)));
  for (const r of rects) {
    for (let yi = 0; yi < nyv; yi++) {
      const y = uys[yi];
      if (y <= r.y1 || y >= r.y2) continue;
      for (let xi = 0; xi + 1 < nx; xi++) {
        if (uxs[xi] < r.x2 && uxs[xi + 1] > r.x1) hBlocked[yi * (nx - 1) + xi] = 1;
      }
    }
    for (let xi = 0; xi < nx; xi++) {
      const x = uxs[xi];
      if (x <= r.x1 || x >= r.x2) continue;
      for (let yi = 0; yi + 1 < nyv; yi++) {
        if (uys[yi] < r.y2 && uys[yi + 1] > r.y1) vBlocked[yi * nx + xi] = 1;
      }
    }
  }

  return { xs: uxs, ys: uys, hBlocked, vBlocked };
}

function gridIndex(coords: number[], v: number): number {
  // Binary search with tolerance.
  let lo = 0;
  let hi = coords.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const d = coords[mid] - v;
    if (Math.abs(d) <= 0.02) return mid;
    if (d < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** Simple binary min-heap keyed on f-cost with a sequence tie-breaker. */
class MinHeap {
  private keys: number[] = [];
  private seqs: number[] = [];
  private vals: number[] = [];
  private seq = 0;

  push(key: number, val: number): void {
    this.keys.push(key);
    this.seqs.push(this.seq++);
    this.vals.push(val);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number | undefined {
    const n = this.keys.length;
    if (n === 0) return undefined;
    const top = this.vals[0];
    this.swap(0, n - 1);
    this.keys.pop();
    this.seqs.pop();
    this.vals.pop();
    let i = 0;
    const m = this.keys.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < m && this.less(l, smallest)) smallest = l;
      if (r < m && this.less(r, smallest)) smallest = r;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
    return top;
  }

  get size(): number {
    return this.keys.length;
  }

  private less(a: number, b: number): boolean {
    return this.keys[a] < this.keys[b] ||
      (this.keys[a] === this.keys[b] && this.seqs[a] < this.seqs[b]);
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.seqs[a], this.seqs[b]] = [this.seqs[b], this.seqs[a]];
    [this.vals[a], this.vals[b]] = [this.vals[b], this.vals[a]];
  }
}

function segKey(x1: number, y1: number, x2: number, y2: number): string {
  // Normalised so both traversal directions share a key.
  return x1 < x2 || (x1 === x2 && y1 < y2)
    ? `${x1},${y1},${x2},${y2}`
    : `${x2},${y2},${x1},${y1}`;
}

/** Pass-through traffic of routed flows, per grid point and orientation. */
interface ThroughTraffic {
  /** Grid points (yi·nx+xi) that horizontal runs pass through. */
  h: Map<number, number>;
  /** Grid points that vertical runs pass through. */
  v: Map<number, number>;
}

/**
 * A* over the sparse grid from a start stub (with fixed initial direction) to
 * an end stub (which must be reached moving in `endDir`).
 * Returns interior waypoints (turn points), or undefined when unreachable.
 */
export function astar(
  grid: Grid,
  start: Point,
  startDir: Dir,
  end: Point,
  endDir: Dir,
  reuse: Map<string, number>,
  through: ThroughTraffic,
): Point[] | undefined {
  const { xs, ys, hBlocked, vBlocked } = grid;
  const nx = xs.length;
  const sxi = gridIndex(xs, start.x);
  const syi = gridIndex(ys, start.y);
  const exi = gridIndex(xs, end.x);
  const eyi = gridIndex(ys, end.y);
  if (sxi < 0 || syi < 0 || exi < 0 || eyi < 0) return undefined;

  const spanX = Math.max(1, xs[nx - 1] - xs[0]);
  const spanY = Math.max(1, ys[ys.length - 1] - ys[0]);

  const stateCount = nx * ys.length * 4;
  const dist = new Float64Array(stateCount).fill(Infinity);
  const parent = new Int32Array(stateCount).fill(-1);
  const stateOf = (xi: number, yi: number, dir: number): number =>
    (yi * nx + xi) * 4 + dir;

  const h = (xi: number, yi: number): number =>
    Math.abs(xs[xi] - end.x) + Math.abs(ys[yi] - end.y);

  const heap = new MinHeap();
  const s0 = stateOf(sxi, syi, startDir);
  dist[s0] = 0;
  heap.push(h(sxi, syi), s0);

  let goalState = -1;
  while (heap.size > 0) {
    const s = heap.pop()!;
    const dir = s % 4;
    const cell = (s - dir) / 4;
    const xi = cell % nx;
    const yi = (cell - xi) / nx;
    const g = dist[s];

    if (xi === exi && yi === eyi && dir === endDir && parent[s] !== -1) {
      // Accept the goal only when reached by a step (the parent occupies a
      // different cell) — never by an in-place turn, which would create a
      // zero-length final approach segment.
      const ps = parent[s];
      const pCell = (ps - (ps % 4)) / 4;
      if (pCell !== yi * nx + xi) {
        goalState = s;
        break;
      }
    }

    // Turns (90° only).  Turning INTO the goal direction at the goal cell is
    // forbidden: it would occupy the goal state with a cheaper-but-invalid
    // in-place turn and mask the legitimate step arrival.
    for (const nd of [(dir + 1) % 4, (dir + 3) % 4] as Dir[]) {
      if (xi === exi && yi === eyi && nd === endDir) continue;
      const ns = stateOf(xi, yi, nd);
      const ng = g + BEND_COST;
      if (ng < dist[ns]) {
        dist[ns] = ng;
        parent[ns] = s;
        heap.push(ng + h(xi, yi), ns);
      }
    }

    // Step along the current direction.
    const nxi = xi + DX[dir];
    const nyi = yi + DY[dir];
    if (nxi < 0 || nyi < 0 || nxi >= nx || nyi >= ys.length) continue;
    let blocked: boolean;
    if (dir === 0) blocked = hBlocked[yi * (nx - 1) + xi] === 1;
    else if (dir === 2) blocked = hBlocked[yi * (nx - 1) + nxi] === 1;
    else if (dir === 1) blocked = vBlocked[yi * nx + xi] === 1;
    else blocked = vBlocked[nyi * nx + xi] === 1;
    if (blocked) continue;

    const len = Math.abs(xs[nxi] - xs[xi]) + Math.abs(ys[nyi] - ys[yi]);
    const key = segKey(xi, yi, nxi, nyi);
    const congestion = (reuse.get(key) ?? 0) * REUSE_COST;
    // Crossing penalty: stepping into a grid point that a perpendicular
    // routed run passes through creates a crossing (or a T-touch).
    const destPoint = nyi * nx + nxi;
    const perp = dir === 0 || dir === 2 ? through.v : through.h;
    const crossing = (perp.get(destPoint) ?? 0) * CROSS_COST;
    // Micro-bias: prefer vertical runs near the target column and horizontal
    // runs near the target row (breaks turn-position ties deterministically).
    const micro = dir === 1 || dir === 3
      ? 0.05 * (Math.abs(xs[xi] - end.x) / spanX)
      : 0.05 * (Math.abs(ys[yi] - end.y) / spanY);
    const ns = stateOf(nxi, nyi, dir);
    const ng = g + len + congestion + crossing + micro;
    if (ng < dist[ns]) {
      dist[ns] = ng;
      parent[ns] = s;
      heap.push(ng + h(nxi, nyi), ns);
    }
  }

  if (goalState === -1) return undefined;

  // Reconstruct cell path, then keep only direction-change points.
  const cellsPath: Point[] = [];
  let s: number = goalState;
  while (s !== -1) {
    const dir = s % 4;
    const cell = (s - dir) / 4;
    const xi = cell % nx;
    const yi = (cell - xi) / nx;
    cellsPath.push({ x: xs[xi], y: ys[yi] });
    s = parent[s];
  }
  cellsPath.reverse();
  return dedupePoints(cellsPath);
}

/** Marks unit grid segments and pass-through points along a waypoint path. */
function markUsage(
  grid: Grid,
  wps: Point[],
  reuse: Map<string, number>,
  through: ThroughTraffic,
): void {
  const nx = grid.xs.length;
  for (let i = 0; i + 1 < wps.length; i++) {
    const x1 = gridIndex(grid.xs, wps[i].x);
    const y1 = gridIndex(grid.ys, wps[i].y);
    const x2 = gridIndex(grid.xs, wps[i + 1].x);
    const y2 = gridIndex(grid.ys, wps[i + 1].y);
    if (x1 < 0 || y1 < 0 || x2 < 0 || y2 < 0) continue;
    if (x1 === x2) {
      for (let y = Math.min(y1, y2); y < Math.max(y1, y2); y++) {
        const key = segKey(x1, y, x1, y + 1);
        reuse.set(key, (reuse.get(key) ?? 0) + 1);
      }
      for (let y = Math.min(y1, y2) + 1; y < Math.max(y1, y2); y++) {
        const pt = y * nx + x1;
        through.v.set(pt, (through.v.get(pt) ?? 0) + 1);
      }
    } else if (y1 === y2) {
      for (let x = Math.min(x1, x2); x < Math.max(x1, x2); x++) {
        const key = segKey(x, y1, x + 1, y1);
        reuse.set(key, (reuse.get(key) ?? 0) + 1);
      }
      for (let x = Math.min(x1, x2) + 1; x < Math.max(x1, x2); x++) {
        const pt = y1 * nx + x;
        through.h.set(pt, (through.h.get(pt) ?? 0) + 1);
      }
    }
  }
}

/** True when no element (inflated by a small margin) blocks the segment. */
function segmentClear(
  a: Point,
  b: Point,
  obstacles: Bounds[],
  exclude: Set<Bounds>,
): boolean {
  const m = EPSILON_PX;
  for (const r of obstacles) {
    if (exclude.has(r)) continue;
    const rx1 = r.x - m;
    const ry1 = r.y - m;
    const rx2 = r.x + r.width + m;
    const ry2 = r.y + r.height + m;
    if (Math.abs(a.y - b.y) < 0.01) {
      const y = a.y;
      if (y > ry1 && y < ry2 && Math.min(a.x, b.x) < rx2 && Math.max(a.x, b.x) > rx1) {
        return false;
      }
    } else if (Math.abs(a.x - b.x) < 0.01) {
      const x = a.x;
      if (x > rx1 && x < rx2 && Math.min(a.y, b.y) < ry2 && Math.max(a.y, b.y) > ry1) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Nudging: spread overlapping parallel interior segments onto distinct
 * tracks.  Vertical segments sharing an X are ordered by their flow's entry
 * Y (left-to-right rule); horizontal segments sharing a Y by entry X.
 */
function nudgeParallelSegments(routed: Array<{ wps: Point[] }>): void {
  interface SegRef {
    flow: number;
    seg: number; // segment index: between wps[seg] and wps[seg+1]
    lo: number;
    hi: number;
    key: number; // ordering key
  }

  const applyAxis = (vertical: boolean): void => {
    const byCoord = new Map<number, SegRef[]>();
    routed.forEach((r, fi) => {
      const wps = r.wps;
      // Interior segments only — never the port-attached first/last segment.
      for (let s = 1; s + 2 < wps.length; s++) {
        const a = wps[s];
        const b = wps[s + 1];
        const isVert = Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) > 0.01;
        const isHorz = Math.abs(a.y - b.y) < 0.01 && Math.abs(a.x - b.x) > 0.01;
        if (vertical ? !isVert : !isHorz) continue;
        const coord = Math.round((vertical ? a.x : a.y) * 2) / 2;
        const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
        const hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
        const last = wps[wps.length - 1];
        const arr = byCoord.get(coord) ?? [];
        arr.push({ flow: fi, seg: s, lo, hi, key: vertical ? last.y : last.x });
        byCoord.set(coord, arr);
      }
    });

    for (const [coord, segs] of byCoord) {
      if (segs.length < 2) continue;
      // Cluster segments whose ranges overlap.
      segs.sort((a, b) => a.lo - b.lo);
      let cluster: SegRef[] = [];
      let clusterHi = -Infinity;
      const clusters: SegRef[][] = [];
      for (const s of segs) {
        if (cluster.length > 0 && s.lo < clusterHi) {
          cluster.push(s);
          clusterHi = Math.max(clusterHi, s.hi);
        } else {
          if (cluster.length > 1) clusters.push(cluster);
          cluster = [s];
          clusterHi = s.hi;
        }
      }
      if (cluster.length > 1) clusters.push(cluster);

      for (const cl of clusters) {
        cl.sort((a, b) => a.key - b.key || a.flow - b.flow);
        const n = cl.length;
        cl.forEach((s, i) => {
          const off = Math.max(
            -TRACK_MAX_OFFSET_PX,
            Math.min(TRACK_MAX_OFFSET_PX, (i - (n - 1) / 2) * TRACK_STEP_PX),
          );
          if (off === 0) return;
          const wps = routed[s.flow].wps;
          if (vertical) {
            wps[s.seg] = { ...wps[s.seg], x: coord + off };
            wps[s.seg + 1] = { ...wps[s.seg + 1], x: coord + off };
          } else {
            wps[s.seg] = { ...wps[s.seg], y: coord + off };
            wps[s.seg + 1] = { ...wps[s.seg + 1], y: coord + off };
          }
        });
      }
    }
  };

  applyAxis(true);
  applyAxis(false);
}

/**
 * Route all sequence flows over the placement.  Deterministic: flows are
 * routed forward-first (short spans first), then backward loops, with stable
 * id tie-breaking; the A* heap breaks cost ties by insertion order.
 */
export function routeFlows(
  ir: ProcessIr,
  p: Placement,
  o: LayoutDiagramOptions,
): PositionedSequenceFlow[] {
  const plans = planPorts(ir, p);
  const grid = buildGrid(p, o, plans);
  const reuse = new Map<string, number>();
  const through: ThroughTraffic = { h: new Map(), v: new Map() };
  const obstacles = [...p.elements.values()];

  const order = [...plans.values()].sort((a, b) => {
    if (a.backward !== b.backward) return a.backward ? 1 : -1;
    return a.columnSpan - b.columnSpan || a.id.localeCompare(b.id);
  });

  const routedWps = new Map<string, Point[]>();
  for (const plan of order) {
    const { fromB, toB, start, startDir, end, endDir } = plan;
    const exclude = new Set<Bounds>([fromB, toB]);
    let wps: Point[] | undefined;

    // Fast path 1 — straight horizontal (same row, path clear).
    if (
      startDir === 0 &&
      Math.abs(start.y - end.y) < 1 &&
      end.x > start.x &&
      segmentClear(start, end, obstacles, exclude)
    ) {
      wps = [start, end];
    }

    // Fast path 2 — straight vertical: a top/bottom exit whose X falls within
    // the target's horizontal extent lands directly on the target face.
    if (
      wps === undefined &&
      (startDir === 1 || startDir === 3) &&
      start.x >= toB.x - EPSILON_PX &&
      start.x <= toB.x + toB.width + EPSILON_PX
    ) {
      const faceY = startDir === 1 ? toB.y : toB.y + toB.height;
      if (
        (startDir === 1 ? faceY > start.y : faceY < start.y) &&
        segmentClear(start, { x: start.x, y: faceY }, obstacles, exclude)
      ) {
        wps = [start, { x: start.x, y: faceY }];
      }
    }

    if (wps === undefined) {
      const startStub = {
        x: start.x + DX[startDir] * STUB_PX,
        y: start.y + DY[startDir] * STUB_PX,
      };
      const endStub = {
        x: end.x - DX[endDir] * STUB_PX,
        y: end.y - DY[endDir] * STUB_PX,
      };
      const inner = astar(grid, startStub, startDir, endStub, endDir, reuse, through);
      if (inner !== undefined) {
        wps = removeCollinear(dedupePoints([start, ...inner, end]));
      }
    }

    if (wps === undefined || wps.length < 2) {
      wps = diagonalFallback(fromB, toB);
    } else {
      markUsage(grid, wps, reuse, through);
    }
    routedWps.set(plan.id, wps);
  }

  // Nudge overlapping parallel segments apart, then clean up.
  const routedList = ir.flows
    .filter((f) => routedWps.has(f.id))
    .map((f) => ({ id: f.id, wps: routedWps.get(f.id)! }));
  nudgeParallelSegments(routedList);
  for (const r of routedList) {
    routedWps.set(r.id, removeCollinear(dedupePoints(r.wps)));
  }

  const flows: PositionedSequenceFlow[] = ir.flows.map((f) => ({
    ...f,
    waypoints: routedWps.get(f.id) ?? [],
  }));
  flows.sort((a, b) => a.id.localeCompare(b.id));
  return flows;
}
