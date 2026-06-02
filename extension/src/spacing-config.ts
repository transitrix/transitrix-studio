import * as vscode from 'vscode';
import type { Scope } from '../../packages/diagrams/src/scope.js';
import type { ControlMessage } from './preview-controls.js';

// Per-notation spacing controls (vkgeorgia/strategy#75). PR1 persists the
// chosen gaps in VS Code configuration (`transitrix.spacing.<notation>.*`),
// mirroring the existing `transitrix.theme` pattern, and re-renders previews
// on change. In-preview live sliders are deferred to PR2.

export type SpacingNotation = 'goals' | 'fgca' | 'fga' | 'activities';

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

// ── Edge curvature (vkgeorgia/strategy#76) ──────────────────────────────────
//
// A single per-notation multiplier on the edge control-handle length. Same
// PR1 persistence pattern as spacing: settings-backed, re-rendered on change,
// in-preview slider deferred to the joint enableScripts call.

export type CurvatureNotation = 'goals' | 'fgca' | 'fga' | 'activities';

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

// ── Scope filter (vkgeorgia/strategy#77) ────────────────────────────────────
//
// Trim a preview to a subtree root or a level cap. Same PR1 persistence
// pattern as spacing: settings-backed, re-rendered on change. The in-preview
// root-picker dropdown is deferred to the joint enableScripts PR2.

export type ScopeNotation = 'goals' | 'fgca' | 'fga';

/**
 * Resolves the configured scope for a notation. A non-empty `rootId` wins over
 * a `maxLevel` cap (the two settings model the "only one mode active at a time"
 * rule from #77); both unset → 'all'.
 */
export function readScope(notation: ScopeNotation): Scope {
  const cfg = vscode.workspace.getConfiguration('transitrix');
  const rootId = (cfg.get<string>(`scope.${notation}.rootId`, '') ?? '').trim();
  if (rootId) return { mode: 'root', rootGoalId: rootId };
  const maxLevel = cfg.get<number>(`scope.${notation}.maxLevel`, -1);
  if (typeof maxLevel === 'number' && maxLevel >= 0) return { mode: 'level', maxLevel };
  return { mode: 'all' };
}

/** Config section that, when changed, re-renders scope-aware previews. */
export const SCOPE_CONFIG_SECTION = 'transitrix.scope';

/** Command that opens Settings filtered to the scope controls. */
export const OPEN_SCOPE_SETTINGS_COMMAND = 'transitrixStudio.openScopeSettings';

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
 * Spacing/curvature apply to all four notations; scope only to goals/fgca/fga
 * (the Activities panel never renders a scope row). Scope is mutually exclusive
 * — setting a root clears the level cap and vice-versa, matching `readScope`'s
 * "one mode at a time" precedence and #77's AC.
 */
export async function applyControlMessage(notation: SpacingNotation, msg: ControlMessage): Promise<void> {
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
  if (msg.control === 'scope' && notation !== 'activities') {
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
