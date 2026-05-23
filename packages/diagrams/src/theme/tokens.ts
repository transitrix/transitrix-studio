/** Transitrix brand palette. */
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

/** Fill colors for FGCA notation columns. */
export const LAYER_COLORS = {
  factor:   { light: '#fef3c7', dark: '#292108', hc: '#f59e0b' },
  goal:     { light: '#e0e7ff', dark: '#1e1b4b', hc: '#818cf8' },
  change:   { light: '#dbeafe', dark: '#0c2042', hc: '#60a5fa' },
  activity: { light: '#d4edda', dark: '#0a2414', hc: '#4ade80' },
} as const;

/** Level fill colors for Goals tree nodes — 8 slots, cycled by level index. */
export const LEVEL_COLORS = {
  light: ['#dbeafe', '#e0e7ff', '#d4edda', '#fef3c7', '#fce7f3', '#e0f2fe', '#f3e8ff', '#fef9c3'],
  dark:  ['#0c2042', '#1e1b4b', '#0a2414', '#292108', '#2a0c1f', '#071e2e', '#1a0c33', '#2a2107'],
  hc:    ['#60a5fa', '#818cf8', '#4ade80', '#f59e0b', '#f472b6', '#38bdf8', '#a78bfa', '#facc15'],
} as const;

/** Structural diagram colors (nodes, edges, text). */
export const STRUCTURAL = {
  nodeStroke:    { light: '#94a3b8', dark: '#475569', hc: '#e2e8f0' },
  edgeStroke:    { light: '#94a3b8', dark: '#475569', hc: '#e2e8f0' },
  textPrimary:   { light: '#1e293b', dark: '#f1f5f9', hc: '#ffffff' },
  textSecondary: { light: '#64748b', dark: '#94a3b8', hc: '#cbd5e1' },
  headerText:    { light: '#374151', dark: '#e5e7eb', hc: '#ffffff' },
} as const;

/**
 * Maturity scale fill colors — Likert 1..5, danger→success.
 * Used by Capability Map and any future maturity-based notation.
 */
export const MATURITY_COLORS = {
  light: ['#b91c1c', '#d97706', '#ca8a04', '#65a30d', '#15803d'],
  dark:  ['#7f1d1d', '#92400e', '#854d0e', '#3f6212', '#14532d'],
  hc:    ['#f87171', '#fb923c', '#facc15', '#a3e635', '#4ade80'],
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
} as const;

export function getBaseResetCss(): string {
  return `*,*:before,*:after{box-sizing:border-box;}html,body{margin:0;padding:0;}`;
}
