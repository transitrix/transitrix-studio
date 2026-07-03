/** Theme tokens for CapabilityMapView — same host-agnostic-prop pattern as
 *  the goals module's ThemeTokens (see ../goals/theme.ts). */
export interface ThemeTokens {
  cardFill?: string;
  cardBorderColor?: string;
  cardBorderWidth?: number;
  cardTextColor?: string;
  cardMetaColor?: string;
  edgeColor?: string;
  edgeWidth?: number;
  dropTargetBorderColor?: string;
  rootFill?: string;
  rootTextColor?: string;
}

/** Default 1..5 maturity-dot colour scale — overridable via the
 *  `maturityColours` prop (spec §6.2), which is separate from ThemeTokens
 *  since it's keyed by maturity level, not a fixed named token. */
export const DEFAULT_MATURITY_COLOURS: Record<number, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#eab308',
  4: '#84cc16',
  5: '#22c55e',
};

export const DEFAULT_THEME: Required<ThemeTokens> = {
  cardFill: '#eff6ff',
  cardBorderColor: '#94a3b8',
  cardBorderWidth: 1,
  cardTextColor: '#0f172a',
  cardMetaColor: '#64748b',
  edgeColor: '#94a3b8',
  edgeWidth: 1.5,
  dropTargetBorderColor: '#2563eb',
  rootFill: '#e2e8f0',
  rootTextColor: '#0f172a',
};

export function resolveTheme(theme?: ThemeTokens): Required<ThemeTokens> {
  return {
    cardFill: theme?.cardFill ?? DEFAULT_THEME.cardFill,
    cardBorderColor: theme?.cardBorderColor ?? DEFAULT_THEME.cardBorderColor,
    cardBorderWidth: theme?.cardBorderWidth ?? DEFAULT_THEME.cardBorderWidth,
    cardTextColor: theme?.cardTextColor ?? DEFAULT_THEME.cardTextColor,
    cardMetaColor: theme?.cardMetaColor ?? DEFAULT_THEME.cardMetaColor,
    edgeColor: theme?.edgeColor ?? DEFAULT_THEME.edgeColor,
    edgeWidth: theme?.edgeWidth ?? DEFAULT_THEME.edgeWidth,
    dropTargetBorderColor: theme?.dropTargetBorderColor ?? DEFAULT_THEME.dropTargetBorderColor,
    rootFill: theme?.rootFill ?? DEFAULT_THEME.rootFill,
    rootTextColor: theme?.rootTextColor ?? DEFAULT_THEME.rootTextColor,
  };
}
