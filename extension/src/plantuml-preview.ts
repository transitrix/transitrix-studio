import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
import { savePngFromSvg, copyPngFromSvg } from './png-export.js';
import { genNonce } from './preview-controls.js';

/** Detects `.puml` files (also accepts `.plantuml`). */
export function isPumlFile(doc: vscode.TextDocument): boolean {
  const n = doc.fileName;
  return n.endsWith('.puml') || n.endsWith('.plantuml');
}

const SAVE_SVG_COMMAND = 'transitrixStudio.savePumlAsSvg';
const SAVE_PNG_COMMAND = 'transitrixStudio.savePumlAsPng';
const COPY_PNG_COMMAND = 'transitrixStudio.copyPumlAsPng';

/**
 * PlantUML `.puml` / `.plantuml` file preview powered by @plantuml/core
 * (browser-side rendering, no Java or Graphviz binary required).
 *
 * Rendering runs inside the webview via plantuml-client.js which imports
 * plantuml.js as an ES module. The extension host prepares the diagram
 * source (Smetana pragma + optional Transitrix theme injection) and delivers
 * it over postMessage. The webview signals readiness and the host flushes
 * any pending source.
 *
 * The chrome (toolbar, save/copy/zoom/theme, title toggle) is the shared
 * `buildDiagramFrame` shell (vkgeorgia/strategy#597) — only the canvas
 * scaffold (loading/error/output divs) and the wasm engine's own script tags
 * are PlantUML-specific. Since rendering happens webview-side and
 * asynchronously, the rendered SVG is pushed back to the host via a
 * `rendered` postMessage so Save/Copy can read it synchronously, the same
 * way every other preview reads its host-held `lastSvg`.
 */
export class PlantUMLPreview {
  readonly panelTitle = 'PlantUML Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;
  private webviewReady = false;
  private pendingSource: { source: string; seq: number } | undefined;
  private lastSvg = '';
  // Bumped on every sendDocument() call and echoed back by the webview in its
  // `rendered` message. The wasm render is async and multiple can be
  // in-flight at once (e.g. switching the tracked file mid-render) — without
  // this, a slow render for a since-superseded source could resolve last and
  // overwrite `lastSvg` (and the canvas) with the wrong file's diagram.
  private renderSeq = 0;

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
          enableCommandUris: [SAVE_SVG_COMMAND, SAVE_PNG_COMMAND, COPY_PNG_COMMAND, OPEN_THEME_COMMAND],
        },
      );

      this.panel.webview.onDidReceiveMessage((msg: unknown) => {
        if (isReadyMessage(msg)) {
          this.webviewReady = true;
          if (this.pendingSource !== undefined) {
            void this.panel?.webview.postMessage({ type: 'render', source: this.pendingSource.source, seq: this.pendingSource.seq });
            this.pendingSource = undefined;
          }
        } else if (isRenderedMessage(msg)) {
          // Ignore a stale render that lost the race against a newer one.
          if (msg.seq === this.renderSeq) this.lastSvg = msg.svg;
        }
      });

      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.trackedUri = undefined;
        this.webviewReady = false;
        this.pendingSource = undefined;
        this.lastSvg = '';
      });

      this.panel.webview.html = this.buildFrameHtml(this.panel.webview, mediaDir, path.basename(doc.fileName));
    }

    await this.sendDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
    await this.sendDocument(doc);
  }

  /** Re-render the tracked document — used when the theme setting changes.
   *  Rebuilds the whole frame (the new theme is baked into the served HTML),
   *  so the wasm engine re-initialises the same way it does on first open. */
  async refreshConfig(): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(this.trackedUri));
    const mediaDir = vscode.Uri.joinPath(this.extensionUri, 'media', 'plantuml');
    this.webviewReady = false;
    this.pendingSource = undefined;
    this.panel.webview.html = this.buildFrameHtml(this.panel.webview, mediaDir, path.basename(doc.fileName));
    await this.sendDocument(doc);
  }

  private async sendDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    this.renderSeq += 1;
    const seq = this.renderSeq;
    // The in-flight source no longer matches whatever SVG the webview last
    // rendered — clear it so an export mid-refresh can't hand back stale
    // (or a different file's) content. The webview pushes a fresh one back
    // once it finishes rendering.
    this.lastSvg = '';
    const source = await prepareSource(doc);
    // A newer sendDocument() call ran while prepareSource() was awaiting —
    // this one is already stale, don't send it.
    if (seq !== this.renderSeq) return;
    if (this.webviewReady) {
      void this.panel.webview.postMessage({ type: 'render', source, seq });
    } else {
      this.pendingSource = { source, seq };
    }
  }

  private pngTarget(): { rawSvg: string | undefined; themeId: ThemeId; emptyMessage: string } {
    return {
      rawSvg: this.lastSvg || undefined,
      themeId: vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix'),
      emptyMessage: 'No diagram rendered yet. Open a .puml/.plantuml file with valid PlantUML source first.',
    };
  }

  saveAsPng(): Promise<void> {
    return savePngFromSvg({ ...this.pngTarget(), sourceUri: this.sourceUri(), stripExt: /\.(puml|plantuml)$/ });
  }

  copyAsPng(): Promise<void> {
    return copyPngFromSvg(this.pngTarget());
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a .puml/.plantuml file with valid PlantUML source first.');
      return;
    }
    const sourceUri = this.sourceUri();
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.(puml|plantuml)$/, '')
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

  private sourceUri(): vscode.Uri | undefined {
    return this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
  }

  private buildFrameHtml(webview: vscode.Webview, mediaDir: vscode.Uri, filename: string): string {
    const vizUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaDir, 'viz-global.js'));
    const clientUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaDir, 'plantuml-client.js'));
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    const nonce = genNonce();

    const bodyContent = `<div id="puml-loading">Rendering diagram…</div>
    <div id="puml-error">
      <div id="puml-error-title"></div>
      <pre id="puml-error-body"></pre>
      <div id="puml-error-hint"></div>
    </div>
    <div id="puml-output"></div>`;

    return buildDiagramFrame({
      filename,
      notation: 'PlantUML',
      bodyContent,
      themeId,
      extraStyles: PUML_EXTRA_STYLES,
      saveSvgCommand: SAVE_SVG_COMMAND,
      savePngCommand: SAVE_PNG_COMMAND,
      copyPngCommand: COPY_PNG_COMMAND,
      themeCommand: OPEN_THEME_COMMAND,
      interactive: {
        nonce,
        controlsPanel: '',
        controlsScript: '',
        extraScripts: [
          { src: vizUri.toString() },
          { src: clientUri.toString(), module: true },
        ],
        allowWasmRendering: true,
      },
    });
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function isReadyMessage(msg: unknown): boolean {
  return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === 'ready';
}

function isRenderedMessage(msg: unknown): msg is { type: 'rendered'; svg: string; seq: number } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as Record<string, unknown>).type === 'rendered' &&
    typeof (msg as Record<string, unknown>).svg === 'string' &&
    typeof (msg as Record<string, unknown>).seq === 'number'
  );
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

/** Loading/error card styling for the PlantUML canvas scaffold. The toolbar,
 *  toggle, zoom, and save/theme controls come from the shared frame CSS. */
const PUML_EXTRA_STYLES = `
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
`;
