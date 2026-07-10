/** Transitrix brand palette (`brand/transitrix_brand.md` — canonical). */
export const BRAND = {
  petrol: '#004d67',
  amber:  '#ffaf00',
  orange: '#ff4d00',
} as const;

/** Functional status colors. */
export const FUNCTIONAL = {
  success: '#1a7f5c',
  warning: '#c07030',
  error:   '#b91c1c',
  info:    '#1d6fa8',
} as const;

/**
 * Amber/orange "author emphasis" accents, theme-adjusted for contrast against
 * each theme's background (dark theme gets the brand hues lightened per
 * `brand/transitrix_brand.md` §Themes: "brand colours slightly desaturated
 * for contrast on dark surfaces"). `orangeTint` is the light emphasis-fill
 * paired with an `orange` stroke (e.g. Activities critical-path nodes).
 * `hc` intentionally falls back to the plain BRAND hex — VS Code
 * high-contrast mode prioritises accessibility overrides over brand fidelity.
 */
export const BRAND_EMPHASIS = {
  amber:      { light: BRAND.amber, dark: '#ffc83d', hc: BRAND.amber },
  orange:     { light: BRAND.orange, dark: '#ff7542', hc: BRAND.orange },
  orangeTint: { light: '#ffeee5', dark: '#432114', hc: '#ffeee5' },
} as const;

/**
 * Fill colors for FGCA/DGCA notation columns — a petrol tint per stage
 * (Driver → Goal → Change → Activity), deepening left to right like the
 * Goals-tree level ladder below. Petrol tint = structural position, never a
 * hue switch, per the brand's "structure via petrol" role mapping.
 */
export const LAYER_COLORS = {
  driver:   { light: '#eaf3f6', dark: '#17262c', hc: '#f59e0b' },
  factor:   { light: '#eaf3f6', dark: '#17262c', hc: '#f59e0b' },
  goal:     { light: '#d9ecf2', dark: '#192f37', hc: '#818cf8' },
  change:   { light: '#c7e5ef', dark: '#1a3842', hc: '#60a5fa' },
  activity: { light: '#b4e0ee', dark: '#1a414e', hc: '#4ade80' },
} as const;

/**
 * Level fill colors for Goals tree nodes — 8 slots, cycled by level index.
 * A single-hue petrol tint ramp (level-0 lightest/root → level-7 deepest);
 * hue never switches with depth. Saturation/lightness tuned so text-primary
 * and text-secondary keep at least their pre-brand contrast ratio against
 * every slot — see `theme/__tests__/tokens.test.ts`.
 */
export const LEVEL_COLORS = {
  light: ['#eef4f7', '#e6f1f4', '#dfedf1', '#d7e9ef', '#cee6ed', '#c6e2ec', '#bfe0eb', '#b7deeb'],
  dark:  ['#152328', '#16292f', '#172e36', '#18333d', '#183944', '#183f4c', '#184554', '#174b5c'],
  hc:    ['#60a5fa', '#818cf8', '#4ade80', '#f59e0b', '#f472b6', '#38bdf8', '#a78bfa', '#facc15'],
} as const;

/**
 * Structural diagram colors (nodes, edges, text). nodeStroke/edgeStroke are
 * brand petrol — "structure via petrol" per the brand's role mapping.
 * textPrimary is a dark petrol ink (light theme) / near-white petrol-tinted
 * (dark theme); textSecondary stays a muted grey with a faint petrol lean.
 * `hc` is untouched — VS Code high-contrast accessibility overrides win over
 * brand fidelity there.
 */
export const STRUCTURAL = {
  nodeStroke:    { light: BRAND.petrol, dark: '#53a9c6', hc: '#e2e8f0' },
  edgeStroke:    { light: BRAND.petrol, dark: '#53a9c6', hc: '#e2e8f0' },
  textPrimary:   { light: '#0d2b35', dark: '#edf5f8', hc: '#ffffff' },
  textSecondary: { light: '#516970', dark: '#adc8d1', hc: '#cbd5e1' },
  headerText:    { light: '#0d2b35', dark: '#edf5f8', hc: '#ffffff' },
} as const;

/**
 * Maturity scale fill colors — Likert 1..5, danger→success. A single
 * harmonious ramp: consistent saturation curve, hue stepping smoothly
 * red→orange→gold→yellow-green→green (never jumping registers the way the
 * previous per-theme picks did), tuned so the badge's hardcoded white label
 * text (`.maturity-pill`, capability-map-preview.ts) stays ≥4.5:1 AA at
 * every step. Same ramp for light/dark — these are small solid badges, not
 * background tints, so theme brightness doesn't change the contrast need.
 * `hc` pushes the same hues darker/more saturated for AAA (≥7:1), since VS
 * Code high-contrast mode exists specifically to demand stronger contrast.
 * Used by Capability Map and any future maturity-based notation.
 */
export const MATURITY_COLORS = {
  light: ['#bf2518', '#b05911', '#8d7011', '#407d21', '#237b48'],
  dark:  ['#bf2518', '#b05911', '#8d7011', '#407d21', '#237b48'],
  hc:    ['#a0190d', '#864109', '#5a4607', '#316317', '#155630'],
} as const;

