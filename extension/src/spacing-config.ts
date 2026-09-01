import * as vscode from 'vscode';
import {
  parseNodeSizePreset,
} from '@transitrix/diagrams/node-size-presets.js';
import type { ChainColumnKey, ChainScope, FgcaScope, Scope } from '@transitrix/diagrams/scope.js';
import { chainScopeActive } from '@transitrix/diagrams/scope.js';
import { sanitizeChainScope, type FGCAPreviewDoc } from '@transitrix/diagrams/fgca/preview-layout.js';
import { parseEdgeStyle, type EdgeStyle } from '@transitrix/diagrams/edge-path.js';
import type { ControlMessage, PreviewView } from './preview-controls.js';

// Per-notation spacing controls. PR1 persists the
// chosen gaps in VS Code configuration (`transitrix.spacing.<notation>.*`),
// mirroring the existing `transitrix.theme` pattern, and re-renders previews
// on change. In-preview live sliders are deferred to PR2.

export type SpacingNotation = 'goals' | 'dgca' | 'dga' | 'action' | 'blocks' | 'processBlueprint';

export interface SpacingGaps {
  /** px gap between columns (horizontal). */
  horizontalGap: number;
  /** px gap between stacked nodes (vertical). */
  verticalGap: number;
}

/** Reads the user's configured spacing for a notation, falling back to the layout defaults. */
export function readSpacing(notation: SpacingNotation, defaults: SpacingGaps): SpacingGaps {
  const cfg = vscode.workspace.getConfiguration('transitrix');
  return {
    horizontalGap: cfg.get<number>(`spacing.${notation}.horizontalGap`, defaults.horizontalGap),
    verticalGap: cfg.get<number>(`spacing.${notation}.verticalGap`, defaults.verticalGap),
  };
}

/** Config section that, when changed, re-renders spacing-aware previews. */
export const SPACING_CONFIG_SECTION = 'transitrix.spacing';

/** Command that opens Settings filtered to the spacing controls. */
export const OPEN_SPACING_SETTINGS_COMMAND = 'transitrixStudio.openSpacingSettings';

// ── Edge curvature ────────────────────────────────────────────
//
// A single per-notation multiplier on the edge control-handle length. Same
// PR1 persistence pattern as spacing: settings-backed, re-rendered on change,
// in-preview slider deferred to the joint enableScripts call.

export type CurvatureNotation = 'goals' | 'dgca' | 'dga' | 'action';

// Must match DEFAULT_EDGE_CURVATURE in @transitrix/diagrams so an unconfigured
// preview is visually unchanged.
const DEFAULT_CURVATURE = 1;

/** Reads the user's configured edge curvature for a notation (default 1 = historical). */
export function readCurvature(notation: CurvatureNotation): number {
  return vscode.workspace.getConfiguration('transitrix').get<number>(`curvature.${notation}`, DEFAULT_CURVATURE);
}

/** Config section that, when changed, re-renders curvature-aware previews. */
export const CURVATURE_CONFIG_SECTION = 'transitrix.curvature';

/** Command that opens Settings filtered to the curvature controls. */
export const OPEN_CURVATURE_SETTINGS_COMMAND = 'transitrixStudio.openCurvatureSettings';

export type EdgeStyleNotation = 'goals' | 'dgca' | 'dga';

/** Reads the persisted arrow path style. Defaults to bezier (historical cubic). */
export function readEdgeStyle(notation: EdgeStyleNotation): EdgeStyle {
  return parseEdgeStyle(vscode.workspace.getConfiguration('transitrix').get<string>(`edgeStyle.${notation}`));
}

export const EDGE_STYLE_CONFIG_SECTION = 'transitrix.edgeStyle';

// Must match DEFAULT_EDGE_CURVATURE so an unconfigured preview is visually unchanged.
const DEFAULT_ENTRY_CURVATURE = 1;

/** Reads the user's configured entry curvature for a notation (default 1 = same as exit). */
export function readEntryCurvature(notation: CurvatureNotation): number {
  return vscode.workspace.getConfiguration('transitrix').get<number>(`entryCurvature.${notation}`, DEFAULT_ENTRY_CURVATURE);
}

/** Config section that, when changed, re-renders curvature-aware previews. */
export const ENTRY_CURVATURE_CONFIG_SECTION = 'transitrix.entryCurvature';

// ── Scope filter ──────────────────────────────────────────────
//
// Trim a preview to a subtree / level cap (Goals) or per-column chain
// filters (DGCA/DGA). Settings-backed; in-preview dropdowns write the same keys.

