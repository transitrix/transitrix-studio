import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import * as vscode from 'vscode';
import { getBaseResetCss } from '../../packages/diagrams/src/theme/index.js';
import { rasterizeSvgToPng } from './raster.js';

import type { LayoutMetrics, ValidationReport } from './types.js';

export type CompileFn = (yaml: string) => Promise<{ xml: string; metrics: LayoutMetrics; validation: ValidationReport }>;

/** Where rule `docUrl` references resolve — the project docs on GitHub. */
const DOCS_BASE_URL = 'https://github.com/transitrix/transitrix-studio/blob/main';
/** Accepts only repo-relative `docs/….md` paths with an optional `#anchor`. */
const VALIDATION_DOC_PATH = /^docs\/[A-Za-z0-9._/-]+\.md(#[A-Za-z0-9._-]+)?$/;

/** Webview: bpmn-js viewer + compile loop. */
export class CervinPreview {
  readonly panelTitle = 'BPMN Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;
  private lastSourceUri: vscode.Uri | undefined;
  private pendingExport: { resolve: (svg: string) => void; reject: () => void } | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly compile: CompileFn,
  ) {}

  isShowingDocument(uri: vscode.Uri): boolean {
    return this.panel != null && this.trackedUri === uri.toString();
  }

  async showOrReveal(doc: vscode.TextDocument): Promise<void> {
    this.trackedUri = doc.uri.toString();
    this.lastSourceUri = doc.uri;

    const showOptions = {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false,
    } as const;

    if (this.panel) {
      this.panel.title = `${this.panelTitle} — ${path.basename(doc.fileName)}`;
      this.panel.reveal(showOptions.viewColumn, true);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'cervinPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        showOptions,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
        },
      );

      this.panel.webview.html = this.buildHtml(this.panel.webview);

      this.panel.webview.onDidReceiveMessage((msg: { type?: string; svg?: string; url?: string }) => {
        if (msg?.type === 'diagram-ready' && this.panel && this.trackedUri) {
          const fp = path.basename(vscode.Uri.parse(this.trackedUri).fsPath);
          this.panel.title = `${this.panelTitle} — ${fp}`;
        }
        if (msg?.type === 'export-svg' && typeof msg.svg === 'string' && this.pendingExport) {
          this.pendingExport.resolve(msg.svg);
        }
        if (msg?.type === 'open-docs') {
          this.openDocs(msg.url);
        }
      });

      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.trackedUri = undefined;
      });
    }

    await this.pushDocument(doc);
  }

  /**
   * Opens a validation-doc reference (the findings list forwards the rule's
   * `docUrl`). The value is a trusted, repo-relative `docs/….md#anchor`, but
   * it is validated strictly here — rejecting traversal and any non-`docs`
   * target — before being handed to the browser.
   */
  private openDocs(rawUrl: unknown): void {
    if (typeof rawUrl !== 'string') return;
    if (rawUrl.includes('..') || !VALIDATION_DOC_PATH.test(rawUrl)) return;
    void vscode.env.openExternal(vscode.Uri.parse(`${DOCS_BASE_URL}/${rawUrl}`));
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
    await this.pushDocument(doc);
  }

  async saveAsPng(): Promise<void> {
    if (!this.panel) {
      vscode.window.showWarningMessage('Open a BPMN preview first.');
      return;
    }
    const svg = await this.requestSvgFromWebview();
    if (!svg) return;

    const preparedSvg = await this.prepareBpmnSvg(svg);
    let png: Buffer;
    try {
      png = await rasterizeSvgToPng(preparedSvg);
    } catch (e) {
      vscode.window.showErrorMessage(`PNG export failed: ${(e as Error).message ?? String(e)}`);
      return;
    }

    const stem = this.lastSourceUri
      ? path.basename(this.lastSourceUri.fsPath).replace(/\.[^.]+\.transitrix\.yaml$|\.cervin\.yaml$/, '')
      : 'diagram';
    const filename = `${stem}.png`;
    const defaultUri = this.lastSourceUri
      ? vscode.Uri.file(path.join(path.dirname(this.lastSourceUri.fsPath), filename))
      : vscode.Uri.file(filename);
    const target = await vscode.window.showSaveDialog({ defaultUri, filters: { 'PNG Image': ['png'] } });
    if (!target) return;

    await vscode.workspace.fs.writeFile(target, png);
    vscode.window.showInformationMessage(`Saved: ${path.basename(target.fsPath)}`);
  }

  private requestSvgFromWebview(): Promise<string | undefined> {
    return new Promise((resolve) => {
      if (!this.panel) { resolve(undefined); return; }

      const timer = setTimeout(() => {
        this.pendingExport = undefined;
        vscode.window.showErrorMessage('BPMN PNG export timed out — render a diagram first.');
        resolve(undefined);
      }, 5000);

      this.pendingExport = {
        resolve: (s) => { clearTimeout(timer); this.pendingExport = undefined; resolve(s); },
        reject: () => { clearTimeout(timer); this.pendingExport = undefined; resolve(undefined); },
      };

      void this.panel.webview.postMessage({ type: 'request-svg' });
    });
  }

  private async prepareBpmnSvg(svg: string): Promise<string> {
    const mediaDir = vscode.Uri.joinPath(this.extensionUri, 'media').fsPath;
    const [diagramCss, bpmnCss] = await Promise.all([
      fsp.readFile(path.join(mediaDir, 'diagram-js.css'), 'utf-8').catch(() => ''),
      fsp.readFile(path.join(mediaDir, 'bpmn-js.css'), 'utf-8').catch(() => ''),
    ]);
    return svg.replace(/(<svg\b[^>]*>)/, `$1<style>${diagramCss}${bpmnCss}</style>`);
  }

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    try {
      const { xml, metrics, validation } = await this.compile(doc.getText());
      void this.panel.webview.postMessage({ type: 'update', xml, metrics, validation });
    } catch (e) {
      const err = e as Error & { errors?: string[] };
      const lines = err.errors?.length ? err.errors.join('\n') : '';
      void this.panel.webview.postMessage({
        type: 'compile-error',
        message: [err.message, lines].filter(Boolean).join('\n'),
      });
    }
  }

  private buildHtml(webview: vscode.Webview): string {
    const media = vscode.Uri.joinPath(this.extensionUri, 'media');
    const cspSource = webview.cspSource;
    const script = webview.asWebviewUri(vscode.Uri.joinPath(media, 'viewer.js'));
    const cssDiagram = webview.asWebviewUri(vscode.Uri.joinPath(media, 'diagram-js.css'));
    const cssBpmn = webview.asWebviewUri(vscode.Uri.joinPath(media, 'bpmn-js.css'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource}; font-src ${cspSource}; img-src ${cspSource} blob: data:; connect-src ${cspSource} https:;">
  <link rel="stylesheet" href="${cssDiagram}" />
  <link rel="stylesheet" href="${cssBpmn}" />
  <style>
    ${getBaseResetCss()}
    html,body{width:100%;height:100%;overflow:hidden;}
    /* flex chain so layout height reaches #canvas — otherwise diagram-js measures ~0px */
    body{display:flex;flex-direction:column;min-height:0;}
    #toolbar{flex-shrink:0;border-bottom:1px solid var(--vscode-panel-border);padding:6px 8px;font-family:var(--vscode-font-family);font-size:12px;display:flex;flex-direction:column;gap:6px;}
    .toolbar-btn{cursor:pointer;user-select:none;font-size:11px;padding:1px 8px;border-radius:4px;color:var(--vscode-button-foreground,#fff);background:var(--vscode-button-background,#007acc);border:none;white-space:nowrap;align-self:flex-end;}
    .toolbar-btn:hover:not(:disabled){opacity:0.85;}
    .toolbar-btn:disabled{opacity:0.4;cursor:default;}
    #toolbar-message{flex-shrink:0;}
    #metrics-display{display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--vscode-descriptionForeground);}
    .metric{display:flex;align-items:center;gap:4px;}
    .metric-label{font-weight:600;opacity:0.85;}
    .metric-value{font-family:monospace;}
    .metric[data-tooltip]:hover::after{content:attr(data-tooltip);position:absolute;background:var(--vscode-editorHoverWidget-background);color:var(--vscode-editorHoverWidget-foreground);border:1px solid var(--vscode-editorHoverWidget-border);border-radius:3px;padding:4px 8px;font-size:11px;white-space:nowrap;z-index:1000;bottom:100%;left:0;margin-bottom:4px;}
    #err{flex-shrink:0;white-space:pre-wrap;color:var(--vscode-errorForeground);}
    #canvas{
      flex:1;min-height:0;width:100%;position:relative;overflow:hidden;
    }
    #canvas>.djs-container.djs-parent{
      position:absolute!important;inset:0;width:auto!important;height:auto!important;
      overflow:hidden;
    }
    #findings{flex:0 0 auto;max-height:30%;overflow-y:auto;border-top:1px solid var(--vscode-panel-border);display:none;}
    #findings.has-findings{display:block;}
    .findings-header{padding:8px;font-weight:600;font-size:12px;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);}
    .findings-header .finding-counts{display:flex;gap:12px;font-size:11px;color:var(--vscode-descriptionForeground);}
    .finding-count{display:flex;align-items:center;gap:4px;}
    .finding-count.error{color:var(--vscode-errorForeground);font-weight:600;}
    .finding-count.warning{color:var(--vscode-problemsWarningIcon-foreground);font-weight:600;}
    .findings-list{display:flex;flex-direction:column;}
    .finding-item{padding:8px;border-bottom:1px solid var(--vscode-panel-border);font-size:11px;cursor:pointer;user-select:text;}
    .finding-item:hover{background:var(--vscode-list-hoverBackground);}
    .finding-item.error{border-left:3px solid var(--vscode-errorForeground);}
    .finding-item.warning{border-left:3px solid var(--vscode-problemsWarningIcon-foreground);}
    .finding-item.info{border-left:3px solid var(--vscode-problemsInfoIcon-foreground);}
    .finding-id{font-family:monospace;font-weight:600;margin-bottom:2px;}
    .finding-message{color:var(--vscode-foreground);}
    .finding-hint{color:var(--vscode-descriptionForeground);font-size:10px;margin-top:2px;}
    .layout{display:flex;flex-direction:column;flex:1;min-height:0;width:100%;}
    .muted{opacity:0.85;}
  </style>
</head>
<body>
  <div class="layout">
    <div id="toolbar">
      <span id="toolbar-message" class="muted">Save YAML to refresh the preview.</span>
      <div id="metrics-display" hidden></div>
      <button id="save-png-btn" class="toolbar-btn" title="Save the current diagram as a .png file" disabled>Save .png</button>
    </div>
    <pre id="err" hidden></pre>
    <div id="findings">
      <div class="findings-header">
        <span>Validation Findings</span>
        <div class="finding-counts">
          <div class="finding-count error"><span id="error-count">0</span> errors</div>
          <div class="finding-count warning"><span id="warning-count">0</span> warnings</div>
        </div>
      </div>
      <div class="findings-list" id="findings-list"></div>
    </div>
    <div id="canvas"></div>
  </div>
  <script src="${script}"></script>
</body>
</html>`;
  }
}
