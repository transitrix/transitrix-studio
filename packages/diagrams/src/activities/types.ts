export interface Activity {
  id: string;
  name: string;
  duration?: number;
  activity_type?: string;
  goals?: string[];
  scenario?: string;
  parent?: string;
  predecessors?: string[];
  owner?: string;
  unit?: string;
  employee?: string;
  score?: number;
  sort?: number;
  tags?: string[];
  start_date?: string;
  end_date?: string;
  labor_cost?: number;
  resources_cost?: number;
  effort?: number;
  link?: string;
  description?: string;
  delivers_changes?: string[];
}

export interface ActivityDoc {
  notation: string;
  spec_version?: string;
  title?: string;
  description?: string;
  version?: string;
  date?: string;
  author?: string;
  activities: Activity[];
}

export interface ActivityValidationError {
  code: string;
  message: string;
  path?: string;
}

export interface ActivityValidationWarning {
  code: string;
  message: string;
  path?: string;
}

export interface ActivityValidationResult {
  valid: boolean;
  errors: ActivityValidationError[];
  warnings: ActivityValidationWarning[];
}

export interface CpmValues {
  es: number;
  ef: number;
  ls: number;
  lf: number;
  slack: number;
  isCritical: boolean;
}

export type CpmResult = Map<string, CpmValues>;

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: Activity;
  cpm?: CpmValues;
}

export interface LayoutEdge {
  sourceId: string;
  targetId: string;
  isCritical: boolean;
}

export interface ActivitiesLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  bounds: { x: number; y: number; width: number; height: number };
}
