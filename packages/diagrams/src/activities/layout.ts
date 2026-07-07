import type { ActivityDoc, Activity, ActivitiesLayout, ActivitiesLayoutOptions, LayoutNode, LayoutEdge } from './types.js';
import { computeCpm } from './cpm.js';

const DEFAULT_NODE_W = 200;
const DEFAULT_NODE_H = 80;
const H_GAP = 80;
const V_GAP = 24;

export function layoutActivities(doc: ActivityDoc, options: ActivitiesLayoutOptions = {}): ActivitiesLayout {
  const {
    horizontalGap = H_GAP,
    verticalGap = V_GAP,
    nodeWidth = DEFAULT_NODE_W,
    nodeHeight = DEFAULT_NODE_H,
  } = options;
  const activities = doc.activities;
  if (activities.length === 0) {
    return { nodes: [], edges: [], bounds: { x: 0, y: 0, width: 0, height: 0 } };
  }

  const cpm = computeCpm(activities);

  // Topological column assignment via Kahn's
  const successors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const a of activities) {
    successors.set(a.id, []);
    inDegree.set(a.id, 0);
  }
  for (const a of activities) {
    for (const pred of (a.predecessors ?? [])) {
      successors.get(pred)?.push(a.id);
      inDegree.set(a.id, (inDegree.get(a.id) ?? 0) + 1);
    }
  }

  const column = new Map<string, number>();
  const queue: string[] = [];
  for (const a of activities) {
    if ((inDegree.get(a.id) ?? 0) === 0) queue.push(a.id);
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const col = column.get(id) ?? 0;
    for (const succ of (successors.get(id) ?? [])) {
      const newCol = Math.max(column.get(succ) ?? 0, col + 1);
      column.set(succ, newCol);
      const newDeg = (inDegree.get(succ) ?? 1) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  // Group activities by column, sort within each column by `sort` then `id`
  const cols = new Map<number, Activity[]>();
  for (const a of activities) {
    const col = column.get(a.id) ?? 0;
    if (!cols.has(col)) cols.set(col, []);
    cols.get(col)!.push(a);
  }
  for (const list of cols.values()) {
    list.sort((a, b) => {
      const sortA = a.sort ?? Number.MAX_SAFE_INTEGER;
      const sortB = b.sort ?? Number.MAX_SAFE_INTEGER;
      if (sortA !== sortB) return sortA - sortB;
      return a.id.localeCompare(b.id);
    });
  }

  // Assign positions
  const nodeMap = new Map<string, LayoutNode>();
  const nodes: LayoutNode[] = [];
  const colCount = Math.max(0, ...[...cols.keys()]) + 1;

  for (let c = 0; c < colCount; c++) {
    const list = cols.get(c) ?? [];
    const x = c * (nodeWidth + horizontalGap);
    let y = 0;
    for (const a of list) {
      const node: LayoutNode = {
        id: a.id,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
        data: a,
        cpm: cpm.get(a.id),
      };
      nodes.push(node);
      nodeMap.set(a.id, node);
      y += nodeHeight + verticalGap;
    }
  }

  // Build edges
  const edges: LayoutEdge[] = [];
  for (const a of activities) {
    for (const predId of (a.predecessors ?? [])) {
      if (nodeMap.has(predId)) {
        const predCpm = cpm.get(predId);
        const succCpm = cpm.get(a.id);
        const isCritical = (predCpm?.isCritical ?? false) && (succCpm?.isCritical ?? false);
        edges.push({ sourceId: predId, targetId: a.id, isCritical });
      }
    }
  }

  if (nodes.length === 0) return { nodes, edges, bounds: { x: 0, y: 0, width: 0, height: 0 } };

  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxX = Math.max(...nodes.map(n => n.x + n.width));
  const maxY = Math.max(...nodes.map(n => n.y + n.height));

  return { nodes, edges, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}
