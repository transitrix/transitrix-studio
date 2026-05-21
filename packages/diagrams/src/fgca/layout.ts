import type { Node, Edge } from "reactflow";
import { Position, MarkerType } from "reactflow";
import type {
  FactorItem,
  GoalItem,
  BdnChangeWithActivities,
  ActivityItem,
  ActivityTypeItem,
  DiagramStyle,
  FGCAColumn,
} from "./types";
import { ALL_FGCA_COLUMNS } from "./types";

export const NODE_WIDTH = 250;
export const NODE_HEIGHT = 80;
export const COLUMN_GAP = 180;
export const ROW_GAP = 24;

/** Default background colours per column. */
export const COLUMN_BG: Record<FGCAColumn, string> = {
  factor: "#fef3c7",
  goal: "#e0e7ff",
  change: "#dbeafe",
  activity: "#d4edda",
};

export interface FGCALayoutInput {
  factors: FactorItem[];
  goals: GoalItem[];
  changes: BdnChangeWithActivities[];
  activities: ActivityItem[];
  visibleColumns: Set<FGCAColumn>;
  diagramStyle?: DiagramStyle;
  activityTypeList?: ActivityTypeItem[];
  /** Per-level goal background colours. Fallback used when a level is not in the map. */
  goalLevelColors?: Record<number, string>;
}

/**
 * Pure layout function: converts raw FGCA data into ReactFlow nodes + edges.
 * No React, no Redux, no DOM. Safe to call in Node.js or a test environment.
 */
export function buildFGCALayout({
  factors,
  goals,
  changes,
  activities,
  visibleColumns,
  diagramStyle = {},
  activityTypeList = [],
  goalLevelColors = {},
}: FGCALayoutInput): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const { edgeColor = "#94a3b8", edgeWidth = 1, nodeBorderColor = "#94a3b8", nodeBorderWidth = 1 } =
    diagramStyle;

  const visibleCols = ALL_FGCA_COLUMNS.filter((c) => visibleColumns.has(c));
  const colX: Partial<Record<FGCAColumn, number>> = {};
  visibleCols.forEach((col, idx) => {
    colX[col] = idx * (NODE_WIDTH + COLUMN_GAP);
  });

  const goalIds = new Set(goals.map((g) => g.id));
  const edgeStyle = { strokeWidth: edgeWidth, stroke: edgeColor };
  const baseNodeStyle = { borderColor: nodeBorderColor, borderWidth: nodeBorderWidth, borderStyle: "solid" };

  if (visibleColumns.has("factor")) {
    factors.forEach((f, i) => {
      nodes.push({
        id: `factor_${f.id}`,
        type: "fgcaFactor",
        position: { x: colX["factor"]!, y: i * (NODE_HEIGHT + ROW_GAP) },
        data: { id: f.id, name: f.name, ...baseNodeStyle },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });
  }

  if (visibleColumns.has("goal")) {
    goals.forEach((g, i) => {
      const level = g.level ?? 0;
      const bgColor = goalLevelColors[level] ?? COLUMN_BG.goal;
      nodes.push({
        id: `goal_${g.id}`,
        type: "fgcaGoal",
        position: { x: colX["goal"]!, y: i * (NODE_HEIGHT + ROW_GAP) },
        data: { id: g.id, name: g.name, level, bgColor, ...baseNodeStyle },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });
  }

  if (visibleColumns.has("change")) {
    changes.forEach((c, i) => {
      nodes.push({
        id: `change_${c.id}`,
        type: "fgcaChange",
        position: { x: colX["change"]!, y: i * (NODE_HEIGHT + ROW_GAP) },
        data: { id: c.id, name: c.name, ...baseNodeStyle },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });
  }

  if (visibleColumns.has("activity")) {
    activities.forEach((a, i) => {
      const activityTypeName =
        (a.activity_type_id != null &&
          activityTypeList.find((t) => t.id === a.activity_type_id)?.name) ||
        "Activity";
      nodes.push({
        id: `activity_${a.id}`,
        type: "fgcaActivity",
        position: { x: colX["activity"]!, y: i * (NODE_HEIGHT + ROW_GAP) },
        data: { id: a.id, name: a.name, activityTypeName, ...baseNodeStyle },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });
  }

  // Factor→Goal edges (via embedded factor[] on each goal)
  if (visibleColumns.has("factor") && visibleColumns.has("goal")) {
    goals.forEach((g) => {
      g.factor?.forEach((f) => {
        edges.push({
          id: `edge_f${f.id}_g${g.id}`,
          source: `factor_${f.id}`,
          target: `goal_${g.id}`,
          markerEnd: { type: MarkerType.ArrowClosed },
          type: "smoothstep",
          style: edgeStyle,
        });
      });
    });
  }

  // Goal→Change edges
  if (visibleColumns.has("goal") && visibleColumns.has("change")) {
    changes.forEach((c) => {
      if (goalIds.has(c.goal_id)) {
        edges.push({
          id: `edge_g${c.goal_id}_c${c.id}`,
          source: `goal_${c.goal_id}`,
          target: `change_${c.id}`,
          markerEnd: { type: MarkerType.ArrowClosed },
          type: "smoothstep",
          style: edgeStyle,
        });
      }
    });
  }

  // Change→Activity edges
  if (visibleColumns.has("change") && visibleColumns.has("activity")) {
    changes.forEach((c) => {
      (c.activity_ids ?? []).forEach((aid) => {
        edges.push({
          id: `edge_c${c.id}_a${aid}`,
          source: `change_${c.id}`,
          target: `activity_${aid}`,
          markerEnd: { type: MarkerType.ArrowClosed },
          type: "smoothstep",
          style: edgeStyle,
        });
      });
    });
  }

  // Goal→Activity direct edges (only for activities not already covered via a Change link)
  if (visibleColumns.has("goal") && visibleColumns.has("activity")) {
    const coveredActivityIds = visibleColumns.has("change")
      ? new Set(changes.flatMap((c) => c.activity_ids ?? []))
      : new Set<number>();
    activities.forEach((a) => {
      const gid = a.goal_id;
      if (gid != null && goalIds.has(gid) && !coveredActivityIds.has(a.id)) {
        edges.push({
          id: `edge_g${gid}_a${a.id}`,
          source: `goal_${gid}`,
          target: `activity_${a.id}`,
          markerEnd: { type: MarkerType.ArrowClosed },
          type: "smoothstep",
          style: edgeStyle,
        });
      }
    });
  }

  return { nodes, edges };
}
