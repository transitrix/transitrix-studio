import * as path from 'node:path';
import * as vscode from 'vscode';

/** VS Code command IDs for the PlantUML preview. */
export const PREVIEW_PUML_COMMAND = 'transitrixStudio.previewPuml';

/** Detects `.puml` files (also accepts `.plantuml`). */
export function isPumlFile(doc: vscode.TextDocument): boolean {
  const n = doc.fileName;
  return n.endsWith('.puml') || n.endsWith('.plantuml');
}

/**
 * PlantUML `.puml` / `.plantuml` file preview powered by @plantuml/core
 * (browser-side rendering, no Java or Graphviz binary required).
 *
 * Rendering runs inside the webview via plantuml-client.js which imports
 * plantuml.js as an ES module. The extension host prepares the diagram
 * source (Smetana pragma + optional Transitrix theme injection) and delivers
 * it over postMessage. The webview signals readiness and the host flushes
 * any pending source.
 */
export class PlantUMLPreview {
  readonly panelTitle = 'PlantUML Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;
  private webviewReady = false;
  private pendingSource: string | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  isShowingDocument(uri: vscode.Uri): boolean {
    return this.panel != null && this.trackedUri === uri.toString();
  }

  async showOrReveal(doc: vscode.TextDocument): Promise<void> {
    this.trackedUri = doc.uri.toString();

    if (this.panel) {
      this.panel.title = `${this.panelTitle} — ${path.basename(doc.fileName)}`;
      this.panel.reveal(vscode.ViewColumn.Beside, true);
    } else {
      this.webviewReady = false;
      const mediaDir = vscode.Uri.joinPath(this.extensionUri, 'media', 'plantuml');

      this.panel = vscode.window.createWebviewPanel(
        'transitrixPumlPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [mediaDir],
        },
      );

      this.panel.webview.onDidReceiveMessage((msg: unknown) => {
        if (isReadyMessage(msg)) {
          this.webviewReady = true;
          if (this.pendingSource !== undefined) {
            void this.panel?.webview.postMessage({ type: 'render', source: this.pendingSource });
            this.pendingSource = undefined;
          }
        }
      });

      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.trackedUri = undefined;
        this.webviewReady = false;
        this.pendingSource = undefined;
      });

      this.panel.webview.html = buildHtml(this.panel.webview, mediaDir);
    }

    await this.sendDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
    await this.sendDocument(doc);
  }

  private async sendDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const source = await prepareSource(doc);
    if (this.webviewReady) {
      void this.panel.webview.postMessage({ type: 'render', source });
    } else {
      this.pendingSource = source;
    }
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function isReadyMessage(msg: unknown): boolean {
  return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === 'ready';
}

/**
 * Prepares the source to send to the webview:
 * - Injects `!pragma layout smetana` (pure-Java layout, no Graphviz binary).
 * - Injects the Transitrix theme if `diagrams/transitrix-theme.puml` exists
 *   in the workspace and the diagram doesn't already set a theme.
 */
async function prepareSource(doc: vscode.TextDocument): Promise<string> {
  let source = doc.getText();

  if (!source.includes('!pragma layout')) {
    source = injectAfterStartuml(source, '!pragma layout smetana');
  }

  const themeContent = await readWorkspaceTheme();
  if (
    themeContent &&
    !source.includes('!theme') &&
    !source.includes('transitrix-theme.puml') &&
    !source.includes('skinparam')
  ) {
    source = injectAfterStartuml(source, themeContent);
  }

  return source;
}

function injectAfterStartuml(source: string, toInject: string): string {
  const m = /^@startuml\b[^\n]*/m.exec(source);
  if (!m) return source;
  const idx = m.index + m[0].length;
  return source.slice(0, idx) + '\n' + toInject + source.slice(idx);
}

async function readWorkspaceTheme(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  for (const folder of folders) {
    const uri = vscode.Uri.joinPath(folder.uri, 'diagrams', 'transitrix-theme.puml');
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const raw = Buffer.from(bytes).toString('utf-8');
      // Strip @startuml/@enduml wrapper — the theme file is an include, not a
      // standalone diagram.
      return raw
        .replace(/^@startuml\b[^\n]*\n?/m, '')
        .replace(/\n?@enduml\b[^\n]*$/m, '')
        .trim();
    } catch {
      // File absent in this folder — try next.
    }
  }
  return undefined;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtml(webview: vscode.Webview, mediaDir: vscode.Uri): string {
  const cspSource = webview.cspSource;
  const vizUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaDir, 'viz-global.js'));
  const clientUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaDir, 'plantuml-client.js'));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src ${escHtml(cspSource)}; img-src data: blob:;">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body {
      display: flex; flex-direction: column;
      background: var(--vscode-editor-background, #fff);
      color: var(--vscode-editor-foreground, #000);
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: var(--vscode-font-size, 13px);
    }
    #puml-toolbar {
      flex-shrink: 0;
      padding: 6px 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #e2e8f0);
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #64748b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #puml-loading {
      display: none;
      padding: 16px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #64748b);
    }
    #puml-error {
      display: none;
      margin: 12px 16px;
      border: 1px solid var(--vscode-inputValidation-errorBorder, #b91c1c);
      border-radius: 6px;
    }
    #puml-error-title {
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-errorForeground, #b91c1c);
    }
    #puml-error-body {
      padding: 0 12px 8px;
      font-size: 11px;
      color: var(--vscode-errorForeground, #b91c1c);
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family, monospace);
      max-height: 200px;
      overflow-y: auto;
    }
    #puml-error-hint {
      padding: 0 12px 10px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #64748b);
    }
    #puml-output {
      flex: 1;
      overflow: auto;
      padding: 16px;
    }
    #puml-output svg {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <div id="puml-toolbar">PlantUML Preview — loading engine…</div>
  <div id="puml-loading">Rendering diagram…</div>
  <div id="puml-error">
    <div id="puml-error-title"></div>
    <pre id="puml-error-body"></pre>
    <div id="puml-error-hint"></div>
  </div>
  <div id="puml-output"></div>

  <!-- Graphviz layout engine — must load before plantuml.js -->
  <script src="${escHtml(vizUri.toString())}"></script>
  <!-- PlantUML client module (statically imports plantuml.js from same dir) -->
  <script type="module" src="${escHtml(clientUri.toString())}"></script>
</body>
</html>`;
}
