import type { Goal, GoalTree, LayoutOptions, GoalTreeLayout, LaidOutNode, LaidOutEdge } from './types.js';

const DEFAULT_NODE_WIDTH = 250;
const DEFAULT_NODE_HEIGHT = 80;
const DEFAULT_RANK_SEP = 80;
const DEFAULT_NODE_SEP = 40;

export function layoutGoalTree(tree: GoalTree, options: LayoutOptions = {}): GoalTreeLayout {
  const {
    nodeWidth = DEFAULT_NODE_WIDTH,
    nodeHeight = DEFAULT_NODE_HEIGHT,
    rankSep = DEFAULT_RANK_SEP,
    nodeSep = DEFAULT_NODE_SEP,
    hideCollapsed = [],
    viewDepth = null,
  } = options;

  const hiddenSet = new Set(hideCollapsed);
  const goals = tree.goals;

  // Build parent→children map
  const children = new Map<number, number[]>();
  const goalById = new Map<number, Goal>();
  for (const g of goals) {
    goalById.set(g.id, g);
    if (!children.has(g.parent_id)) children.set(g.parent_id, []);
    children.get(g.parent_id)!.push(g.id);
  }

  // Find effective roots: level 0 or parent_id === 0 or broken ref
  const allIds = new Set(goals.map(g => g.id));
  const roots = goals.filter(g => g.parent_id === 0 || !allIds.has(g.parent_id));

  // Determine hidden subtrees (collapsed or beyond viewDepth)
  const hiddenSubtrees = new Set<number>();
  function markHidden(id: number): void {
    for (const child of children.get(id) ?? []) {
      hiddenSubtrees.add(child);
      markHidden(child);
    }
  }
  for (const id of hiddenSet) markHidden(id);
  if (viewDepth !== null) {
    for (const g of goals) {
      if (g.level > viewDepth) hiddenSubtrees.add(g.id);
    }
  }

  const nodes: LaidOutNode[] = [];
  const edges: LaidOutEdge[] = [];

  // Recursive layout: assign y by counting vertical slots per column
  const columnNextY = new Map<number, number>();

  function getNextY(col: number): number {
    return columnNextY.get(col) ?? 0;
  }
  function advanceY(col: number, delta: number): void {
    columnNextY.set(col, (columnNextY.get(col) ?? 0) + delta);
  }

  function placeSubtree(id: number): { top: number; bottom: number } {
    const goal = goalById.get(id);
    if (!goal || hiddenSubtrees.has(id)) return { top: 0, bottom: 0 };

    const col = goal.level;
    const childIds = (children.get(id) ?? []).filter(c => !hiddenSubtrees.has(c));
    const isCollapsedRoot = hiddenSet.has(id) && childIds.length > 0;
    const hasHiddenChildren = childIds.length < (children.get(id) ?? []).length;

    if (childIds.length === 0) {
      // Leaf: place at current column Y
      const y = getNextY(col);
      advanceY(col, nodeHeight + nodeSep);
      nodes.push({ id, x: col * (nodeWidth + rankSep), y, width: nodeWidth, height: nodeHeight, data: goal, isCollapsedRoot, hasHiddenChildren });
      return { top: y, bottom: y + nodeHeight };
    }

    // Place children first to get their span
    const spans: Array<{ top: number; bottom: number }> = [];
    for (const cid of childIds) {
      spans.push(placeSubtree(cid));
    }

    const spanTop = Math.min(...spans.map(s => s.top));
    const spanBottom = Math.max(...spans.map(s => s.bottom));
    const parentY = spanTop + (spanBottom - spanTop) / 2 - nodeHeight / 2;

    // Make sure parent column is at least this far
    const curColY = getNextY(col);
    const finalY = Math.max(parentY, curColY);
    advanceY(col, finalY - curColY + nodeHeight + nodeSep);

    nodes.push({ id, x: col * (nodeWidth + rankSep), y: finalY, width: nodeWidth, height: nodeHeight, data: goal, isCollapsedRoot, hasHiddenChildren });

    for (const cid of childIds) {
      edges.push({ source: id, target: cid });
    }

    return { top: Math.min(finalY, spanTop), bottom: Math.max(finalY + nodeHeight, spanBottom) };
  }

  for (const root of roots) {
    if (!hiddenSubtrees.has(root.id)) {
      placeSubtree(root.id);
      // Add inter-root gap
      for (const [col, y] of columnNextY) {
        columnNextY.set(col, y + nodeSep);
      }
    }
  }

  if (nodes.length === 0) {
    return { nodes: [], edges: [], bounds: { x: 0, y: 0, width: 0, height: 0 } };
  }

  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxX = Math.max(...nodes.map(n => n.x + n.width));
  const maxY = Math.max(...nodes.map(n => n.y + n.height));

  return { nodes, edges, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}
