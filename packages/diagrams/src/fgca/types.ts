export interface DriverItem {
  id: number | string;
  name: string;
}

export interface GoalItem {
  id: number | string;
  name: string;
  level?: number;
  /** Goals may carry embedded factor links returned by the API. */
  factor?: Array<{ id: number | string }>;
}

export interface BdnChangeWithActivities {
  id: number | string;
  name: string;
  goal_id: number | string;
  activity_ids: Array<number | string>;
}

export interface ActivityItem {
  id: number | string;
  name: string;
  goal_id?: number | string | null;
  activity_type_id?: number;
}

export interface ActivityTypeItem {
  id: number | string;
  name?: string;
}

export interface DiagramStyle {
  nodeBorderColor?: string;
  nodeBorderWidth?: number;
  edgeColor?: string;
  edgeWidth?: number;
}

/** The four columns of the FGCA diagram. */
export type FGCAColumn = "driver" | "goal" | "change" | "activity";

export const ALL_FGCA_COLUMNS: FGCAColumn[] = ["driver", "goal", "change", "activity"];

export const FGCA_COLUMN_LABELS: Record<FGCAColumn, string> = {
  driver: "D",
  goal: "G",
  change: "C",
  activity: "A",
};
