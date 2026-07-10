import type {
  Block,
  BlocksFile,
  BlocksLayout,
  BlocksLayoutOptions,
  LaidOutBlock,
} from './types.js';
import { ENTITY_NODE_SIZE } from '../node-size-presets.js';

const DEFAULTS: Required<BlocksLayoutOptions> = {
  leafWidth: ENTITY_NODE_SIZE.normal.width,
  leafHeight: ENTITY_NODE_SIZE.normal.height,
  padding: 12,
  headerHeight: 32,
  childGap: 12,
  topLevelGap: 24,
};

interface MeasuredBlock {
  width: number;
  height: number;
  cols: number;
  rows: number;
  colWidths: number[];
  rowHeights: number[];
  children: MeasuredBlock[];
}

function resolveOptions(options: BlocksLayoutOptions | undefined): Required<BlocksLayoutOptions> {
  return { ...DEFAULTS, ...(options ?? {}) };
}

function measure(b: Block, opts: Required<BlocksLayoutOptions>): MeasuredBlock {
  const children = Array.isArray(b.children) ? b.children : [];
  if (children.length === 0) {
    return {
      width: opts.leafWidth,
      height: opts.leafHeight,
      cols: 0,
      rows: 0,
      colWidths: [],
      rowHeights: [],
      children: [],
    };
  }

  const measuredChildren = children.map((c) => measure(c, opts));
  const N = measuredChildren.length;

  // Square-ish grid: cols = ceil(sqrt(N)), rows = ceil(N/cols).
  // Variable column widths and row heights so heterogeneous children pack
  // without forcing every cell to the largest size.
  const cols = Math.max(1, Math.ceil(Math.sqrt(N)));
  const rows = Math.ceil(N / cols);

  const colWidths = new Array<number>(cols).fill(0);
  const rowHeights = new Array<number>(rows).fill(0);

  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const m = measuredChildren[i];
    if (m.width > colWidths[c]) colWidths[c] = m.width;
    if (m.height > rowHeights[r]) rowHeights[r] = m.height;
  }

  const contentWidth =
    colWidths.reduce((s, w) => s + w, 0) + (cols - 1) * opts.childGap;
  const contentHeight =
    rowHeights.reduce((s, h) => s + h, 0) + (rows - 1) * opts.childGap;

  // Outer block: padding on all four sides, plus a header strip on top that
  // carries the block's name. Header height is not part of the children grid.
  return {
    width: contentWidth + 2 * opts.padding,
    height: contentHeight + 2 * opts.padding + opts.headerHeight,
    cols,
    rows,
    colWidths,
    rowHeights,
    children: measuredChildren,
  };
}

function position(
  b: Block,
  m: MeasuredBlock,
  x: number,
  y: number,
  depth: number,
  opts: Required<BlocksLayoutOptions>,
): LaidOutBlock {
  const node: LaidOutBlock = {
    id: b.id,
    name: b.name,
    description: b.description,
    depth,
    x,
    y,
    width: m.width,
    height: m.height,
    headerHeight: opts.headerHeight,
    children: [],
  };

  const children = Array.isArray(b.children) ? b.children : [];
  if (children.length === 0) return node;

  const innerX0 = x + opts.padding;
  const innerY0 = y + opts.headerHeight + opts.padding;

  let yCursor = innerY0;
  for (let r = 0; r < m.rows; r++) {
    let xCursor = innerX0;
    for (let c = 0; c < m.cols; c++) {
      const i = r * m.cols + c;
      if (i >= children.length) break;
      // Centre each child within its grid cell so heterogeneous sizes look
      // balanced (smaller blocks float in the middle of their cell rather
      // than left-aligning, which looks ragged when the cell is larger than
      // the child).
      const cellW = m.colWidths[c];
      const cellH = m.rowHeights[r];
      const childM = m.children[i];
      const cx = xCursor + (cellW - childM.width) / 2;
      const cy = yCursor + (cellH - childM.height) / 2;
      node.children.push(position(children[i], childM, cx, cy, depth + 1, opts));
      xCursor += cellW + opts.childGap;
    }
    yCursor += m.rowHeights[r] + opts.childGap;
  }

  return node;
}

function maxDepthOf(node: LaidOutBlock): number {
  let m = node.depth;
  for (const c of node.children) {
    const d = maxDepthOf(c);
    if (d > m) m = d;
  }
  return m;
}

export function layoutNestedBlocks(
  file: BlocksFile,
  options?: BlocksLayoutOptions,
): BlocksLayout {
  const opts = resolveOptions(options);

  const nb = file?.nested_blocks;
  const tops = Array.isArray(nb?.blocks) ? nb.blocks : [];

  // Top-level blocks stack vertically. They share a single x = 0 column;
  // their widths can differ. Total bounds = max child width, sum of heights
  // plus inter-block gaps.
  const measuredTops = tops.map((b) => measure(b, opts));

  let cursorY = 0;
  let maxWidth = 0;
  let maxDepth = 0;
  const blocks: LaidOutBlock[] = [];
  for (let i = 0; i < tops.length; i++) {
    const m = measuredTops[i];
    const laid = position(tops[i], m, 0, cursorY, 1, opts);
    blocks.push(laid);
    const d = maxDepthOf(laid);
    if (d > maxDepth) maxDepth = d;
    if (m.width > maxWidth) maxWidth = m.width;
    cursorY += m.height + (i < tops.length - 1 ? opts.topLevelGap : 0);
  }

  return {
    bounds: { x: 0, y: 0, width: maxWidth, height: cursorY },
    blocks,
    maxDepth,
  };
}

/** Iterate every laid-out block (including nested children) in pre-order. */
export function* iterateBlocks(layout: BlocksLayout): Iterable<LaidOutBlock> {
  function* walk(b: LaidOutBlock): Iterable<LaidOutBlock> {
    yield b;
    for (const c of b.children) yield* walk(c);
  }
  for (const b of layout.blocks) yield* walk(b);
}