export type ScopeNotation = 'goals' | 'dgca' | 'dga';
export type ChainScopeNotation = 'dgca' | 'dga';

function trimSetting(v: string | undefined): string {
  return (v ?? '').trim();
}

function isChainNotation(notation: string): notation is ChainScopeNotation {
  return notation === 'dgca' || notation === 'dga';
}

function isChainField(field: string | undefined): field is ChainColumnKey {
  return field === 'driverId' || field === 'goalId' || field === 'changeId' || field === 'activityId';
}

/**
 * Resolves the configured scope for a notation.
 * Goals: a non-empty `rootId` wins over a `maxLevel` cap; both unset → 'all'.
 * DGCA/DGA: per-column chain filters (Driver / Goal / Change / Action).
 * A leftover `rootId` is read as `goalId` when the new goalId setting is empty.
 */
export function readScope(notation: 'goals'): Scope;
export function readScope(notation: ChainScopeNotation): FgcaScope;
export function readScope(notation: ScopeNotation): FgcaScope {
  if (isChainNotation(notation)) {
    const chain = readChainScope(notation);
    return chainScopeActive(chain) ? chain : { mode: 'all' };
  }
  const cfg = vscode.workspace.getConfiguration('transitrix');
  const rootId = trimSetting(cfg.get<string>(`scope.${notation}.rootId`, ''));
  if (rootId) return { mode: 'root', rootGoalId: rootId };
  const maxLevel = cfg.get<number>(`scope.${notation}.maxLevel`, -1);
  if (typeof maxLevel === 'number' && maxLevel >= 0) return { mode: 'level', maxLevel };
  return { mode: 'all' };
}

/** Reads the four DGCA/DGA column filters. Empty strings are omitted. */
export function readChainScope(notation: ChainScopeNotation): ChainScope {
  const cfg = vscode.workspace.getConfiguration('transitrix');
  const driverId = trimSetting(cfg.get<string>(`scope.${notation}.driverId`, ''));
  let goalId = trimSetting(cfg.get<string>(`scope.${notation}.goalId`, ''));
  if (!goalId) goalId = trimSetting(cfg.get<string>(`scope.${notation}.rootId`, ''));
  const changeId = notation === 'dga' ? '' : trimSetting(cfg.get<string>(`scope.${notation}.changeId`, ''));
  const activityId = trimSetting(cfg.get<string>(`scope.${notation}.activityId`, ''));
  return {
    mode: 'chain',
    driverId: driverId || undefined,
    goalId: goalId || undefined,
    changeId: changeId || undefined,
    activityId: activityId || undefined,
  };
}

export type ChainSanitizeContext = {
  doc: FGCAPreviewDoc;
  hideChanges: boolean;
};

async function writeChainScope(
  notation: ChainScopeNotation,
  scope: ChainScope,
  target: vscode.ConfigurationTarget,
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('transitrix');
  await Promise.all([
    cfg.update(`scope.${notation}.driverId`, scope.driverId ?? '', target),
    cfg.update(`scope.${notation}.goalId`, scope.goalId ?? '', target),
    cfg.update(`scope.${notation}.changeId`, notation === 'dga' ? '' : (scope.changeId ?? ''), target),
    cfg.update(`scope.${notation}.activityId`, scope.activityId ?? '', target),
    cfg.update(`scope.${notation}.rootId`, '', target),
    cfg.update(`scope.${notation}.maxLevel`, -1, target),
  ]);
}

/** Config section that, when changed, re-renders scope-aware previews. */
export const SCOPE_CONFIG_SECTION = 'transitrix.scope';

/** Command that opens Settings filtered to the scope controls. */
export const OPEN_SCOPE_SETTINGS_COMMAND = 'transitrixStudio.openScopeSettings';

// ── Tree ↔ table view ────────────────────────────────────────────────────────
//
// DGCA/DGA previews can render as the tree/chain diagram (default) or as a
// flattened chain table. Same settings-backed persistence as the controls
// above: the in-preview toolbar toggle writes `transitrix.view.<notation>` and
// the preview re-renders.

export type ViewNotation = 'dgca' | 'dga';

/** Reads the persisted view for a notation. Defaults to 'tree' (no change). */
export function readView(notation: ViewNotation): PreviewView {
  const v = vscode.workspace.getConfiguration('transitrix').get<string>(`view.${notation}`, 'tree');
  return v === 'table' ? 'table' : 'tree';
}

