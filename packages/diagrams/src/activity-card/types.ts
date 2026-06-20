// Activity Card notation — single-project narrative view.
//
// Spec: transitrix/methodology `notations/views/18-activity-card.md` (v0.1).
// Epic vkgeorgia/strategy#97, Studio track #134.
//
// The Activity Card is the first MULTI-DOCUMENT Studio notation. The card
// YAML itself holds only `id`, `project` (an Activity ID), `description`,
// and `milestones[]`. Everything painted on the card — the project name,
// dates, motivation chain (Factors → Goals → Changes), and child activities
// — is pulled BY REFERENCE at view time from the canonical ELEMENT and
// RELATION store (`canon/elements/**`, `canon/relations/**`), never from
// other view documents. This honours the view-purity invariant: a view is a
// projection over elements + relations (methodology ELEMENT_PRIMITIVES.md §1).
// See `resolver.ts`.
//
// This file declares two model layers:
//   1. the RAW card document (what the YAML parses into), and
//   2. the ASSEMBLED card view-model (what the resolver produces and the
//      layout consumes).

import type {
  ValidationError as SharedValidationError,
  ValidationWarning as SharedValidationWarning,
  ValidationResult as SharedValidationResult,
} from '../validation-types.js';

// Keep PREFIXED aliases consistent with the other notation modules so
// external consumers can name the activity-card result types directly.
export type ActivityCardValidationError = SharedValidationError;
export type ActivityCardValidationWarning = SharedValidationWarning;
export type ActivityCardValidationResult = SharedValidationResult;

// ── Raw card document (the `*.activity-card.transitrix.yaml` shape) ──────────

export interface RawMilestone {
  id: string;
  name: string;
  /** Quoted ISO 8601 date (YYYY-MM-DD) when the milestone is reached. */
  date: string;
  description?: string;
  /** CHANGE-… IDs; each must be a subset of the project Activity's delivers_changes. */
  delivers_changes?: string[];
}

export interface ActivityCardBlock {
  id: string;
  /** Canonical ID of the referenced project Activity (ACTIVITY-…). */
  project: string;
  description?: string;
  milestones?: RawMilestone[];
}

export interface ActivityCardDoc {
  notation: string;
  spec_version?: string;
  activity_card: ActivityCardBlock;
}

// ── Canon sources consumed by the resolver ──────────────────────────────────
//
// View-purity invariant (methodology ELEMENT_PRIMITIVES.md §1): a view is a
// projection over the canonical ELEMENTS + RELATIONS, never over other view
// documents. The Activity Card therefore resolves its project, child
// activities, and motivation chain from the canon element store
// (`canon/elements/**` — one ACTIVITY / FACTOR / GOAL / CHANGE element per
// file, each a `notation: <type>` document carrying its own `id`) and the
// relation store (`canon/relations/**` — `notation: relation` files), NOT from
// sibling `*.activities.*` / `*.fgca.*` view documents.
//
// The resolver is filesystem-free: the extension reads + parses the element and
// relation files and hands the parsed objects in. We model them as `unknown[]`
// at the boundary and narrow defensively inside the resolver, so a malformed
// element / relation degrades to a resolution error rather than a crash.

export interface ActivityCardSources {
  /** Parsed canon element documents — one element per file (`notation: activity|factor|goal|change|…`). */
  elements: unknown[];
  /** Parsed canon relation documents (`notation: relation`). */
  relations: unknown[];
}

// ── Assembled card view-model (resolver output → layout input) ───────────────

export interface ResolvedProject {
  id: string;
  name: string;
  /** Full description from the Activity (the card's own `description` is separate). */
  description?: string;
  /** Lifecycle: decision-to-initiate date (CONTRACT.md §7). */
  valid_from?: string;
  /** Lifecycle: when the project ceased effect, or undefined if active. */
  valid_to?: string;
  /** Planned work range. */
  start_date?: string;
  end_date?: string;
  /**
   * Activity scale: programme | project | workstream | task (or any custom
   * value). Shown in the card header so the reader knows what level this card
   * represents. Optional — card shows "—" when absent.
   */
  activity_type?: string;
  /**
   * Current execution state: planned | in_progress | on_track | at_risk |
   * blocked | completed | cancelled. Optional — card shows "—" when absent.
   */
  status?: string;
}

export interface ResolvedMilestone {
  id: string;
  name: string;
  date: string;
  description?: string;
  /** CHANGE-… IDs this milestone delivers (subset of the project's). */
  deliversChanges: string[];
}

export interface ResolvedFactor {
  id: string;
  name: string;
}

