import type { CapabilityNode, CapabilityMapHeader } from './types.js';

export const TREE_NODE_WIDTH = 250;
export const TREE_NODE_HEIGHT = 64;
/** Gap between sibling columns (node width + rank sep = 330px, matching DSM). */
export const TREE_RANK_SEP = 80;
/** Vertical gap between sibling nodes. */
export const TREE_NODE_SEP = 24;

export interface CapabilityTreeNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: CapabilityNode;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
}

export interface CapabilityTreeEdge {
  source: string;
  target: string;
}

export interface CapabilityTreeLevelCounts {
  /** Nodes at depth 0–2 (pink band). */
  band0: number;
  /** Nodes at depth 3–4 (yellow band). */
  band1: number;
  /** Nodes at depth 5+ (blue band). */
  band2: number;
}

export interface CapabilityTreeLayout {
  nodes: CapabilityTreeNode[];
  edges: CapabilityTreeEdge[];
  bounds: { x: number; y: number; width: number; height: number };
  levelCounts: CapabilityTreeLevelCounts;
}

export interface CapabilityTreeLayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
}

export function layoutCapabilityTree(
  map: CapabilityMapHeader,
  collapsedIds: Set<string> = new Set(),
  options: CapabilityTreeLayoutOptions = {},
): CapabilityTreeLayout {
  const nodeWidth = options.nodeWidth ?? TREE_NODE_WIDTH;
  const nodeHeight = options.nodeHeight ?? TREE_NODE_HEIGHT;
  const nodes: CapabilityTreeNode[] = [];
  const edges: CapabilityTreeEdge[] = [];

  const colNextY = new Map<number, number>();
  function getNextY(col: number): number {
    return colNextY.get(col) ?? 0;
  }
  function advanceY(col: number, delta: number): void {
    colNextY.set(col, (colNextY.get(col) ?? 0) + delta);
  }

  function placeNode(node: CapabilityNode, depth: number): { top: number; bottom: number } {
    const isCollapsed = collapsedIds.has(node.id);
    const hasChildren = Boolean(node.children?.length);
    const visibleChildren = !isCollapsed && node.children?.length ? node.children : [];

    const x = depth * (nodeWidth + TREE_RANK_SEP);

    if (visibleChildren.length === 0) {
      const y = getNextY(depth);
      advanceY(depth, nodeHeight + TREE_NODE_SEP);
      nodes.push({ id: node.id, x, y, width: nodeWidth, height: nodeHeight, data: node, depth, hasChildren, isCollapsed });
      return { top: y, bottom: y + nodeHeight };
    }

    const childSpans: Array<{ top: number; bottom: number }> = [];
    for (const child of visibleChildren) {
      childSpans.push(placeNode(child, depth + 1));
      edges.push({ source: node.id, target: child.id });
    }

    const spanTop = Math.min(...childSpans.map(s => s.top));
    const spanBottom = Math.max(...childSpans.map(s => s.bottom));
    const parentY = spanTop + (spanBottom - spanTop) / 2 - nodeHeight / 2;

    const curColY = getNextY(depth);
    const finalY = Math.max(parentY, curColY);
    advanceY(depth, finalY - curColY + nodeHeight + TREE_NODE_SEP);

    nodes.push({ id: node.id, x, y: finalY, width: nodeWidth, height: nodeHeight, data: node, depth, hasChildren, isCollapsed });
    return { top: Math.min(finalY, spanTop), bottom: Math.max(finalY + nodeHeight, spanBottom) };
  }

  for (const root of map.capabilities) {
    placeNode(root, 0);
    for (const [col, y] of colNextY) {
      colNextY.set(col, y + TREE_NODE_SEP);
    }
  }

  if (nodes.length === 0) {
    return { nodes: [], edges: [], bounds: { x: 0, y: 0, width: 0, height: 0 }, levelCounts: { band0: 0, band1: 0, band2: 0 } };
  }

  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxX = Math.max(...nodes.map(n => n.x + n.width));
  const maxY = Math.max(...nodes.map(n => n.y + n.height));

  const levelCounts: CapabilityTreeLevelCounts = { band0: 0, band1: 0, band2: 0 };
  for (const n of nodes) {
    if (n.depth <= 2) levelCounts.band0++;
    else if (n.depth <= 4) levelCounts.band1++;
    else levelCounts.band2++;
  }

  return { nodes, edges, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, levelCounts };
}
