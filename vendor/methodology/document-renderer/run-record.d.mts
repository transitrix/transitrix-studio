// Type contract for the vendored run-record.mjs — Studio's own, not part of
// what vendor-methodology-document-renderer.mjs fetches from methodology.
// Kept intentionally narrow: only the shape src/render-document.ts actually
// reads. Source of truth for the full contract is run-record.mjs's own JSDoc
// and the 2026-08-12 instruction-slot ADR.

export interface RunRecordHeader {
  template_id: string;
  template_version: string;
}

/** Structurally what pass2.mjs's `slotResults` entries carry — kept local
 *  rather than imported from pass2.d.mts so this file has no cross-vendor-file
 *  coupling. */
export interface RunRecordSlotInput {
  slotId: string;
  question: string;
  inputs: string[];
  sufficient: string;
  verdict: 'sufficient' | 'insufficient' | 'not-attempted';
  reason?: string | null;
  text?: string | null;
  attributions?: string[];
}

export interface BuildRunRecordOptions {
  header: RunRecordHeader;
  repositoryCommit?: string | null;
  modelId?: string | null;
  runTimestamp?: string;
  renderDate: string;
  profile: 'strict' | 'review';
  slotResults?: RunRecordSlotInput[];
}

export interface RunRecordSlot {
  slot_id: string;
  question: string;
  inputs: string[];
  sufficient: string;
  verdict: 'sufficient' | 'insufficient' | 'not-attempted';
  reason: string | null;
  produced_text: string | null;
  attributions: string[];
}

export interface RunRecord {
  template_id: string;
  template_version: string;
  repository_commit: string | null;
  model_id: string | null;
  run_timestamp: string;
  render_date: string;
  profile: 'strict' | 'review';
  slots: RunRecordSlot[];
}

export function buildRunRecord(options: BuildRunRecordOptions): RunRecord;
export function serializeRunRecord(record: RunRecord): string;