/**
 * A dated finding about the current state of a Driver, answering the
 * question "what specific problem are we solving?" (pain point).
 * Resolved from ASSESSMENT elements whose `assesses` field points to a
 * Driver that is in scope for this activity's motivation chain.
 */
export interface ResolvedAssessment {
  id: string;
  name: string;
  /** ID of the Driver this assessment observes. */
  driverId: string;
  description?: string;
  /** ISO 8601 date when the finding was observed. */
  observed_at?: string;
}

export interface ResolvedGoal {
  id: string;
  name: string;
  /** FACTOR-… IDs that motivate this goal (canonical `goal.factors`). */
  factorIds: string[];
}

export interface ResolvedChange {
  id: string;
  name: string;
  /** GOAL-… IDs this change advances (canonical `change.goals`). */
  goalIds: string[];
}

/** Motivation chain: Factors → Goals → Changes, scoped to the project. */
export interface ResolvedMotivation {
  factors: ResolvedFactor[];
  goals: ResolvedGoal[];
  changes: ResolvedChange[];
}

export interface ResolvedChildActivity {
  id: string;
  name: string;
  activity_type?: string;
  start_date?: string;
  end_date?: string;
  owner?: string;
}

/** A STAKEHOLDER element linked to the project (via `activity_stakeholder`). */
export interface ResolvedStakeholder {
  id: string;
  name: string;
  /** internal | external (STAKEHOLDER `type`). */
  type?: string;
  interest?: string;
  influence?: string;
  /**
   * Project role from the `activity_stakeholder` relation:
   * initiator | owner | sponsor | project_manager.
   * Optional — card shows the name without a role badge when absent.
   */
  role?: string;
}

export interface ResolvedActivityCard {
  cardId: string;
  /** The card's own executive-summary description (distinct from the project's). */
  cardDescription?: string;
  project: ResolvedProject;
  /** Sorted ascending by `date`. */
  milestones: ResolvedMilestone[];
  motivation: ResolvedMotivation;
  /**
   * Assessments (pain points) for the in-scope Drivers, sorted by
   * `observed_at` ascending. Empty when no Assessment elements are found —
   * the gap is intentionally visible on the card.
   */
  assessments: ResolvedAssessment[];
  /** Activities whose `parent` = the project Activity id. */
  childActivities: ResolvedChildActivity[];
  /**
   * Names of the GOALs the project DIRECTLY serves (the `activity_goal`
   * targets, not the wider motivation chain) — painted as the "Project goal"
   * text field. Empty when the project serves no goal.
   */
  goalNames?: string[];
  /**
   * Stakeholders linked to the project via active `activity_stakeholder`
   * relations. Empty when none are linked (the card still shows the field
   * with a "—" placeholder).
   */
  stakeholders?: ResolvedStakeholder[];
}

// ── Layout geometry (pure; the preview turns this into SVG) ───────────────────

import type { LayoutBounds } from '../geometry.js';
export type { LayoutBounds };

/** A boxed value-pair shown in the dates band. */
export interface DateField {
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One milestone marker on the timeline. */
export interface MilestoneMarker {
  id: string;
  name: string;
  date: string;
  /** ArchiMate class label appended by the renderer (§5.1). */
  archimateClass: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One node in a motivation-chain column. */
export interface ChainNode {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An edge between two chain nodes (factor→goal or goal→change). */
export interface ChainEdge {
  sourceId: string;
  targetId: string;
}

export interface ChildActivityRow {
  id: string;
  name: string;
  /** ArchiMate class label appended by the renderer (§5.1). */
  archimateClass: string;
  meta: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SectionHeader {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A labeled, full-width text row: a label (e.g. "Project goal") over one or
 * more wrapped value lines. Used for the project Description, Project goal, and
 * Stakeholders fields. `valueLines` is `['—']` when the field is empty.
 */
export interface InfoRow {
  label: string;
  valueLines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActivityCardLayoutOptions {
  /** Outer card width (px). */
  cardWidth?: number;
  /** Horizontal gap (px) between the three motivation-chain columns. */
  columnGap?: number;
  /** Vertical gap (px) between stacked rows within a section. */
  rowGap?: number;
}

export interface ActivityCardLayout {
  bounds: LayoutBounds;
  title: { name: string; x: number; y: number };
  dateFields: DateField[];
  /** Description, Project goal, Stakeholders — full-width labeled text rows. */
  infoRows: InfoRow[];
  sectionHeaders: SectionHeader[];
  milestones: MilestoneMarker[];
  /** Three columns of the motivation chain, in F→G→C order. */
  chainColumns: { factors: ChainNode[]; goals: ChainNode[]; changes: ChainNode[] };
  chainEdges: ChainEdge[];
  childActivities: ChildActivityRow[];
}
