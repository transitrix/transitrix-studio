import type { ThemeId } from '../../packages/diagrams/src/theme/index.js';
import { generateWebviewCss } from '../../packages/diagrams/src/theme/index.js';

export type { ThemeId };

export interface DiagramFrameOpts {
  /** Short filename shown in toolbar (e.g. "strategy-2026.fgca.transitrix.yaml"). */
  filename: string;
  /** Human-readable notation name shown in toolbar (e.g. "FGCA", "Goal tree"). */
  notation: string;
  /** Rendered SVG string. Empty string or omitted → no diagram rendered. */
  svgContent?: string;
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

export function buildDiagramFrame(opts: DiagramFrameOpts): string {
  const {
    filename, notation, svgContent = '', errorMsg = '',
    warnings = [], themeId = 'transitrix', extraStyles = '', fixPrompt = '',
  } = opts;

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

  const caption = svgContent
    ? `<div class="diagram-caption">${escXml(notation)} — ${escXml(filename)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
${generateWebviewCss(themeId)}
${FIX_PROMPT_CSS}
${extraStyles}
  </style>
</head>
<body data-theme="${escXml(themeId)}">
  <div id="toolbar">${escXml(notation)}: ${escXml(filename)}</div>
  ${errBlock}${fixPromptBlock}${warnBlock}
  <div id="canvas">
    ${svgContent}
    ${caption}
  </div>
</body>
</html>`;
}
