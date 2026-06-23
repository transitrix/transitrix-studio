import {
  LAYER_COLORS,
  LEVEL_COLORS,
  MATURITY_COLORS,
  STRUCTURAL,
  TYPOGRAPHY,
  CSS_VAR,
  getBaseResetCss,
  type AdaptiveTokens,
} from './tokens.js';

export type ThemeId = 'transitrix' | 'transitrix-dark' | 'vscode-adaptive';

const TRANSITRIX_LIGHT: AdaptiveTokens = {
  bg:              '#ffffff',
  bgSurface:       '#f8fafc',
  bgElevated:      '#f1f5f9',
  text:            '#0f172a',
  textMuted:       '#64748b',
  textInverse:     '#ffffff',
  border:          '#e2e8f0',
  divider:         '#cbd5e1',
  statusSuccessBg: '#d1fae5',
  statusSuccessFg: '#065f46',
  statusWarningBg: '#fef9c3',
  statusWarningFg: '#854d0e',
  statusInfoBg:    '#e0f2fe',
  statusInfoFg:    '#0c4a6e',
  statusErrorBg:   '#fee2e2',
  statusErrorFg:   '#991b1b',
};

const TRANSITRIX_DARK: AdaptiveTokens = {
  bg:              '#0a1628',
  bgSurface:       '#0f1f3d',
  bgElevated:      '#162544',
  text:            '#f1f5f9',
  textMuted:       '#94a3b8',
  textInverse:     '#0f172a',
  border:          '#1e3a5f',
  divider:         '#1a3050',
  statusSuccessBg: '#022c22',
  statusSuccessFg: '#6ee7b7',
  statusWarningBg: '#1e1500',
  statusWarningFg: '#fcd34d',
  statusInfoBg:    '#071e2e',
  statusInfoFg:    '#7dd3fc',
  statusErrorBg:   '#2c0a0a',
  statusErrorFg:   '#fca5a5',
};

function adaptiveVars(t: AdaptiveTokens): string {
  return [
    `${CSS_VAR.bg}:${t.bg}`,
    `${CSS_VAR.bgSurface}:${t.bgSurface}`,
    `${CSS_VAR.bgElevated}:${t.bgElevated}`,
    `${CSS_VAR.text}:${t.text}`,
    `${CSS_VAR.textMuted}:${t.textMuted}`,
    `${CSS_VAR.textInverse}:${t.textInverse}`,
    `${CSS_VAR.border}:${t.border}`,
    `${CSS_VAR.divider}:${t.divider}`,
    `${CSS_VAR.statusSuccessBg}:${t.statusSuccessBg}`,
    `${CSS_VAR.statusSuccessFg}:${t.statusSuccessFg}`,
    `${CSS_VAR.statusWarningBg}:${t.statusWarningBg}`,
    `${CSS_VAR.statusWarningFg}:${t.statusWarningFg}`,
    `${CSS_VAR.statusInfoBg}:${t.statusInfoBg}`,
    `${CSS_VAR.statusInfoFg}:${t.statusInfoFg}`,
    `${CSS_VAR.statusErrorBg}:${t.statusErrorBg}`,
    `${CSS_VAR.statusErrorFg}:${t.statusErrorFg}`,
  ].join(';') + ';';
}

function diagramVars(variant: 'light' | 'dark' | 'hc'): string {
  const lc = LAYER_COLORS;
  const sc = STRUCTURAL;
  const lv = LEVEL_COLORS[variant];
  const mat = MATURITY_COLORS[variant];
  const levelVars = lv.map((c, i) => `--ts-level-${i}:${c}`).join(';') + ';';
  return [
    `${CSS_VAR.layerDriver}:${lc.driver[variant]}`,
    `${CSS_VAR.layerFactor}:${lc.factor[variant]}`,
    `${CSS_VAR.layerGoal}:${lc.goal[variant]}`,
    `${CSS_VAR.layerChange}:${lc.change[variant]}`,
    `${CSS_VAR.layerActivity}:${lc.activity[variant]}`,
    `${CSS_VAR.nodeStroke}:${sc.nodeStroke[variant]}`,
    `${CSS_VAR.edgeStroke}:${sc.edgeStroke[variant]}`,
    `${CSS_VAR.textPrimary}:${sc.textPrimary[variant]}`,
    `${CSS_VAR.textSecondary}:${sc.textSecondary[variant]}`,
    `${CSS_VAR.headerText}:${sc.headerText[variant]}`,
    `${CSS_VAR.maturity1}:${mat[0]}`,
    `${CSS_VAR.maturity2}:${mat[1]}`,
    `${CSS_VAR.maturity3}:${mat[2]}`,
    `${CSS_VAR.maturity4}:${mat[3]}`,
    `${CSS_VAR.maturity5}:${mat[4]}`,
  ].join(';') + ';' + levelVars;
}

