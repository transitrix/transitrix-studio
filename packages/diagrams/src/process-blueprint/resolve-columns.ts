/**
 * Render-time resolution of Process Blueprint column headers and the
 * compliance-lane join key.
 *
 * A `PROCESS-…` column is the process: `name` / `goal` / `result` come from
 * the child PROCESS element (ELEMENT_PRIMITIVES §7.5), never from restated
 * view fields. A `STAGE-…` column keeps the authored sketch copy.
 *
 * Pure: no I/O. The host (VS Code preview, JCEF, CLI) already owns loading
 * canon/elements/** — this module only knows how to pick PROCESS / STEP
 * records out of that pool.
 *
 * This is a read model, never storage. Callers render an ephemeral display
 * copy and must never serialise it back onto the view.
 */

import type { Stage } from './types.js';

const PROCESS_ID_RE = /^PROCESS(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const STAGE_ID_RE = /^STAGE(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;

export function isProcessColumnId(id: string): boolean {
  return PROCESS_ID_RE.test(id);
}

export function isStageColumnId(id: string): boolean {
  return STAGE_ID_RE.test(id);
}

/** Display fields taken from a `notation: process` element. */
export interface ProcessColumnRecord {
  name: string;
  goal?: string;
  result?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function optionalString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * Collect admitted PROCESS elements from a raw canon/elements/** doc pool,
 * keyed by id. Malformed documents are skipped.
 */
export function collectProcessColumnRecords(docs: readonly unknown[]): Map<string, ProcessColumnRecord> {
  const out = new Map<string, ProcessColumnRecord>();
  for (const doc of docs) {
    if (!isRecord(doc)) continue;
    if (doc['notation'] !== 'process') continue;
    const id = optionalString(doc['id']);
    if (!id || !isProcessColumnId(id)) continue;
    const name = optionalString(doc['name']);
    if (!name) continue;
    const rec: ProcessColumnRecord = { name };
    const goal = optionalString(doc['goal']);
    const result = optionalString(doc['result']);
    if (goal) rec.goal = goal;
    if (result) rec.result = result;
    out.set(id, rec);
  }
  return out;
}

/**
 * Map each STEP id onto the PROCESS that contains it — either inline in
 * `PROCESS.flow.steps[]` or a promoted `{ notation: step, process }` element.
 * First writer wins; a later duplicate is ignored.
 */
export function collectStepHomeProcess(docs: readonly unknown[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const doc of docs) {
    if (!isRecord(doc)) continue;
    if (doc['notation'] === 'process') {
      const processId = optionalString(doc['id']);
      if (!processId || !isProcessColumnId(processId)) continue;
      const flow = isRecord(doc['flow']) ? doc['flow'] : undefined;
      const steps = flow && Array.isArray(flow['steps']) ? flow['steps'] : [];
      for (const step of steps) {
        if (!isRecord(step)) continue;
        const stepId = optionalString(step['id']);
        if (!stepId || out.has(stepId)) continue;
        out.set(stepId, processId);
      }
      continue;
    }
    if (doc['notation'] === 'step') {
      const stepId = optionalString(doc['id']);
      const processId = optionalString(doc['process']);
      if (!stepId || !processId || !isProcessColumnId(processId)) continue;
      if (!out.has(stepId)) out.set(stepId, processId);
    }
  }
  return out;
}

/**
 * Display copy for one column. PROCESS- columns ignore any restated view
 * fields; missing catalogue falls back to the id (header) and empty
 * goal/result. STAGE- columns keep authored name/goal/result.
 */
export function resolveColumnDisplay(
  stage: Stage,
  catalog?: ReadonlyMap<string, ProcessColumnRecord>,
): { name: string; goal: string; result: string } {
  const id = typeof stage.id === 'string' ? stage.id.trim() : '';
  if (isProcessColumnId(id)) {
    const rec = catalog?.get(id);
    return {
      name: rec?.name ?? id,
      goal: rec?.goal ?? '',
      result: rec?.result ?? '',
    };
  }
  return {
    name: typeof stage.name === 'string' ? stage.name : '',
    goal: typeof stage.goal === 'string' ? stage.goal : '',
    result: typeof stage.result === 'string' ? stage.result : '',
  };
}

/**
 * Column indexes a `realised_via` token pins on this blueprint.
 *
 * `STAGE-…` is never a join key (ASSERT-004). A `PROCESS-…` token pins that
 * column. A STEP whose home process is a column pins that column.
 */
export function columnIndexesForRealisedVia(
  ref: string,
  stageIndexById: ReadonlyMap<string, number>,
  stepHomeProcess?: ReadonlyMap<string, string>,
): number[] {
  const token = ref.trim();
  if (token.length === 0) return [];
  if (isStageColumnId(token)) return [];
  const direct = stageIndexById.get(token);
  if (direct !== undefined && isProcessColumnId(token)) return [direct];
  const home = stepHomeProcess?.get(token);
  if (home && isProcessColumnId(home)) {
    const idx = stageIndexById.get(home);
    if (idx !== undefined) return [idx];
  }
  return [];
}
