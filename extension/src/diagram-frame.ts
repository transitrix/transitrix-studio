import type { ThemeId } from '../../packages/diagrams/src/theme/index.js';
import { generateWebviewCss, generateSvgEmbedCss } from '../../packages/diagrams/src/theme/index.js';

export type { ThemeId };

/**
 * Injects a <style> block with all --ts-* CSS variable definitions into an SVG string,
 * making it self-contained for file export (no external stylesheet required).
 */
export function prepareSvgForExport(svg: string, themeId: ThemeId = 'transitrix'): string {
  const css = generateSvgEmbedCss(themeId);
  return svg.replace(/(<svg\b[^>]*>)/, `$1<style>${css}</style>`);
}

export interface DiagramFrameOpts {
  /** Short filename shown in toolbar (e.g. "strategy-2026.fgca.transitrix.yaml"). */
  filename: string;
  /** Human-readable notation name shown in toolbar (e.g. "FGCA", "Goal tree"). */
  notation: string;
  /** Rendered SVG string. Empty string or omitted → no diagram rendered. */
  svgContent?: string;
  /**
   * HTML body content (e.g. a table). When present, rendered in the canvas instead of svgContent.
   * The string is placed raw (unescaped) — caller is responsible for safe HTML.
   */
  bodyContent?: string;
  /** Hard error message (parse / validation failure). Displayed in red above the canvas. */
  errorMsg?: string;
  /** Non-fatal warnings. Each rendered as a yellow strip above the canvas. */
  warnings?: string[];
  /** VS Code theme variant to apply. Defaults to "transitrix". */
  themeId?: ThemeId;
  /** Additional CSS injected after the base theme CSS. Use for notation-specific styles. */
  extraStyles?: string;
  /**
   * When present, renders a "copy to AI assistant" box below the error message.
   * Use for dependency-not-found errors where an agent can resolve the issue.
   */
  fixPrompt?: string;
  /** Document title shown as a large header above the canvas. Sourced from YAML frontmatter. */
  title?: string;
  /** Subtitle or description shown below the title. Sourced from YAML frontmatter. */
  subtitle?: string;
  /** Version string for the metadata strip (e.g. "1.0"). */
  version?: string;
  /** Date string for the metadata strip (e.g. "2026-05-13"). */
  date?: string;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Generates a complete webview HTML document for static SVG notation previews.
 * Shell structure: toolbar → error/warning strips → canvas → figcaption.
 * Theme is applied via data-theme attribute on <body> and --ts-* CSS variables.
 */
const FIX_PROMPT_CSS = `
.fix-prompt-wrap {
  margin: 8px 16px 12px;
  border-left: 3px solid var(--vscode-editorWarning-foreground, #c07030);
  padding-left: 12px;
}
.fix-prompt-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--vscode-editorWarning-foreground, #c07030);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.fix-prompt-text {
  display: block;
  width: 100%;
  box-sizing: border-box;
  background: var(--vscode-textCodeBlock-background, #f5f5f5);
  color: var(--vscode-editor-foreground, #333);
  border: 1px solid var(--vscode-editorWidget-border, #ccc);
  border-radius: 4px;
  padding: 10px 12px;
  font-family: var(--vscode-editor-font-family, 'Consolas', 'Menlo', monospace);
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
}
`;

const FRAME_HEADER_CSS = `
.frame-header{padding:16px 20px 0;}
.frame-title{font-size:18px;font-weight:700;color:var(--ts-text,#0f172a);margin-bottom:4px;}
.frame-subtitle{font-size:13px;color:var(--ts-text-muted,#64748b);margin-bottom:4px;}
.frame-meta{font-size:11px;color:var(--ts-text-muted,#64748b);letter-spacing:0.04em;}
`;

/**
 * CSS-only title show/hide toggle (TX-R009).
 *
 * Static previews run with enableScripts: false, so this follows the same
 * trick as the activities Network/Gantt switcher (PR #9):
 *   1. A hidden checkbox sits at the top of <body> before any sibling that
 *      should react. It's positioned off-screen rather than display:none so
 *      keyboard focus still reaches it.
 *   2. A <label for="…"> lives inside #toolbar styled as a button.
 *   3. `:checked` propagates via the sibling combinator to hide either
 *      .frame-header (catalogue previews) or .diagram-caption (SVG previews).
 *
 * Default is "title shown" (checkbox checked). Clicking unchecks → title
 * hidden.
 */
const TITLE_TOGGLE_CSS = `
.title-toggle-cb { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
#toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.toolbar-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title-toggle {
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 4px;
  color: var(--ts-text-muted, #64748b);
  white-space: nowrap;
}
.title-toggle::before { content: "\\2611\\00a0"; font-size: 12px; }
.title-toggle:hover { color: var(--ts-text, #0f172a); background: var(--ts-bg-elevated, #f1f5f9); }
.title-toggle-cb:focus-visible ~ #toolbar .title-toggle { outline: 1px dashed var(--ts-text-muted, #64748b); outline-offset: 2px; }
.title-toggle-cb:not(:checked) ~ #toolbar .title-toggle::before { content: "\\2610\\00a0"; }
.title-toggle-cb:not(:checked) ~ .frame-header { display: none; }
.title-toggle-cb:not(:checked) ~ #canvas .diagram-caption { display: none; }
`;

/**
 * Shared styling for catalogue-style HTML previews (applications, products,
 * process-map, scenarios, capability-map). Covers the bits that every
 * catalogue notation duplicates verbatim — badges, maturity dots, empty
 * states, details/summary, table reset. Notation-specific table class names
 * and entity-row classes stay local to each preview.
 *
 * Inject by prepending to the preview's own extraStyles:
 *   extraStyles: CATALOGUE_STYLES + LOCAL_STYLES
 */
export const CATALOGUE_STYLES = `
#canvas { padding: 0 20px 16px; }
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
.badge-active        { background: var(--ts-status-success-bg, #d1fae5); color: var(--ts-status-success-fg, #065f46); }
.badge-draft         { background: var(--ts-status-info-bg, #e0f2fe);    color: var(--ts-status-info-fg, #0c4a6e); }
.badge-deprecated    { background: var(--ts-status-warning-bg, #fef9c3); color: var(--ts-status-warning-fg, #854d0e); }
.badge-decommissioning { background: var(--ts-status-error-bg, #fee2e2); color: var(--ts-status-error-fg, #991b1b); }
.badge-archived      { background: var(--ts-status-warning-bg, #fef9c3); color: var(--ts-status-warning-fg, #854d0e); }
.maturity-dots { font-size: 14px; letter-spacing: 1px; color: var(--ts-brand-primary, #004d67); }
.maturity-none { color: var(--ts-text-muted, #64748b); }
.cell-empty { color: var(--ts-text-muted, #94a3b8); }
.empty-catalogue { text-align: center; color: var(--ts-text-muted, #64748b); padding: 32px; font-style: italic; }
details { margin-top: 6px; font-size: 12px; }
details summary { cursor: pointer; color: var(--ts-brand-primary, #004d67); font-weight: 500; user-select: none; }
details ul { margin: 4px 0 0 16px; padding: 0; }
details li { margin-bottom: 3px; }
`;

export function buildDiagramFrame(opts: DiagramFrameOpts): string {
  const {
    filename, notation,
    svgContent = '', bodyContent,
    errorMsg = '', warnings = [],
    themeId = 'transitrix', extraStyles = '', fixPrompt = '',
    title, subtitle, version, date,
  } = opts;

  const canvasContent = bodyContent ?? svgContent;

  const errBlock = errorMsg
    ? `<pre style="color:var(--vscode-errorForeground,#b91c1c);white-space:pre-wrap;padding:12px 16px;">${escXml(errorMsg)}</pre>`
    : '';

  const fixPromptBlock = fixPrompt
    ? `<div class="fix-prompt-wrap">
  <div class="fix-prompt-label">Prompt for your AI assistant — select all and copy:</div>
  <textarea class="fix-prompt-text" readonly rows="9">${escXml(fixPrompt)}</textarea>
</div>`
    : '';

  const warnBlock = warnings.length > 0
    ? warnings.map(w =>
        `<div style="color:#c07030;font-size:11px;padding:2px 12px;">${escXml(w)}</div>`
      ).join('')
    : '';

  const metaParts = [version ? `v${escXml(version)}` : null, date ? escXml(date) : null].filter(Boolean);
  const headerBlock = title
    ? `<div class="frame-header">
  <div class="frame-title">${escXml(title)}</div>
  ${subtitle ? `<div class="frame-subtitle">${escXml(subtitle)}</div>` : ''}
  ${metaParts.length > 0 ? `<div class="frame-meta">${metaParts.join(' · ')}</div>` : ''}
</div>`
    : '';

  const caption = canvasContent && !title
    ? `<div class="diagram-caption">${escXml(notation)} — ${escXml(filename)}</div>`
    : '';

  // The toggle only makes sense when there's actually a title-ish element to
  // hide. Skip the widget on error-only renders so users don't see a button
  // that does nothing.
  const showToggle = Boolean(title) || Boolean(canvasContent);
  const toggleInput = showToggle
    ? `<input type="checkbox" id="ts-title-toggle" class="title-toggle-cb" checked>`
    : '';
  const toolbarRight = showToggle
    ? `<label for="ts-title-toggle" class="title-toggle" title="Show or hide the diagram title">Title</label>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
${generateWebviewCss(themeId)}
${FIX_PROMPT_CSS}
${FRAME_HEADER_CSS}
${TITLE_TOGGLE_CSS}
${extraStyles}
  </style>
</head>
<body data-theme="${escXml(themeId)}">
  ${toggleInput}
  <div id="toolbar"><span class="toolbar-label">${escXml(notation)}: ${escXml(filename)}</span>${toolbarRight}</div>
  ${errBlock}${fixPromptBlock}${warnBlock}
  ${headerBlock}
  <div id="canvas">
    ${canvasContent}
    ${caption}
  </div>
</body>
</html>`;
}
