import type { ThemeId } from '@transitrix/diagrams/theme';
import { generateWebviewCss, generateSvgEmbedCss } from '@transitrix/diagrams/theme';
import { CONTROLS_PANEL_CSS, SNAPSHOT_TOOLBAR_CSS } from './preview-controls.js';
import { escXml, extractDiagramMeta } from '@transitrix/diagrams/webview/render-util.js';

export type { ThemeId };

/** Command ID for the "Theme…" toolbar button — opens a QuickPick to change the global diagram theme. */
export const OPEN_THEME_COMMAND = 'transitrixStudio.changeTheme';

// Diagram-level metadata reading now lives host-neutrally in @transitrix/diagrams
// (review E) so the VS Code chrome and the webview bundle share one reader.
// Re-exported here so the *-preview.ts callers keep their existing import site.
export { extractDiagramMeta };

/**
 * Injects a <style> block with all --ts-* CSS variable definitions into an SVG string,
 * making it self-contained for file export (no external stylesheet required).
 *
 * Pass `notationCss` for the per-notation class rules (e.g. action-preview's
 * `.act-node`, `.critical-edge`, `.gantt-bar`) that live in the preview's
 * webview `extraStyles` but are not part of the shared theme. Without them the
 * exported SVG falls through to browser defaults — typically black fills on
 * dark stroke — and looks nothing like the in-VS-Code preview.
 */
export function prepareSvgForExport(svg: string, themeId: ThemeId = 'transitrix', notationCss = ''): string {
  const css = generateSvgEmbedCss(themeId);
  return svg.replace(/(<svg\b[^>]*>)/, `$1<style>${css}${notationCss}</style>`);
}

export interface DiagramFrameOpts {
  /** Short filename shown in toolbar (e.g. "strategy-2026.dgca.transitrix.yaml"). */
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
  /**
   * Command ID for the "Save as SVG" toolbar button (e.g.
   * "transitrixStudio.saveGoalsAsSvg"). When provided, the toolbar shows a
   * "Save .svg" pill next to the Title toggle, wired as a `command:` URI.
   * The preview's webview must opt into command URIs via `enableCommandUris`.
   * Omit on previews that don't render a vector diagram (HTML catalogues).
   */
  saveSvgCommand?: string;
  /**
   * Command ID for the "Save .png" toolbar button. Rendered next to
   * "Save .svg" when provided and a vector diagram is on screen. PNG is
   * rasterized in the Node host (resvg) — see `raster.ts`.
   */
  savePngCommand?: string;
  /**
   * Command ID for the "Copy PNG" toolbar button (clipboard). Rendered next
   * to "Save .png" when provided and a vector diagram is on screen.
   */
  copyPngCommand?: string;
  /**
   * Command ID for the "Spacing…" toolbar link (opens Settings filtered to the
   * per-notation gap controls — vkgeorgia/strategy#75). Rendered for previews
   * that honour `transitrix.spacing.*`. Shown even on error renders so the user
   * can widen/tighten and re-render. The preview's webview must opt into command
   * URIs via `enableCommandUris`.
   */
  spacingCommand?: string;
  /**
   * Command ID for the "Curvature…" toolbar link (opens Settings filtered to
   * the per-notation edge-curvature control — vkgeorgia/strategy#76). Same
   * opt-in contract as `spacingCommand`.
   */
  curvatureCommand?: string;
  /**
   * Command ID for the "Scope…" toolbar link (opens Settings filtered to the
   * per-notation level/root scope controls — vkgeorgia/strategy#77). Same
   * opt-in contract as `spacingCommand`.
   */
  scopeCommand?: string;
  /**
   * Command ID for the "Theme…" toolbar button (opens a QuickPick to change the global
   * `transitrix.theme` setting). Pass `OPEN_THEME_COMMAND` from all diagram previews.
   * The preview's webview must include this command in `enableCommandUris`.
   */
  themeCommand?: string;
  /**
   * When true, adds a "Legend" toggle button to the toolbar (CSS-only, no scripts).
   * The SVG must wrap its legend elements in `<g class="diagram-legend-col">`.
   * Follows the same pattern as the title toggle (TX-R009).
   */
  legendToggle?: boolean;
  /**
   * Opt-in to in-preview interactive controls (vkgeorgia/strategy#75/#76/#77 —
   * PR2). When present, the frame switches from the script-less static CSP to a
   * strict nonce-based CSP (`default-src 'none'; style-src 'unsafe-inline';
   * script-src 'nonce-…'`), injects the control panel below the toolbar, and
   * appends the nonce'd wiring script. The preview's webview MUST be created
   * with `enableScripts: true` for this to function. Omitted on every static
   * (script-less) preview — those keep the script-less CSP byte-for-byte.
   *
   * `controlsPanel` / `controlsScript` come from `preview-controls.ts`
   * (`buildControlsPanel` / `buildControlsScript`); `nonce` from `genNonce()`.
   */
  interactive?: {
    nonce: string;
    controlsPanel: string;
    controlsScript: string;
    /**
     * Optional toolbar segmented control (e.g. the tree↔table view toggle,
     * vkgeorgia/strategy#137). Injected as the first item in the toolbar
     * actions. Pass '' / omit when the preview has no toolbar control.
     */
    viewToggleHtml?: string;
  };
  /**
   * When present, injects snapshot capture + timeline UI into the frame.
   * The capture button appears in the toolbar actions; the timeline strip
   * appears below the controls panel; the info box is appended before the
   * canvas content. Requires `interactive` to also be present (needs scripts).
   */
  snapshotUi?: {
    /** The "Capture…" button HTML (from buildCaptureButton()). */
    captureButton: string;
    /** The timeline strip HTML (from buildTimelineStrip(markers)). May be ''. */
    timelineStrip: string;
  };
}

