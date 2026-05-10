export interface FactorItem {
  id: number;
  name: string;
}

export interface GoalItem {
  id: number;
  name: string;
  level?: number;
  /** Goals may carry embedded factor links returned by the API. */
  factor?: Array<{ id: number }>;
}

export interface BdnChangeWithActivities {
  id: number;
  name: string;
  goal_id: number;
  activity_ids: number[];
}

export interface ActivityItem {
  id: number;
  name: string;
  goal_id?: number | null;
  activity_type_id?: number;
}

export interface ActivityTypeItem {
  id: number;
  name?: string;
}

export interface DiagramStyle {
  nodeBorderColor?: string;
  nodeBorderWidth?: number;
  edgeColor?: string;
  edgeWidth?: number;
}

/** The four columns of the FGCA diagram. */
export type FGCAColumn = "factor" | "goal" | "change" | "activity";

export const ALL_FGCA_COLUMNS: FGCAColumn[] = ["factor", "goal", "change", "activity"];

export const FGCA_COLUMN_LABELS: Record<FGCAColumn, string> = {
  factor: "F",
  goal: "G",
  change: "C",
  activity: "A",
};
