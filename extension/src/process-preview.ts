/**
 * VS Code preview panel for the BPMN process notation using the custom SVG
 * emitter from @transitrix/diagrams (custom process renderer programme, P1–P3).
 *
 * Active when `transitrix.bpmnRenderer` is set to `"custom"`. The default
 * bpmn.io path (CervinPreview) is unaffected.
 *
 * P3: migrated to buildDiagramFrame for zoom/pan parity with all other
 * diagram previews.
 */

import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  renderProcessLayoutSvg,
  type ProcessDiagramLayout,
} from '@transitrix/diagrams/webview/render-process.js';
import { escXml } from '@transitrix/diagrams/webview/render-util.js';
import {
  buildDiagramFrame,
  prepareSvgForExport,
  OPEN_THEME_COMMAND,
  type ThemeId,
} from './diagram-frame.js';
import type { ValidationReport } from './types.js';

export const SAVE_BPMN_PROCESS_SVG_COMMAND = 'transitrixStudio.saveBpmnProcessAsSvg';

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
  private lastSvg = '';

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
        {
          enableScripts: false,
          enableCommandUris: true,
          retainContextWhenHidden: true,
        },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.trackedUri = undefined;
        this.lastSvg = '';
      });
    }

    await this.pushDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
    await this.pushDocument(doc);
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.bpmn.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.(bpmn|cervin)\.(transitrix|cervin)\.yaml$/, '')
      : 'diagram';
    const defaultUri = sourceUri
      ? vscode.Uri.file(path.join(path.dirname(sourceUri.fsPath), `${stem}.svg`))
      : vscode.Uri.file(`${stem}.svg`);
    const target = await vscode.window.showSaveDialog({ defaultUri, filters: { 'SVG Image': ['svg'] } });
    if (!target) return;
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    const svg = prepareSvgForExport(this.lastSvg, themeId);
    await vscode.workspace.fs.writeFile(target, Buffer.from(svg, 'utf-8'));
    vscode.window.showInformationMessage(`Saved: ${path.basename(target.fsPath)}`);
  }

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const filename = path.basename(doc.fileName);
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    try {
      const { layout, validation } = await this.layoutFn(doc.getText());
      const svg = renderProcessLayoutSvg(layout);
      this.lastSvg = svg;

      const errors = validation.findings.filter((f) => f.severity === 'error');
      const warnings = validation.findings.filter((f) => f.severity === 'warning');
      const errorMsg = errors.length > 0
        ? errors.map((e) => escXml(e.message)).join('\n')
        : '';
      const warningMsgs = warnings.map((w) => w.message);

      this.panel.webview.html = buildDiagramFrame({
        filename,
        notation: 'BPMN Process',
        svgContent: svg,
        errorMsg,
        warnings: warningMsgs,
        themeId,
        saveSvgCommand: SAVE_BPMN_PROCESS_SVG_COMMAND,
        themeCommand: OPEN_THEME_COMMAND,
      });
    } catch (err) {
      this.lastSvg = '';
      const msg = err instanceof Error ? err.message : String(err);
      this.panel.webview.html = buildDiagramFrame({
        filename,
        notation: 'BPMN Process',
        errorMsg: msg,
        themeId,
      });
    }
  }
}