/** CSS for the webview shell (toolbar, canvas). */
function shellCss(): string {
  const cv = CSS_VAR;
  const t = TYPOGRAPHY;
  // Full-height flex chain lifted from blocks-preview / activities-preview
  // into the shared shell (per strategy hub #35). Body is a flex column
  // sized to the iframe; #canvas takes the remaining height with its own
  // scroll region. Without this, #canvas was content-height and any
  // overflow-x scrollbar landed mid-panel with empty space below it — the
  // "two-page" split flagged on goals, activities, and others.
  //
  // html bg + min-height are set per-theme in generateWebviewCss (literal
  // hex / VS Code var) so they don't depend on `--ts-bg` resolving on html —
  // CSS custom properties only cascade DOWN, and `--ts-bg` is defined on the
  // body[data-theme] selector, so html itself can't read it. Without that
  // explicit html bg, the iframe's underlying VS Code editor background
  // showed through any uncovered area below short diagrams.
  return `html,body{height:100%;}
body{background:var(${cv.bg});color:var(${cv.text});display:flex;flex-direction:column;}
#toolbar{position:sticky;top:0;z-index:10;padding:6px 12px;border-bottom:1px solid var(${cv.border});font-family:${t.fontFamily};font-size:${t.sizes.secondary}px;color:var(${cv.textMuted});background:var(${cv.bg});flex-shrink:0;}
#canvas{flex:1;min-height:0;padding:16px;overflow:auto;}
svg{display:block;}`;
}

/** CSS for SVG diagram classes — all consume --ts-* variables. */
function diagramClassCss(): string {
  const cv = CSS_VAR;
  const t = TYPOGRAPHY;
  const levelCount = LEVEL_COLORS.light.length;
  const levelRules = Array.from({ length: levelCount }, (_, i) =>
    `.level-${i}{fill:var(--ts-level-${i});}`
  ).join('');
  // Typography: every <text> in a preview SVG resolves font-family, size and
  // weight from these classes instead of inline attributes. That is the
  // contract every notation preview honours so the catalogue reads as one
  // visual family.
  return `.diagram-node{stroke:var(${cv.nodeStroke});stroke-width:1;}
.layer-driver{fill:var(${cv.layerDriver});}
.layer-factor{fill:var(${cv.layerFactor});}
.layer-goal{fill:var(${cv.layerGoal});}
.layer-change{fill:var(${cv.layerChange});}
.layer-activity{fill:var(${cv.layerActivity});}
${levelRules}
.diagram-edge{stroke:var(${cv.edgeStroke});stroke-width:1.5;fill:none;}
.arrow-fill{fill:var(${cv.edgeStroke});}
.text-header{fill:var(${cv.headerText});font-family:${t.fontFamily};font-size:${t.sizes.header}px;font-weight:${t.weights.header};dominant-baseline:central;}
.text-primary{fill:var(${cv.textPrimary});font-family:${t.fontFamily};font-size:${t.sizes.primary}px;font-weight:${t.weights.primary};dominant-baseline:central;}
.text-secondary{fill:var(${cv.textSecondary});font-family:${t.fontFamily};font-size:${t.sizes.secondary}px;font-weight:${t.weights.secondary};dominant-baseline:central;}
.text-id{fill:var(${cv.textSecondary});font-family:${t.fontFamily};font-size:${t.sizes.id}px;font-weight:${t.weights.id};dominant-baseline:central;}
.text-pill{fill:var(${cv.textPrimary});font-family:${t.fontFamily};font-size:${t.sizes.pill}px;font-weight:${t.weights.pill};dominant-baseline:central;}
.maturity-1{fill:var(${cv.maturity1});}
.maturity-2{fill:var(${cv.maturity2});}
.maturity-3{fill:var(${cv.maturity3});}
.maturity-4{fill:var(${cv.maturity4});}
.maturity-5{fill:var(${cv.maturity5});}
.compliance-gap{fill:var(${cv.statusWarningBg});stroke:var(${cv.statusWarningFg});}
.compliance-gap text{fill:var(${cv.statusWarningFg});}
.compliance-deadline{fill:var(${cv.statusErrorBg});stroke:var(${cv.statusErrorFg});}
.compliance-deadline text{fill:var(${cv.statusErrorFg});}
.compliance-badge{fill:var(${cv.statusErrorFg});}
.compliance-badge-text{fill:var(${cv.textInverse});font-family:${t.fontFamily};font-size:8px;font-weight:700;}`;
}

