import * as vscode from 'vscode';

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
