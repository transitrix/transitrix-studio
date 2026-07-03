import type { CapabilityMap, LayoutOptions, CapabilityMapLayout, LaidOutNode, LaidOutEdge } from './dsm-schema.js';
import { getLevel, getParentAddress } from './address.js';

const DEFAULT_NODE_WIDTH = 250;
const DEFAULT_NODE_HEIGHT = 64;
const DEFAULT_RANK_SEP = 80;
const DEFAULT_NODE_SEP = 24;
/** Width of the virtual organisation-root node — narrower than a capability
 *  card since it carries only a label, no maturity dot or address. */
const ROOT_WIDTH = 200;

/**
 * Lays out a capability map's on-diagram (non-backlog) capabilities, plus a
 * virtual organisation-root node one column to the left of the L1s (§6.1).
 * Backlog filtering is a Layer B / component concern (same split as the
 * goals module) — this function lays out whatever `capabilities` it's given,
 * using their address to derive parent/child structure.
 */
export function layoutCapabilityMap(map: CapabilityMap, options: LayoutOptions = {}): CapabilityMapLayout {
  const {
    nodeWidth = DEFAULT_NODE_WIDTH,
    nodeHeight = DEFAULT_NODE_HEIGHT,
    rankSep = DEFAULT_RANK_SEP,
    nodeSep = DEFAULT_NODE_SEP,
    hideCollapsed = [],
    // organisationLabel isn't stored on LaidOutNode (its `data` is a
    // Capability | null, with no label slot for the virtual root) — the
    // component reads `layoutOptions.organisationLabel ?? map.organisation`
    // directly when it renders the root card.
  } = options;

  const hiddenSet = new Set(hideCollapsed);
  const onDiagram = map.capabilities.filter((c) => !c.backlog);
  const byId = new Map(onDiagram.map((c) => [c.id, c]));
  const addressToId = new Map(onDiagram.map((c) => [c.address, c.id]));

  const children = new Map<number, number[]>();
  const l1Ids: number[] = [];
  for (const c of onDiagram) {
    const level = getLevel(c.address);
    if (level === 'backlog') continue;
    if (level === 1) {
      l1Ids.push(c.id);
      continue;
    }
    const parentAddress = getParentAddress(c.address);
    const parentId = parentAddress ? addressToId.get(parentAddress) : undefined;
    if (parentId === undefined) {
      // MISSING_PARENT_BY_ADDRESS is a warning, not an error — render it
      // hanging directly off the root rather than dropping it silently.
      l1Ids.push(c.id);
      continue;
    }
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId)!.push(c.id);
  }

  const byAddress = (a: number, b: number): number =>
    byId.get(a)!.address.localeCompare(byId.get(b)!.address, undefined, { numeric: true });
  l1Ids.sort(byAddress);
  for (const kids of children.values()) kids.sort(byAddress);

  const hiddenSubtrees = new Set<number>();
  function markHidden(id: number): void {
    for (const child of children.get(id) ?? []) {
      hiddenSubtrees.add(child);
      markHidden(child);
    }
  }
  for (const id of hiddenSet) markHidden(id);

  const nodes: LaidOutNode[] = [];
  const edges: LaidOutEdge[] = [];
  const columnNextY = new Map<number, number>();
  const getNextY = (col: number): number => columnNextY.get(col) ?? 0;
  const advanceY = (col: number, delta: number): void => { columnNextY.set(col, (columnNextY.get(col) ?? 0) + delta); };

  function placeSubtree(id: number, col: number): { top: number; bottom: number } {
    const cap = byId.get(id)!;
    const allChildIds = children.get(id) ?? [];
    const childIds = allChildIds.filter((c) => !hiddenSubtrees.has(c));
    const hasHiddenChildren = childIds.length < allChildIds.length;

    if (childIds.length === 0) {
      const y = getNextY(col);
      advanceY(col, nodeHeight + nodeSep);
      nodes.push({ id, x: col * (nodeWidth + rankSep), y, width: nodeWidth, height: nodeHeight, data: cap, hasHiddenChildren });
      return { top: y, bottom: y + nodeHeight };
    }

    const spans = childIds.map((cid) => placeSubtree(cid, col + 1));
    const spanTop = Math.min(...spans.map((s) => s.top));
    const spanBottom = Math.max(...spans.map((s) => s.bottom));
    const parentY = spanTop + (spanBottom - spanTop) / 2 - nodeHeight / 2;
    const curColY = getNextY(col);
    const finalY = Math.max(parentY, curColY);
    advanceY(col, finalY - curColY + nodeHeight + nodeSep);

    nodes.push({ id, x: col * (nodeWidth + rankSep), y: finalY, width: nodeWidth, height: nodeHeight, data: cap, hasHiddenChildren });
    for (const cid of childIds) edges.push({ source: id, target: cid });
    return { top: Math.min(finalY, spanTop), bottom: Math.max(finalY + nodeHeight, spanBottom) };
  }

  for (const id of l1Ids) {
    if (hiddenSubtrees.has(id)) continue;
    placeSubtree(id, 1);
    for (const [col, y] of columnNextY) columnNextY.set(col, y + nodeSep);
  }

  if (nodes.length === 0) {
    const rootNode: LaidOutNode = { id: 0, x: 0, y: 0, width: ROOT_WIDTH, height: nodeHeight, data: null, hasHiddenChildren: false };
    return { rootNode, nodes: [], edges: [], bounds: { x: 0, y: 0, width: ROOT_WIDTH, height: nodeHeight } };
  }

  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const maxY = Math.max(...nodes.map((n) => n.y + n.height));

  const l1IdSet = new Set(l1Ids);
  const l1Nodes = nodes.filter((n) => l1IdSet.has(n.id));
  const rootTop = Math.min(...l1Nodes.map((n) => n.y));
  const rootBottom = Math.max(...l1Nodes.map((n) => n.y + n.height));
  const rootY = rootTop + (rootBottom - rootTop) / 2 - nodeHeight / 2;
  const rootNode: LaidOutNode = { id: 0, x: 0, y: rootY, width: ROOT_WIDTH, height: nodeHeight, data: null, hasHiddenChildren: false };

  const rootEdges: LaidOutEdge[] = l1Ids
    .filter((id) => !hiddenSubtrees.has(id))
    .map((id) => ({ source: 'root' as const, target: id }));

  return {
    rootNode,
    nodes,
    edges: [...rootEdges, ...edges],
    bounds: {
      x: Math.min(0, minX),
      y: Math.min(rootY, minY),
      width: Math.max(maxX, ROOT_WIDTH) - Math.min(0, minX),
      height: Math.max(rootY + nodeHeight, maxY) - Math.min(rootY, minY),
    },
  };
}
