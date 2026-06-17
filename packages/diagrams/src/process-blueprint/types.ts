export type AspectCategory = 'systems' | 'actors' | 'equipment' | 'information_entities';

// ── Compliance lane types ────────────────────────────────────────────────────

/**
 * One of the three orthogonal decoration signals that can appear on a compliance
 * law chip (ADR 2026-06-09-compliance-impact-as-blueprint-lane §3):
 * - `new`      — law's impact on this stage appeared since the previous snapshot
 * - `gap`      — a bound assertion has status `non_compliant` or `partial`
 * - `deadline` — gap is present AND the requirement carries a deadline that is
 *                past, imminent, or in-force
 */
export type ComplianceDecoration = 'new' | 'gap' | 'deadline';

/** Input shape for a requirement — minimal projection the compliance lane needs. */
export interface ComplianceLaneRequirement {
  id: string;
  /** Typed IDs of codex sources (law IDs displayed as chips). */
  derived_from?: string[];
  /**
   * ISO 8601 compliance deadline on the external regulatory source.
   * Used to compute the `deadline` decoration.
   */
  deadline?: string;
}

/** Input shape for an assertion — minimal projection the compliance lane needs. */
export interface ComplianceLaneAssertion {
  /** Requirement ID this assertion is about. */
  about: string;
  /** Compliance realisation status. */
  status: 'compliant' | 'partial' | 'non_compliant' | 'under_review' | 'pending_owner' | 'n_a';
  /**
   * Typed IDs of stages / process steps where the requirement is realised.
   * When empty/absent, the assertion covers the entire subject, not a specific stage.
   */
  realised_via?: string[];
}

/**
 * Input data for the compliance lane derivation.
 * Passed via `ProcessBlueprintLayoutOptions.complianceInput`.
 */
export interface ComplianceLaneInput {
  assertions: ComplianceLaneAssertion[];
  requirements: ComplianceLaneRequirement[];
  /**
   * Codex jurisdiction map: codexId → jurisdiction code.
   * Required only when `ComplianceLaneConfig.jurisdictions` is non-empty.
   */
  codexJurisdictions?: Record<string, string>;
}

/**
 * Runtime configuration for the compliance lane.
 * Passed via `ProcessBlueprintLayoutOptions.complianceLane`.
 */
export interface ComplianceLaneConfig {
  /** When false (default), the compliance lane is not rendered. */
  enabled: boolean;
  /**
   * Jurisdiction filter: if non-empty, only show laws whose codex jurisdiction
   * is in this list. Requires `ComplianceLaneInput.codexJurisdictions`.
   */
  jurisdictions?: string[];
  /**
   * Per-stage map of law IDs known from the previous generated snapshot.
   * Key: stage ID; Value: array of law IDs.
   * A law not present in the previous snapshot is decorated as `new`.
   */
  previousSnapshot?: Record<string, string[]>;
  /**
   * Reference date for deadline-status computation (YYYY-MM-DD).
   * Defaults to today when not supplied.
   */
  referenceDate?: string;
}

/** One law chip rendered inside a compliance cell. */
export interface ComplianceChip {
  stageIndex: number;
  /** Codex / law ID shown as the chip label. */
  lawId: string;
  /** Active decorations — a subset of the three orthogonal signals. */
  decorations: ComplianceDecoration[];
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Laid-out compliance row (one per blueprint when the lane is enabled). */
export interface ComplianceRow {
  y: number;
  height: number;
  chips: ComplianceChip[];
}

export interface Stage {
  id: string;
  name: string;
  goal: string;
  result: string;
  description?: string;
}

export interface AspectEntry {
  id?: string;
  name: string;
  stages: string[];
  description?: string;
}

/** Rendering-config block that selects which lanes are visible (spec §5 `lane_config:`). */
export interface LaneConfig {
  /** Enable the derived compliance lane. Default: false. */
  compliance?: boolean;
  compliance_filter?: {
    /** ISO jurisdiction codes; empty array means all jurisdictions. */
    jurisdictions?: string[];
  };
}

export interface ProcessBlueprintHeader {
  id: string;
  name: string;
  description?: string;
  period?: string;
  version?: string;
  date?: string;
  author?: string;
  process?: string;
  scenario?: string;
  stages: Stage[];
  systems?: AspectEntry[];
  actors?: AspectEntry[];
  equipment?: AspectEntry[];
  information_entities?: AspectEntry[];
  /** Optional rendering config selecting which lanes to show. */
  lane_config?: LaneConfig;
}

export interface ProcessBlueprintFile {
  notation: string;
  spec_version?: string;
  process_blueprint: ProcessBlueprintHeader;
}

export interface ProcessBlueprintLayoutOptions {
  legendColumnWidth?: number;
  stageColumnWidth?: number;
  stageHeaderHeight?: number;
  goalRowHeight?: number;
  resultRowHeight?: number;
  aspectRowMinHeight?: number;
  pillHeight?: number;
  pillGap?: number;
  cellPadding?: number;
  /** Vertical advance between wrapped text lines in goal/result cells (px). */
  textLineHeight?: number;
  /** Approximate glyph width used to estimate wrap width (px per char). */
  textCharWidth?: number;
  /** Horizontal text inset inside goal/result cells (px, both sides). */
  cellTextPadX?: number;
  /** Top+bottom padding added around wrapped goal/result text (px). */
  cellTextPadY?: number;
  /** Maximum wrapped lines per goal/result cell before truncating with an ellipsis. */
  maxTextLines?: number;
  /** Enable and configure the derived compliance lane. Default: disabled. */
  complianceLane?: ComplianceLaneConfig;
  /** Assertion + requirement data for the compliance lane derivation. */
  complianceInput?: ComplianceLaneInput;
}

import type { LayoutBounds } from '../geometry.js';
export type { LayoutBounds };

export interface LegendCell {
  kind: 'goal' | 'result' | 'aspect' | 'compliance';
  category?: AspectCategory;
  label: string;
  y: number;
  height: number;
}

export interface StageHeaderCell {
  stageIndex: number;
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageTextCell {
  stageIndex: number;
  text: string;
  /** Word-wrapped lines of `text`, pre-fitted to the cell width by the layout. */
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AspectPill {
  category: AspectCategory;
  entryIndex: number;
  name: string;
  id?: string;
  startStageIndex: number;
  endStageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AspectRow {
  category: AspectCategory;
  y: number;
  height: number;
  pills: AspectPill[];
}

export interface ProcessBlueprintLayout {
  bounds: LayoutBounds;
  legendColumnWidth: number;
  stageColumnWidth: number;
  /** Vertical advance between wrapped text lines, so renderers stack tspans consistently. */
  textLineHeight: number;
  /** Horizontal text inset used for goal/result cells (px). */
  cellTextPadX: number;
  legend: LegendCell[];
  stageHeaders: StageHeaderCell[];
  goalCells: StageTextCell[];
  resultCells: StageTextCell[];
  aspectRows: AspectRow[];
  /** Compliance lane row — present only when the lane is enabled and has data. */
  complianceRow?: ComplianceRow;
}