/**
 * Capability tree node fill colors, grouped by depth band — a 3-step petrol
 * tint (shallow → deep), same "petrol tint = structural depth" rule as
 * LEVEL_COLORS above. Previously a DSM-matching pink/yellow/blue scheme;
 * brand/transitrix_brand.md ("Components") anticipates DSM adopting the same
 * shared color tokens, so Studio moving first is convergence, not drift.
 *   band0: depth 0–2 (shallowest)
 *   band1: depth 3–4
 *   band2: depth 5+  (deepest)
 */
export const TREE_LEVEL_COLORS = {
  band0: { light: '#e6f1f4', dark: '#152b32', hc: '#ff9999' },
  band1: { light: '#d0e9f1', dark: '#153b47', hc: '#ffff88' },
  band2: { light: '#b5e3f2', dark: '#114c5f', hc: '#66ccff' },
} as const;

/**
 * Maturity badge fills for the capability tree (L1–L5). Same ramp as
 * MATURITY_COLORS — previously a separate DSM-matching pink/yellow/blue set
 * that didn't even share L1's meaning (grey = lowest maturity, an odd
 * "no signal" hue for the worst rating) and had white-label contrast as low
 * as 1.07:1 in `hc`. One harmonious Likert ramp for "maturity" everywhere.
 */
export const TREE_MATURITY_COLORS = {
  light: MATURITY_COLORS.light,
  dark:  MATURITY_COLORS.dark,
  hc:    MATURITY_COLORS.hc,
} as const;

/**
 * Typography hierarchy. All previews resolve text styling from these roles
 * — never from inline font-* attributes on individual <text> elements.
 *
 * fontFamily threads through the VS Code font setting so the preview reads
 * as part of the editor; size + weight encode the visual hierarchy.
 */
export const TYPOGRAPHY = {
  fontFamily: 'var(--vscode-font-family, system-ui, -apple-system, sans-serif)',
  sizes: {
    header:    13,  // stage/column headers, diagram captions
    primary:   12,  // primary node/cell labels
    secondary: 11,  // annotations, secondary lines, meta
    id:        10,  // compact id/code chips
    pill:      11,  // pill labels (process-blueprint aspects, badges)
    caption:   11,  // figcaption under the canvas
  },
  weights: {
    header:    700,
    primary:   600,
    secondary: 400,
    id:        600,
    pill:      500,
    caption:   400,
  },
} as const;

/** Adaptive shell tokens (background, text, border, status). */
export interface AdaptiveTokens {
  bg:               string;
  bgSurface:        string;
  bgElevated:       string;
  text:             string;
  textMuted:        string;
  textInverse:      string;
  border:           string;
  divider:          string;
  statusSuccessBg:  string;
  statusSuccessFg:  string;
  statusWarningBg:  string;
  statusWarningFg:  string;
  statusInfoBg:     string;
  statusInfoFg:     string;
  statusErrorBg:    string;
  statusErrorFg:    string;
}

/** CSS custom property names for --ts-* variables. */
export const CSS_VAR = {
  bg:               '--ts-bg',
  bgSurface:        '--ts-bg-surface',
  bgElevated:       '--ts-bg-elevated',
  text:             '--ts-text',
  textMuted:        '--ts-text-muted',
  textInverse:      '--ts-text-inverse',
  border:           '--ts-border',
  divider:          '--ts-divider',
  statusSuccessBg:  '--ts-status-success-bg',
  statusSuccessFg:  '--ts-status-success-fg',
  statusWarningBg:  '--ts-status-warning-bg',
  statusWarningFg:  '--ts-status-warning-fg',
  statusInfoBg:     '--ts-status-info-bg',
  statusInfoFg:     '--ts-status-info-fg',
  statusErrorBg:    '--ts-status-error-bg',
  statusErrorFg:    '--ts-status-error-fg',
  layerDriver:      '--ts-layer-driver',
  layerFactor:      '--ts-layer-factor',
  layerGoal:        '--ts-layer-goal',
  layerChange:      '--ts-layer-change',
  layerActivity:    '--ts-layer-activity',
  nodeStroke:       '--ts-node-stroke',
  edgeStroke:       '--ts-edge-stroke',
  textPrimary:      '--ts-text-primary',
  textSecondary:    '--ts-text-secondary',
  headerText:       '--ts-header-text',
  maturity1:        '--ts-maturity-1',
  maturity2:        '--ts-maturity-2',
  maturity3:        '--ts-maturity-3',
  maturity4:        '--ts-maturity-4',
  maturity5:        '--ts-maturity-5',
  treeLevel0:       '--ts-tree-level-0',
  treeLevel1:       '--ts-tree-level-1',
  treeLevel2:       '--ts-tree-level-2',
  treeMaturity1:    '--ts-tree-maturity-1',
  treeMaturity2:    '--ts-tree-maturity-2',
  treeMaturity3:    '--ts-tree-maturity-3',
  treeMaturity4:    '--ts-tree-maturity-4',
  treeMaturity5:    '--ts-tree-maturity-5',
  brandAmber:       '--ts-brand-amber',
  brandOrange:      '--ts-brand-orange',
  brandOrangeTint:  '--ts-brand-orange-tint',
} as const;

export function getBaseResetCss(): string {
  return `*,*:before,*:after{box-sizing:border-box;}html,body{margin:0;padding:0;}`;
}
