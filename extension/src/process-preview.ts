/**
 * VS Code preview panel for the BPMN process notation using the custom SVG
 * emitter from @transitrix/diagrams (custom process renderer programme, P1).
 *
 * Active when `transitrix.bpmnRenderer` is set to `"custom"`. The default
 * bpmn.io path (CervinPreview) is unaffected.
 */

import * as path from 'node:path';
import * as vscode from 'vscode';
import { renderProcessLayoutSvg, type ProcessDiagramLayout } from '@transitrix/diagrams/webview/render-process.js';
import { escXml } from '@transitrix/diagrams/webview/render-util.js';
import { getBaseResetCss } from '@transitrix/diagrams/theme';
import type { ValidationReport } from './types.js';

/** Function that parses + lays out a BPMN YAML document. */
export type ProcessLayoutFn = (yaml: string) => Promise<{
  layout: ProcessDiagramLayout;
  validation: ValidationReport;
}>;

/** VS Code static preview panel backed by the custom SVG emitter. */
export class ProcessPreview {
  readonly panelTitle = 'BPMN Preview';

  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;

  constructor(private readonly layoutFn: ProcessLayoutFn) {}

  isShowingDocument(uri: vscode.Uri): boolean {
    return this.panel != null && this.trackedUri === uri.toString();
  }

  async showOrReveal(doc: vscode.TextDocument): Promise<void> {
    this.trackedUri = doc.uri.toString();

    if (this.panel) {
      this.panel.title = `${this.panelTitle} — ${path.basename(doc.fileName)}`;
      this.panel.reveal(vscode.ViewColumn.Beside, true);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'processCustomPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: false, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.trackedUri = undefined;
      });
    }

    await this.pushDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
    await this.pushDocument(doc);
  }

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const filename = path.basename(doc.fileName);
    try {
      const { layout, validation } = await this.layoutFn(doc.getText());
      const title = `<text class="text-header" x="16" y="22">${escXml(filename)}</text>`;
      const svg = renderProcessLayoutSvg(layout, { title, topInset: 32 });
      this.panel.webview.html = this.buildHtml(svg, filename, validation);
    } catch (err) {
      const msg = err instanceof Error ? escXml(err.message) : escXml(String(err));
      this.panel.webview.html = this.buildErrorHtml(filename, msg);
    }
  }

  private buildHtml(svg: string, filename: string, report: ValidationReport): string {
    const errors = report.findings.filter((f) => f.severity === 'error');
    const warns = report.findings.filter((f) => f.severity === 'warning');

    const errorBanner =
      errors.length > 0
        ? `<div class="banner banner-error"><strong>${errors.length} error${errors.length > 1 ? 's' : ''}:</strong> ${errors.map((e) => escXml(e.message)).join(' · ')}</div>`
        : '';
    const warnBanner =
      warns.length > 0
        ? `<div class="banner banner-warn">${warns.length} warning${warns.length > 1 ? 's' : ''}</div>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escXml(filename)}</title>
<style>
${getBaseResetCss()}
body { margin: 0; overflow: auto; background: var(--vscode-editor-background, #fff); }
.banner { padding: 6px 12px; font-size: 12px; font-family: var(--vscode-font-family, sans-serif); }
.banner-error { background: var(--vscode-inputValidation-errorBackground, #f8d7da); color: var(--vscode-inputValidation-errorForeground, #721c24); }
.banner-warn  { background: var(--vscode-inputValidation-warningBackground, #fff3cd); color: var(--vscode-inputValidation-warningForeground, #856404); }
.diagram-wrap { padding: 0; }
</style>
</head>
<body>
${errorBanner}${warnBanner}
<div class="diagram-wrap">${svg}</div>
</body>
</html>`;
  }

  private buildErrorHtml(filename: string, message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escXml(filename)}</title>
<style>body { margin: 16px; font-family: monospace; }</style>
</head>
<body>
<p style="color:red"><strong>Compile error</strong></p>
<pre>${message}</pre>
</body>
</html>`;
  }
}