/**
 * Generates a complete webview HTML document for static SVG notation previews.
 * Shell structure: toolbar → error/warning strips → canvas → figcaption.
 * Theme is applied via data-theme attribute on <body> and --ts-* CSS variables.
 */
const FIX_PROMPT_CSS = `
.fix-prompt-wrap {
  margin: 8px 16px 0;
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

// Collapsible error strip (vkgeorgia/strategy view-testing idea). Mirrors the
// `.tx-ctl` controls panel look so the preview reads consistently.
//
// Collapse is driven by a hidden checkbox + a <label> summary + a `:checked ~`
// sibling selector — the SAME CSS-only mechanism the Title toggle and Zoom
// control use (see TITLE_TOGGLE_CSS / ZOOM_CONTROL_CSS). A previous revision
// used a native <details>/<summary>, but that did not collapse in the static
// (`enableScripts: false`) previews where the strip most often appears, so the
// strip is wired the same script-free way as every other preview affordance.
//
// Expanded by default — a hard error must never be silently folded away; the
// user clicks the summary to fold it once read and reclaim the canvas. The
// checkbox sits at the top of <body> (off-screen but focusable) so the general
// sibling combinator reaches the strip wherever it renders.
export const ERROR_BLOCK_CSS = `
.tx-err-toggle-cb{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;}
.tx-err{margin:8px 16px 0;border:1px solid var(--vscode-inputValidation-errorBorder,var(--vscode-errorForeground,#b91c1c));border-radius:6px;}
.tx-err-summary{display:block;cursor:pointer;user-select:none;padding:6px 10px;font-size:12px;font-weight:600;color:var(--vscode-errorForeground,#b91c1c);}
.tx-err-summary::before{content:"\\25BE\\00a0";}
.tx-err-toggle-cb:checked ~ .tx-err .tx-err-summary::before{content:"\\25B8\\00a0";}
.tx-err-toggle-cb:focus-visible ~ .tx-err .tx-err-summary{outline:1px dashed var(--vscode-errorForeground,#b91c1c);outline-offset:2px;}
.tx-err-body{margin:0;color:var(--vscode-errorForeground,#b91c1c);white-space:pre-wrap;padding:2px 16px 12px;}
.tx-err-toggle-cb:checked ~ .tx-err .tx-err-body{display:none;}
`;

// Collapsible warnings strip. Same script-free checkbox+label+`:checked ~`
// mechanism as the error strip, in the warning colour. Non-fatal advisories
// (e.g. ACT-011 "no duration", ACT-019 "Gantt view will not render") can pile
// up and crowd the canvas, so — unlike the error strip — this one is COLLAPSED
// by default (checkbox starts `checked`); the count stays visible in the
// summary and the user expands to read.
export const WARN_BLOCK_CSS = `
.tx-warn-toggle-cb{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;}
.tx-warn{margin:8px 16px 0;border:1px solid var(--vscode-editorWarning-foreground,#c07030);border-radius:6px;}
.tx-warn-summary{display:block;cursor:pointer;user-select:none;padding:6px 10px;font-size:12px;font-weight:600;color:var(--vscode-editorWarning-foreground,#c07030);}
.tx-warn-summary::before{content:"\\25BE\\00a0";}
.tx-warn-toggle-cb:checked ~ .tx-warn .tx-warn-summary::before{content:"\\25B8\\00a0";}
.tx-warn-toggle-cb:focus-visible ~ .tx-warn .tx-warn-summary{outline:1px dashed var(--vscode-editorWarning-foreground,#c07030);outline-offset:2px;}
.tx-warn-body{padding:0 6px 8px;}
.tx-warn-item{color:var(--vscode-editorWarning-foreground,#c07030);font-size:11px;padding:2px 12px;}
.tx-warn-toggle-cb:checked ~ .tx-warn .tx-warn-body{display:none;}
`;

/**
 * Builds the HTML for a collapsible warnings block (starts collapsed).
 * Requires `WARN_BLOCK_CSS` to be included in the page stylesheet.
 * Returns empty strings when `warnings` is empty.
 */
export function buildWarnHtml(warnings: string[]): { input: string; block: string } {
  if (warnings.length === 0) return { input: '', block: '' };
  const label = warnings.length === 1 ? '1 warning' : `${warnings.length} warnings`;
  const items = warnings.map(w => `<div class="tx-warn-item">${escXml(w)}</div>`).join('');
  return {
    input: '<input type="checkbox" id="ts-warn-toggle" class="tx-warn-toggle-cb" checked>',
    block: `<div class="tx-warn">\n  <label for="ts-warn-toggle" class="tx-warn-summary">⚠ ${label}</label>\n  <div class="tx-warn-body">${items}</div>\n</div>`,
  };
}

/**
 * Builds the HTML for a collapsible error block (starts expanded).
 * Requires `ERROR_BLOCK_CSS` to be included in the page stylesheet.
 * Returns empty strings when `errorMsg` is empty.
 */
export function buildErrorHtml(errorMsg: string): { input: string; block: string } {
  if (!errorMsg) return { input: '', block: '' };
  return {
    input: '<input type="checkbox" id="ts-err-toggle" class="tx-err-toggle-cb">',
    block: `<div class="tx-err">\n  <label for="ts-err-toggle" class="tx-err-summary">✕ Error</label>\n  <pre class="tx-err-body">${escXml(errorMsg)}</pre>\n</div>`,
  };
}

const FRAME_HEADER_CSS = `
.frame-header{padding:14px 24px 10px;}
.frame-title{font-size:13px;font-weight:700;color:var(--ts-header-text,#0f172a);font-family:var(--vscode-font-family,system-ui,-apple-system,sans-serif);line-height:16px;margin-bottom:0;}
.frame-subtitle{font-size:11px;font-weight:400;color:var(--ts-text-secondary,#475569);font-family:var(--vscode-font-family,system-ui,-apple-system,sans-serif);line-height:16px;margin-bottom:0;}
.frame-meta{font-size:11px;font-weight:400;color:var(--ts-text-secondary,#475569);font-family:var(--vscode-font-family,system-ui,-apple-system,sans-serif);letter-spacing:0.04em;line-height:16px;}
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
/* The toolbar wraps: with Title + Zoom + Save .svg / .png + Copy PNG the
   action row can exceed a narrow side-by-side preview pane. Without wrapping
   the rightmost button (Copy PNG) overflowed off-screen. flex-wrap lets the
   actions drop to a second line instead of vanishing. */
#toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.toolbar-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toolbar-actions { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.title-toggle,
.toolbar-btn {
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 4px;
  color: var(--ts-text-muted, #64748b);
  white-space: nowrap;
  text-decoration: none;
}
.toolbar-btn:hover { color: var(--ts-text, #0f172a); background: var(--ts-bg-elevated, #f1f5f9); }
.title-toggle::before { content: "\\2611\\00a0"; font-size: 12px; }
.title-toggle:hover { color: var(--ts-text, #0f172a); background: var(--ts-bg-elevated, #f1f5f9); }
.title-toggle-cb:focus-visible ~ #toolbar .title-toggle { outline: 1px dashed var(--ts-text-muted, #64748b); outline-offset: 2px; }
.title-toggle-cb:not(:checked) ~ #toolbar .title-toggle::before { content: "\\2610\\00a0"; }
.title-toggle-cb:not(:checked) ~ .frame-header { display: none; }
.title-toggle-cb:not(:checked) ~ #canvas .diagram-title-block { display: none; }

/* HTML-rendered title block — used when a preview can't embed in SVG
   (Gantt-unavailable notice, blocks preview's multi-SVG wrapper). Same class
   as the SVG variant so the toggle catches both. Reuses .text-header /
   .text-secondary from the shared theme so the typography matches. */
.diagram-title-block-html { margin: 0 16px 12px; }
.diagram-title-block-html div { line-height: 16px; }

/* Legend column toggle (optional, opt-in via legendToggle). Checkbox drives
   show/hide for <g class="diagram-legend-col"> inside the SVG canvas. Same
   script-free checkbox+label+:checked~ pattern as the title toggle. */
.legend-toggle-cb { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.legend-toggle-cb:not(:checked) ~ #canvas .diagram-legend-col { display: none; }
`;

/**
 * CSS-only discrete zoom control (orchestrator decision on issue #30):
 * 50 / 75 / 100 (default) / 150 / 200 % through hidden radios + labels.
 * Same pattern as TX-R009 title toggle and Network/Gantt switcher — no
 * script enablement, the security backstop on previews stays intact.
 *
 * `zoom` (rather than transform: scale) is used because it grows the layout
 * box too, so `#canvas`'s scrollbars reflect the scaled diagram size and
 * the user can pan a zoomed-in view. `zoom` is non-standard but native in
 * Chromium-based webviews (where Studio runs) and on the CSS Sizing L4
 * standardisation path.
 */
const ZOOM_CONTROL_CSS = `
.zoom-radio { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.zoom-control { display: inline-flex; gap: 0; border: 1px solid var(--ts-border, #cbd5e1); border-radius: 4px; overflow: hidden; }
.zoom-label {
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  padding: 1px 6px;
  color: var(--ts-text-muted, #64748b);
  background: transparent;
  white-space: nowrap;
  border-right: 1px solid var(--ts-border, #cbd5e1);
}
.zoom-control .zoom-label:last-child { border-right: none; }
.zoom-label:hover { color: var(--ts-text, #0f172a); background: var(--ts-bg-elevated, #f1f5f9); }
.zoom-radio#z-50:checked  ~ #toolbar .zoom-label[for="z-50"],
.zoom-radio#z-75:checked  ~ #toolbar .zoom-label[for="z-75"],
.zoom-radio#z-100:checked ~ #toolbar .zoom-label[for="z-100"],
.zoom-radio#z-150:checked ~ #toolbar .zoom-label[for="z-150"],
.zoom-radio#z-200:checked ~ #toolbar .zoom-label[for="z-200"] {
  background: var(--ts-bg-elevated, #f1f5f9);
  color: var(--ts-text, #0f172a);
  font-weight: 600;
}
/* Apply zoom to every SVG and the blocks multi-SVG wrapper. We use the
   non-standard but Chromium-native 'zoom' property rather than transform:
   scale so the layout box grows and #canvas scrollbars span the scaled
   diagram. */
.zoom-radio#z-50:checked  ~ #canvas svg,
.zoom-radio#z-50:checked  ~ #canvas .blocks-svg-wrap { zoom: 0.5; }
.zoom-radio#z-75:checked  ~ #canvas svg,
.zoom-radio#z-75:checked  ~ #canvas .blocks-svg-wrap { zoom: 0.75; }
.zoom-radio#z-150:checked ~ #canvas svg,
.zoom-radio#z-150:checked ~ #canvas .blocks-svg-wrap { zoom: 1.5; }
.zoom-radio#z-200:checked ~ #canvas svg,
.zoom-radio#z-200:checked ~ #canvas .blocks-svg-wrap { zoom: 2; }
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
.empty-catalogue { text-align: center; color: var(--ts-text-muted, #64748b); padding: 32px; }
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
    saveSvgCommand, savePngCommand, copyPngCommand, spacingCommand, curvatureCommand, scopeCommand, themeCommand,
    interactive, legendToggle, snapshotUi,
  } = opts;

  const canvasContent = bodyContent ?? svgContent;

  // Each validation error is one `CODE: message` line (see the previews'
  // `v.errors.map(...).join('\n')`); a bare parse failure is a single line.
  // Counting non-empty lines gives a meaningful summary count for both.
  const errCount = errorMsg ? errorMsg.split('\n').filter(l => l.trim() !== '').length : 0;
  // Hidden checkbox drives the CSS-only collapse (see ERROR_BLOCK_CSS); only
  // emitted alongside an actual error so there's no orphan control.
  const errToggleInput = errorMsg
    ? `<input type="checkbox" id="ts-err-toggle" class="tx-err-toggle-cb">`
    : '';
  const errBlock = errorMsg
    ? `<div class="tx-err">
  <label for="ts-err-toggle" class="tx-err-summary">⚠ ${errCount === 1 ? '1 error' : `${errCount} errors`}</label>
  <pre class="tx-err-body">${escXml(errorMsg)}</pre>
</div>`
    : '';

  const fixPromptBlock = fixPrompt
    ? `<div class="fix-prompt-wrap">
  <div class="fix-prompt-label">Prompt for your AI assistant — select all and copy:</div>
  <textarea class="fix-prompt-text" readonly rows="9">${escXml(fixPrompt)}</textarea>
</div>`
    : '';

  // Warnings collapse via the same hidden-checkbox mechanism, but start
  // COLLAPSED (checkbox `checked`) — advisories shouldn't crowd the canvas.
  const { input: warnToggleInput, block: warnBlock } = buildWarnHtml(warnings);

  const metaParts = date ? [`Generated: ${escXml(date)}`] : [];
  const headerBlock = title
    ? `<div class="frame-header">
  <div class="frame-title">${escXml(title)}</div>
  ${subtitle ? `<div class="frame-subtitle">${escXml(subtitle)}</div>` : ''}
  ${metaParts.length > 0 ? `<div class="frame-meta">${metaParts.join(' · ')}</div>` : ''}
</div>`
    : '';

  // Bottom .diagram-caption is gone — every vector preview now embeds its own
  // 3-line title block inside the SVG (PR #17/#18) and HTML catalogues use
  // .frame-header. The figcaption was redundant with the title block above.

  // The toggle only makes sense when there's actually a title-ish element to
  // hide. Skip the widget on error-only renders so users don't see a button
  // that does nothing.
  const showToggle = Boolean(title) || Boolean(canvasContent);
  // Save .svg button — only render when both (a) a vector diagram is on screen
  // and (b) the preview supplied a command id (HTML catalogues never do).
  const showSaveSvg = Boolean(canvasContent) && Boolean(saveSvgCommand);
  const showSavePng = Boolean(canvasContent) && Boolean(savePngCommand);
  const showCopyPng = Boolean(canvasContent) && Boolean(copyPngCommand);
  // Spacing/curvature/scope links show whenever the preview opts in — including
  // error renders, so the user can adjust the settings and trigger a re-render.
  const showSpacing = Boolean(spacingCommand);
  const showCurvature = Boolean(curvatureCommand);
  const showScope = Boolean(scopeCommand);
  const showTheme = Boolean(themeCommand);
  // Zoom control gates on the same signal as Save .svg — the six vector
  // previews opt in by passing a saveSvgCommand. HTML catalogues are out of
  // scope per the orchestrator's call on issue #30.
  const showZoom = Boolean(canvasContent) && Boolean(saveSvgCommand);
  const showLegendToggle = Boolean(legendToggle);
  const legendToggleInput = showLegendToggle
    ? `<input type="checkbox" id="ts-legend-toggle" class="legend-toggle-cb" checked>`
    : '';
  const toggleInput = showToggle
    ? `<input type="checkbox" id="ts-title-toggle" class="title-toggle-cb" checked>`
    : '';
  const zoomInputs = showZoom
    ? `<input type="radio" name="ts-zoom" id="z-50"  class="zoom-radio">
  <input type="radio" name="ts-zoom" id="z-75"  class="zoom-radio">
  <input type="radio" name="ts-zoom" id="z-100" class="zoom-radio" checked>
  <input type="radio" name="ts-zoom" id="z-150" class="zoom-radio">
  <input type="radio" name="ts-zoom" id="z-200" class="zoom-radio">`
    : '';
  const actionParts: string[] = [];
  if (interactive?.viewToggleHtml) {
    actionParts.push(interactive.viewToggleHtml);
  }
  // Snapshot capture button — injected into toolbar actions when snapshotUi is present.
  if (snapshotUi?.captureButton) {
    actionParts.push(snapshotUi.captureButton);
  }
  if (showToggle) {
    actionParts.push(`<label for="ts-title-toggle" class="title-toggle" title="Show or hide the diagram title">Title</label>`);
  }
  if (showLegendToggle) {
    actionParts.push(`<label for="ts-legend-toggle" class="title-toggle" title="Show or hide the legend column">Legend</label>`);
  }
  if (showZoom) {
    actionParts.push(`<div class="zoom-control" title="Zoom level"><label for="z-50" class="zoom-label">50%</label><label for="z-75" class="zoom-label">75%</label><label for="z-100" class="zoom-label">100%</label><label for="z-150" class="zoom-label">150%</label><label for="z-200" class="zoom-label">200%</label></div>`);
  }
  if (showSaveSvg) {
    actionParts.push(`<a href="command:${escXml(saveSvgCommand!)}" class="toolbar-btn" title="Save the current diagram as an .svg file">Save .svg</a>`);
  }
  if (showSavePng) {
    actionParts.push(`<a href="command:${escXml(savePngCommand!)}" class="toolbar-btn" title="Save the current diagram as a .png file">Save .png</a>`);
  }
  if (showCopyPng) {
    actionParts.push(`<a href="command:${escXml(copyPngCommand!)}" class="toolbar-btn" title="Copy the current diagram to the clipboard as a PNG image">Copy image</a>`);
  }
  if (showSpacing) {
    actionParts.push(`<a href="command:${escXml(spacingCommand!)}" class="toolbar-btn" title="Adjust the horizontal/vertical spacing for this notation in Settings">Spacing…</a>`);
  }
  if (showCurvature) {
    actionParts.push(`<a href="command:${escXml(curvatureCommand!)}" class="toolbar-btn" title="Adjust the edge curvature for this notation in Settings">Curvature…</a>`);
  }
  if (showScope) {
    actionParts.push(`<a href="command:${escXml(scopeCommand!)}" class="toolbar-btn" title="Scope this preview to a level cap or a single goal's subtree in Settings">Scope…</a>`);
  }
  if (showTheme) {
    actionParts.push(`<a href="command:${escXml(themeCommand!)}" class="toolbar-btn" title="Change the color scheme for all diagram previews">Theme…</a>`);
  }
  const toolbarRight = actionParts.length > 0
    ? `<div class="toolbar-actions">${actionParts.join('')}</div>`
    : '';

  // Interactive previews (vkgeorgia/strategy#75/#76/#77 PR2) opt into a strict
  // nonce-based CSP and the in-preview control panel. Static previews keep the
  // script-less CSP unchanged — the only diff in their output is none.
  const csp = interactive
    ? `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${interactive.nonce}';`
    : `default-src 'none'; style-src 'unsafe-inline';`;
  const controlsCss = interactive ? CONTROLS_PANEL_CSS : '';
  const snapshotCss = snapshotUi ? SNAPSHOT_TOOLBAR_CSS : '';
  const controlsPanel = interactive ? interactive.controlsPanel : '';
  const controlsScript = interactive ? interactive.controlsScript : '';

  // Timeline strip and info box — rendered below the controls panel when snapshotUi present.
  const timelineStrip = snapshotUi?.timelineStrip ?? '';
  const snapInfoBox = snapshotUi
    ? `<div id="tx-snap-info" class="tx-snap-info" style="display:none"></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <style>
${generateWebviewCss(themeId)}
${FIX_PROMPT_CSS}
${ERROR_BLOCK_CSS}
${WARN_BLOCK_CSS}
${FRAME_HEADER_CSS}
${TITLE_TOGGLE_CSS}
${ZOOM_CONTROL_CSS}
${controlsCss}
${snapshotCss}
${extraStyles}
  </style>
</head>
<body data-theme="${escXml(themeId)}">
  ${legendToggleInput}
  ${toggleInput}
  ${zoomInputs}
  ${errToggleInput}
  ${warnToggleInput}
  <div id="toolbar"><span class="toolbar-label">${escXml(notation)}: ${escXml(filename)}</span>${toolbarRight}</div>
  ${controlsPanel}
  ${timelineStrip}
  ${snapInfoBox}
  ${errBlock}${fixPromptBlock}${warnBlock}
  ${headerBlock}
  <div id="canvas">
    ${canvasContent}
  </div>
  ${controlsScript}
</body>
</html>`;
}
