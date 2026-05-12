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
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Generates a complete webview HTML document for static SVG notation previews.
 * Shell structure: toolbar → error/warning strips → canvas → figcaption.
 * Theme is applied via data-theme attribute on <body> and --ts-* CSS variables.
 */
export function buildDiagramFrame(opts: DiagramFrameOpts): string {
  const {
    filename, notation, svgContent = '', errorMsg = '',
    warnings = [], themeId = 'transitrix', extraStyles = '',
  } = opts;

  const errBlock = errorMsg
    ? `<pre style="color:var(--vscode-errorForeground,#b91c1c);white-space:pre-wrap;padding:12px 16px;">${escXml(errorMsg)}</pre>`
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
${extraStyles}
  </style>
</head>
<body data-theme="${escXml(themeId)}">
  <div id="toolbar">${escXml(notation)}: ${escXml(filename)}</div>
  ${errBlock}${warnBlock}
  <div id="canvas">
    ${svgContent}
    ${caption}
  </div>
</body>
</html>`;
}