/** Config section that, when changed, re-renders view-aware previews. */
export const VIEW_CONFIG_SECTION = 'transitrix.view';

export { NODE_SIZE_CONFIG_SECTION, OPEN_NODE_SIZE_SETTINGS_COMMAND } from './node-size-config.js';

// ── In-preview control messages (PR2) ───────────────────────────────────────
//
// The interactive control panel (preview-controls.ts) posts a `ControlMessage`
// on every change. The host writes the matching `transitrix.*` setting here, so
// VS Code configuration stays the single source of truth — the in-preview
// controls and the "…" Settings links edit the same store, and the existing
// `onDidChangeConfiguration` handler re-renders. Writes go to the Global (User)
// target, mirroring how the "…" links land users on User settings.

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Applies one in-preview control change to VS Code configuration for `notation`.
 * Spacing/curvature apply to all four notations; scope only to goals/dgca/dga
 * (the Action panel never renders a scope row).
 *
 * Goals: root and level are mutually exclusive.
 * DGCA/DGA: column filters AND together; `chainSanitize` drops neighbours
 * that the last pick made unreachable so dropdowns stay on one thread.
 */
export async function applyControlMessage(
  notation: SpacingNotation,
  msg: ControlMessage,
  chainSanitize?: ChainSanitizeContext,
): Promise<void> {
  if (!msg || msg.type !== 'transitrix:control') return;
  const cfg = vscode.workspace.getConfiguration('transitrix');
  const target = vscode.ConfigurationTarget.Global;

  if (msg.control === 'spacing' && (msg.field === 'horizontalGap' || msg.field === 'verticalGap')) {
    await cfg.update(`spacing.${notation}.${msg.field}`, clamp(Number(msg.value), 20, 300), target);
    return;
  }
  if (msg.control === 'curvature') {
    await cfg.update(`curvature.${notation}`, clamp(Number(msg.value), 0, 3), target);
    return;
  }
  if (msg.control === 'edgeStyle' && (notation === 'goals' || notation === 'dgca' || notation === 'dga')) {
    await cfg.update(`edgeStyle.${notation}`, parseEdgeStyle(msg.value), target);
    return;
  }
  if (msg.control === 'entryCurvature') {
    await cfg.update(`entryCurvature.${notation}`, clamp(Number(msg.value), 0, 3), target);
    return;
  }
  if (msg.control === 'view' && (notation === 'dgca' || notation === 'dga')) {
    await cfg.update(`view.${notation}`, msg.field === 'table' ? 'table' : 'tree', target);
    return;
  }
  if (msg.control === 'nodeSize') {
    const preset = parseNodeSizePreset(String(msg.value ?? 'normal'));
    await cfg.update(`nodeSize.${notation}`, preset, target);
    return;
  }
  if (msg.control === 'scope' && isChainNotation(notation)) {
    if (msg.field === 'reset') {
      await writeChainScope(notation, { mode: 'chain' }, target);
      return;
    }
    const field: ChainColumnKey | undefined =
      msg.field === 'rootId' ? 'goalId' : isChainField(msg.field) ? msg.field : undefined;
    if (!field) return;
    const next: ChainScope = {
      ...readChainScope(notation),
      [field]: String(msg.value ?? '').trim() || undefined,
    };
    if (notation === 'dga') next.changeId = undefined;
    const cleaned = chainSanitize
      ? sanitizeChainScope(chainSanitize.doc, next, {
          justChanged: field,
          hideChanges: chainSanitize.hideChanges,
        })
      : next;
    await writeChainScope(notation, cleaned, target);
    return;
  }
  if (msg.control === 'scope' && notation !== 'action' && notation !== 'blocks' && notation !== 'processBlueprint') {
    if (msg.field === 'reset') {
      await cfg.update(`scope.${notation}.rootId`, '', target);
      await cfg.update(`scope.${notation}.maxLevel`, -1, target);
    } else if (msg.field === 'rootId') {
      await cfg.update(`scope.${notation}.rootId`, String(msg.value ?? ''), target);
      await cfg.update(`scope.${notation}.maxLevel`, -1, target);
    } else if (msg.field === 'maxLevel') {
      const lv = Number(msg.value);
      await cfg.update(`scope.${notation}.maxLevel`, Number.isFinite(lv) && lv >= 0 ? Math.floor(lv) : -1, target);
      await cfg.update(`scope.${notation}.rootId`, '', target);
    }
  }
}
