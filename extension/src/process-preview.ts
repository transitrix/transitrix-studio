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
import { genNonce } from './preview-controls.js';
import type { ValidationReport } from './types.js';

export const SAVE_BPMN_PROCESS_SVG_COMMAND = 'transitrixStudio.saveBpmnProcessAsSvg';
export const OPEN_BPMN_SETTINGS_COMMAND = 'transitrixStudio.openBpmnSettings';

export interface BpmnDisplayOpts {
  uniformLaneHeight?: boolean;
}

/** Function that parses + lays out a BPMN YAML document. */
export type ProcessLayoutFn = (yaml: string, opts?: BpmnDisplayOpts) => Promise<{
  layout: ProcessDiagramLayout;
  validation: ValidationReport;
}>;

function buildBpmnControls(nonce: string, uniformLaneHeight: boolean): { panel: string; script: string } {
  const checked = uniformLaneHeight ? ' checked' : '';
  const panel = `<details class="tx-ctl" id="tx-bpmn-ctl">
  <summary>Display</summary>
  <div class="tx-ctl-body">
    <div class="tx-ctl-row"><label><input type="checkbox" id="tx-bpmn-uniform-lanes"${checked}> Equalize lane heights</label></div>
  </div>
</details>`;
  const script = `<script nonce="${nonce}">
(function(){
var vscode=acquireVsCodeApi();
var cb=document.getElementById('tx-bpmn-uniform-lanes');
if(cb){cb.addEventListener('change',function(){vscode.postMessage({type:'transitrix:bpmn-toggle',kind:'uniform-lane-height',value:cb.checked});});}
var det=document.getElementById('tx-bpmn-ctl');
if(det){var st=vscode.getState()||{};if(st.txBpCtlOpen)det.open=true;
  det.addEventListener('toggle',function(){var s=vscode.getState()||{};s.txBpCtlOpen=det.open;vscode.setState(s);});}
}());
<\/script>`;
  return { panel, script };
}

/** VS Code interactive preview panel backed by the custom SVG emitter. */
export class ProcessPreview {
  readonly panelTitle = 'BPMN Preview';

  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;
  private lastSvg = '';
  private uniformLaneHeight = false;

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
          enableScripts: true,
          enableCommandUris: [SAVE_BPMN_PROCESS_SVG_COMMAND, OPEN_BPMN_SETTINGS_COMMAND, OPEN_THEME_COMMAND],
          retainContextWhenHidden: true,
        },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.trackedUri = undefined;
        this.lastSvg = '';
      });
      this.panel.webview.onDidReceiveMessage(async (msg: unknown) => {
        if (!msg || typeof msg !== 'object') return;
        const m = msg as Record<string, unknown>;
        if (m['type'] !== 'transitrix:bpmn-toggle') return;
        if (m['kind'] === 'uniform-lane-height') {
          this.uniformLaneHeight = Boolean(m['value']);
        }
        if (this.panel && this.trackedUri) {
          const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === this.trackedUri);
          if (doc) await this.pushDocument(doc);
        }
      });
    }

    await this.pushDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
    await this.pushDocument(doc);
  }

  async refreshConfig(): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === this.trackedUri);
    if (doc) await this.pushDocument(doc);
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
      const { layout, validation } = await this.layoutFn(doc.getText(), { uniformLaneHeight: this.uniformLaneHeight });
      const svg = renderProcessLayoutSvg(layout);
      this.lastSvg = svg;

      const errors = validation.findings.filter((f) => f.severity === 'error');
      const warnings = validation.findings.filter((f) => f.severity === 'warning');
      const errorMsg = errors.length > 0
        ? errors.map((e) => escXml(e.message)).join('\n')
        : '';
      const warningMsgs = warnings.map((w) => w.message);
      const nonce = genNonce();
      const { panel: controlsPanel, script: controlsScript } = buildBpmnControls(nonce, this.uniformLaneHeight);

      // Title sourced from the process name — the same top-level name field
      // that all other diagram types expose in their title header.
      const processTitle = layout.process.name || undefined;

      this.panel.webview.html = buildDiagramFrame({
        filename,
        notation: 'BPMN Process',
        svgContent: svg,
        errorMsg,
        warnings: warningMsgs,
        themeId,
        title: processTitle,
        saveSvgCommand: SAVE_BPMN_PROCESS_SVG_COMMAND,
        spacingCommand: OPEN_BPMN_SETTINGS_COMMAND,
        themeCommand: OPEN_THEME_COMMAND,
        interactive: { nonce, controlsPanel, controlsScript },
      });
    } catch (err) {
      this.lastSvg = '';
      const base = err instanceof Error ? err.message : String(err);
      const details = (err as { errors?: string[] }).errors;
      const msg = details?.length ? `${base}\n${details.join('\n')}` : base;
      this.panel.webview.html = buildDiagramFrame({
        filename,
        notation: 'BPMN Process',
        errorMsg: msg,
        themeId,
      });
    }
  }
}