/**
 * Generates a self-contained CSS block for embedding inside a standalone SVG file.
 * Defines all --ts-* custom properties on :root so diagram classes resolve correctly
 * when the SVG is opened outside of VS Code.
 * vscode-adaptive falls back to the light palette (runtime VS Code variables are unavailable).
 */
export function generateSvgEmbedCss(themeId: ThemeId): string {
  const variant = themeId === 'transitrix-dark' ? 'dark' : 'light';
  const adaptive = themeId === 'transitrix-dark' ? TRANSITRIX_DARK : TRANSITRIX_LIGHT;
  return `:root{${adaptiveVars(adaptive)}${diagramVars(variant)}}${diagramClassCss()}`;
}

/**
 * Generates complete CSS for a static SVG diagram webview.
 *
 * For transitrix/transitrix-dark: sets --ts-* vars with fixed brand colors.
 * For vscode-adaptive: maps --ts-* vars to --vscode-* CSS vars, with
 * body.vscode-dark / body.vscode-high-contrast overrides for diagram colors.
 */
export function generateWebviewCss(themeId: ThemeId): string {
  const base = getBaseResetCss();
  const shell = shellCss();
  const classes = diagramClassCss();

  if (themeId === 'transitrix') {
    return `${base}
html{background:${TRANSITRIX_LIGHT.bg};min-height:100vh;}
body[data-theme="transitrix"]{${adaptiveVars(TRANSITRIX_LIGHT)}${diagramVars('light')}}
${shell}
${classes}`;
  }

  if (themeId === 'transitrix-dark') {
    return `${base}
html{background:${TRANSITRIX_DARK.bg};min-height:100vh;}
body[data-theme="transitrix-dark"]{${adaptiveVars(TRANSITRIX_DARK)}${diagramVars('dark')}}
${shell}
${classes}`;
  }

  // vscode-adaptive: map --ts-shell vars to --vscode-* CSS variables;
  // layer/level/structural colors follow the VS Code theme body class.
  const cv = CSS_VAR;
  return `${base}
html{background:var(--vscode-editor-background,${TRANSITRIX_LIGHT.bg});min-height:100vh;}
body[data-theme="vscode-adaptive"]{
  ${cv.bg}:var(--vscode-editor-background);
  ${cv.bgSurface}:var(--vscode-sideBar-background,var(--vscode-editor-background));
  ${cv.bgElevated}:var(--vscode-editorHoverWidget-background,var(--vscode-editor-background));
  ${cv.text}:var(--vscode-foreground);
  ${cv.textMuted}:var(--vscode-descriptionForeground);
  ${cv.textInverse}:var(--vscode-editor-background);
  ${cv.border}:var(--vscode-panel-border);
  ${cv.divider}:var(--vscode-panel-border);
  ${cv.statusSuccessBg}:${TRANSITRIX_LIGHT.statusSuccessBg};
  ${cv.statusSuccessFg}:${TRANSITRIX_LIGHT.statusSuccessFg};
  ${cv.statusWarningBg}:${TRANSITRIX_LIGHT.statusWarningBg};
  ${cv.statusWarningFg}:${TRANSITRIX_LIGHT.statusWarningFg};
  ${cv.statusInfoBg}:${TRANSITRIX_LIGHT.statusInfoBg};
  ${cv.statusInfoFg}:${TRANSITRIX_LIGHT.statusInfoFg};
  ${cv.statusErrorBg}:${TRANSITRIX_LIGHT.statusErrorBg};
  ${cv.statusErrorFg}:${TRANSITRIX_LIGHT.statusErrorFg};
  ${diagramVars('light')}
}
body[data-theme="vscode-adaptive"].vscode-dark{
  ${cv.statusSuccessBg}:${TRANSITRIX_DARK.statusSuccessBg};
  ${cv.statusSuccessFg}:${TRANSITRIX_DARK.statusSuccessFg};
  ${cv.statusWarningBg}:${TRANSITRIX_DARK.statusWarningBg};
  ${cv.statusWarningFg}:${TRANSITRIX_DARK.statusWarningFg};
  ${cv.statusInfoBg}:${TRANSITRIX_DARK.statusInfoBg};
  ${cv.statusInfoFg}:${TRANSITRIX_DARK.statusInfoFg};
  ${cv.statusErrorBg}:${TRANSITRIX_DARK.statusErrorBg};
  ${cv.statusErrorFg}:${TRANSITRIX_DARK.statusErrorFg};
  ${diagramVars('dark')}
}
body[data-theme="vscode-adaptive"].vscode-high-contrast{${diagramVars('hc')}}
${shell}
${classes}`;
}
