/**
 * Issues notation — a text-native register of issues (problems, defects,
 * open questions) with parent/child nesting. See methodology spec
 * `notations/12-issues.md`.
 */

export type IssueStatus = 'open' | 'in_progress' | 'blocked' | 'resolved' | 'closed';

export interface Issue {
  issue_id: string;
  name: string;
  status: IssueStatus;
  /** issue_id of the parent issue — the nesting mechanism. */
  parent?: string;
  description?: string;
  /** Typed IDs of ACTIVITY / GOAL elements this issue concerns. */
  relates_to?: string[];
  /** ROLE element ID of the role accountable for the issue. */
  owner_role?: string;
}

export interface IssuesCatalogue {
  id: string;
  name: string;
  description?: string;
  version?: string;
  updated_at: string;
  issues: Issue[];
}

export interface IssuesFile {
  notation: string;
  spec_version?: string;
  issues_catalogue: IssuesCatalogue;
}

export interface IssuesLayoutOptions {
  rowHeight?: number;
  rowGap?: number;
  indentWidth?: number;
  nodeWidth?: number;
  paddingX?: number;
  paddingY?: number;
}

export interface LaidOutIssue {
  issue_id: string;
  /** 0 for a root issue, +1 per nesting level. */
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  data: Issue;
  hasChildren: boolean;
}

export interface IssuesLayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IssuesLayout {
  rows: LaidOutIssue[];
  bounds: IssuesLayoutBounds;
}

// Validation result shape is shared across every notation module — see
// `../validation-types.ts`. Re-exported here so consumers of this module
// have a single import surface.
export type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
