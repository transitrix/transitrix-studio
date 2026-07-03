/**
 * Theme tokens for GoalTreeView — replaces DSM's Redux selectors
 * (selectDiagramParams, selectGoalLevelColors) with a plain prop. Hosts
 * that already carry Transitrix's --ts-* CSS custom properties (Studio)
 * can pass those through; hosts with their own theme store (DSM) map
 * their own values onto this shape.
 */
export interface ThemeTokens {
  /** Card fill colour per goal level (0..7). Falls back to DEFAULT_GOAL_LEVEL_COLORS for missing levels. */
  goalLevelColors?: Record<number, string>;
  cardBorderColor?: string;
  cardBorderWidth?: number;
  cardTextColor?: string;
  cardMetaColor?: string;
  edgeColor?: string;
  edgeWidth?: number;
  /** Border colour a card takes on while it's a highlighted drop target during drag. */
  dropTargetBorderColor?: string;
}

export const DEFAULT_GOAL_LEVEL_COLORS: Record<number, string> = {
  0: '#e0e7ff',
  1: '#c7d2fe',
  2: '#a5b4fc',
  3: '#93c5fd',
  4: '#bae6fd',
  5: '#bbf7d0',
  6: '#fef08a',
  7: '#fed7aa',
};

export const DEFAULT_THEME: Required<ThemeTokens> = {
  goalLevelColors: DEFAULT_GOAL_LEVEL_COLORS,
  cardBorderColor: '#94a3b8',
  cardBorderWidth: 1,
  cardTextColor: '#0f172a',
  cardMetaColor: '#64748b',
  edgeColor: '#94a3b8',
  edgeWidth: 1.5,
  dropTargetBorderColor: '#2563eb',
};

export function resolveTheme(theme?: ThemeTokens): Required<ThemeTokens> {
  return {
    goalLevelColors: theme?.goalLevelColors ?? DEFAULT_THEME.goalLevelColors,
    cardBorderColor: theme?.cardBorderColor ?? DEFAULT_THEME.cardBorderColor,
    cardBorderWidth: theme?.cardBorderWidth ?? DEFAULT_THEME.cardBorderWidth,
    cardTextColor: theme?.cardTextColor ?? DEFAULT_THEME.cardTextColor,
    cardMetaColor: theme?.cardMetaColor ?? DEFAULT_THEME.cardMetaColor,
    edgeColor: theme?.edgeColor ?? DEFAULT_THEME.edgeColor,
    edgeWidth: theme?.edgeWidth ?? DEFAULT_THEME.edgeWidth,
    dropTargetBorderColor: theme?.dropTargetBorderColor ?? DEFAULT_THEME.dropTargetBorderColor,
  };
}
