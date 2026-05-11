import {
  LAYER_COLORS,
  LEVEL_COLORS,
  STRUCTURAL,
  CSS_VAR,
  getBaseResetCss,
  type AdaptiveTokens,
} from './tokens.js';

export type ThemeId = 'transitrix' | 'transitrix-dark' | 'vscode-adaptive';

const TRANSITRIX_LIGHT: AdaptiveTokens = {
  bg:          '#ffffff',
  bgSurface:   '#f8fafc',
  bgElevated:  '#f1f5f9',
  text:        '#0f172a',
  textMuted:   '#64748b',
  textInverse: '#ffffff',
  border:      '#e2e8f0',
  divider:     '#cbd5e1',
};

const TRANSITRIX_DARK: AdaptiveTokens = {
  bg:          '#0a1628',
  bgSurface:   '#0f1f3d',
  bgElevated:  '#162544',
  text:        '#f1f5f9',
  textMuted:   '#94a3b8',
  textInverse: '#0f172a',
  border:      '#1e3a5f',
  divider:     '#1a3050',
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
  ].join(';') + ';';
}

function diagramVars(variant: 'light' | 'dark' | 'hc'): string {
  const lc = LAYER_COLORS;
  const sc = STRUCTURAL;
  const lv = LEVEL_COLORS[variant];
  const levelVars = lv.map((c, i) => `--ts-level-${i}:${c}`).join(';') + ';';
  return [
    `${CSS_VAR.layerFactor}:${lc.factor[variant]}`,
    `${CSS_VAR.layerGoal}:${lc.goal[variant]}`,
    `${CSS_VAR.layerChange}:${lc.change[variant]}`,
    `${CSS_VAR.layerActivity}:${lc.activity[variant]}`,
    `${CSS_VAR.nodeStroke}:${sc.nodeStroke[variant]}`,
    `${CSS_VAR.edgeStroke}:${sc.edgeStroke[variant]}`,
    `${CSS_VAR.textPrimary}:${sc.textPrimary[variant]}`,
    `${CSS_VAR.textSecondary}:${sc.textSecondary[variant]}`,
    `${CSS_VAR.headerText}:${sc.headerText[variant]}`,
  ].join(';') + ';' + levelVars;
}

/** CSS for the webview shell (toolbar, canvas, caption). */
function shellCss(): string {
  const cv = CSS_VAR;
  return `html,body{background:var(${cv.bg});color:var(${cv.text});}
#toolbar{position:sticky;top:0;z-index:10;padding:6px 12px;border-bottom:1px solid var(${cv.border});font-family:var(--vscode-font-family,system-ui,sans-serif);font-size:12px;color:var(${cv.textMuted});background:var(${cv.bg});}
#canvas{padding:16px;overflow:auto;}
svg{display:block;}
.diagram-caption{margin-top:8px;font-family:var(--vscode-font-family,system-ui,sans-serif);font-size:11px;color:var(${cv.textMuted});text-align:center;}`;
}

/** CSS for SVG diagram classes — all consume --ts-* variables. */
function diagramClassCss(): string {
  const cv = CSS_VAR;
  const levelCount = LEVEL_COLORS.light.length;
  const levelRules = Array.from({ length: levelCount }, (_, i) =>
    `.level-${i}{fill:var(--ts-level-${i});}`
  ).join('');
  return `.diagram-node{stroke:var(${cv.nodeStroke});stroke-width:1;}
.layer-factor{fill:var(${cv.layerFactor});}
.layer-goal{fill:var(${cv.layerGoal});}
.layer-change{fill:var(${cv.layerChange});}
.layer-activity{fill:var(${cv.layerActivity});}
${levelRules}
.diagram-edge{stroke:var(${cv.edgeStroke});stroke-width:1.5;fill:none;}
.arrow-fill{fill:var(${cv.edgeStroke});}
.text-primary{fill:var(${cv.textPrimary});}
.text-secondary{fill:var(${cv.textSecondary});}
.text-header{fill:var(${cv.headerText});font-weight:700;}`;
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
body[data-theme="transitrix"]{${adaptiveVars(TRANSITRIX_LIGHT)}${diagramVars('light')}}
${shell}
${classes}`;
  }

  if (themeId === 'transitrix-dark') {
    return `${base}
body[data-theme="transitrix-dark"]{${adaptiveVars(TRANSITRIX_DARK)}${diagramVars('dark')}}
${shell}
${classes}`;
  }

  // vscode-adaptive: map --ts-shell vars to --vscode-* CSS variables;
  // layer/level/structural colors follow the VS Code theme body class.
  const cv = CSS_VAR;
  return `${base}
body[data-theme="vscode-adaptive"]{
  ${cv.bg}:var(--vscode-editor-background);
  ${cv.bgSurface}:var(--vscode-sideBar-background,var(--vscode-editor-background));
  ${cv.bgElevated}:var(--vscode-editorHoverWidget-background,var(--vscode-editor-background));
  ${cv.text}:var(--vscode-foreground);
  ${cv.textMuted}:var(--vscode-descriptionForeground);
  ${cv.textInverse}:var(--vscode-editor-background);
  ${cv.border}:var(--vscode-panel-border);
  ${cv.divider}:var(--vscode-panel-border);
  ${diagramVars('light')}
}
body[data-theme="vscode-adaptive"].vscode-dark{${diagramVars('dark')}}
body[data-theme="vscode-adaptive"].vscode-high-contrast{${diagramVars('hc')}}
${shell}
${classes}`;
}
