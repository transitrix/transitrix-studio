// Activities historically exposed PREFIXED validation type names. Keep them
// as aliases of the shared shape (`../validation-types.ts`) so external
// consumers keep working.
import type {
  ValidationError as SharedValidationError,
  ValidationWarning as SharedValidationWarning,
  ValidationResult as SharedValidationResult,
} from '../validation-types.js';

export type ActivityValidationError = SharedValidationError;
export type ActivityValidationWarning = SharedValidationWarning;
export type ActivityValidationResult = SharedValidationResult;

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

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface ProjectCalendar {
  working_days?: Weekday[];
  hours_per_day?: number;
  holidays?: string[];
}

export interface ProjectBlock {
  start_date?: string;
  calendar?: ProjectCalendar;
}

export interface ActivityDoc {
  notation: string;
  spec_version?: string;
  title?: string;
  description?: string;
  version?: string;
  date?: string;
  author?: string;
  project?: ProjectBlock;
  activities: Activity[];
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

// ── Gantt view (spec §9) ─────────────────────────────────────────────────────

export type GanttMode = 'computed' | 'pinned';

export type GanttBarKind = 'leaf' | 'milestone' | 'phase';

export interface GanttBar {
  id: string;
  name: string;
  kind: GanttBarKind;
  /** Inclusive start date as ISO 8601 yyyy-mm-dd. */
  startDate: string;
  /** Inclusive end date as ISO 8601 yyyy-mm-dd. For milestones equals startDate. */
  endDate: string;
  /** True if the activity is on the critical path (only when CPM applies — computed mode). */
  isCritical: boolean;
  /** Optional parent activity id (for phase grouping). */
  parent?: string;
  /** Activity record. */
  data: Activity;
}

export interface GanttLink {
  sourceId: string;
  targetId: string;
  isCritical: boolean;
}

export interface GanttLayout {
  /** Render mode that produced this layout. */
  mode: GanttMode;
  /** Inclusive timeline bounds as ISO 8601 yyyy-mm-dd. */
  timelineStart: string;
  timelineEnd: string;
  bars: GanttBar[];
  links: GanttLink[];
}

export interface GanttUnavailable {
  unavailable: true;
  /** Human-readable explanation of what is missing. */
  reason: string;
}

export type GanttResult = GanttLayout | GanttUnavailable;
