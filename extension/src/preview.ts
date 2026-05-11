import * as path from 'node:path';
import * as vscode from 'vscode';
import { getBaseResetCss } from '../../packages/diagrams/src/theme/index.js';

import type { LayoutMetrics, ValidationReport } from './types.js';

export type CompileFn = (yaml: string) => Promise<{ xml: string; metrics: LayoutMetrics; validation: ValidationReport }>;

/** Webview: bpmn-js viewer + compile loop. */
export class CervinPreview {
  readonly panelTitle = 'Cervin Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly compile: CompileFn,
  ) {}

  isShowingDocument(uri: vscode.Uri): boolean {
    return this.panel != null && this.trackedUri === uri.toString();
  }

  async showOrReveal(doc: vscode.TextDocument): Promise<void> {
    this.trackedUri = doc.uri.toString();

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

      this.panel.webview.onDidReceiveMessage((msg: { type?: string }) => {
        if (msg?.type === 'diagram-ready' && this.panel && this.trackedUri) {
          const fp = path.basename(vscode.Uri.parse(this.trackedUri).fsPath);
          this.panel.title = `${this.panelTitle} — ${fp}`;
        }
      });

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
    content="default-src 'none'; style-src ${cspSource}; script-src ${cspSource}; font-src ${cspSource}; img-src ${cspSource} blob: data:;">
  <link rel="stylesheet" href="${cssDiagram}" />
  <link rel="stylesheet" href="${cssBpmn}" />
  <style>
    ${getBaseResetCss()}
    html,body{width:100%;height:100%;overflow:hidden;}
    /* flex chain so layout height reaches #canvas — otherwise diagram-js measures ~0px */
    body{display:flex;flex-direction:column;min-height:0;}
    #toolbar{flex-shrink:0;border-bottom:1px solid var(--vscode-panel-border);padding:6px 8px;font-family:var(--vscode-font-family);font-size:12px;display:flex;flex-direction:column;gap:6px;}
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
    .finding-item{padding:8px;border-bottom:1px solid var(--vscode-panel-border);font-size:11px;cursor:pointer;}
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
