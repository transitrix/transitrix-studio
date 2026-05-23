import * as cp from 'node:child_process';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildDiagramFrame } from './diagram-frame.js';
import { todayIso } from './svg-title-block.js';

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const BLOCKS_STYLES = `
html { height: 100%; }
body { height: 100%; display: flex; flex-direction: column; }
#canvas { flex: 1; min-height: 0; overflow: auto; }
.blocks-svg-wrap { display: inline-flex; flex-direction: column; gap: 24px; padding: 8px 16px; min-width: 100%; }
.blocks-svg-wrap svg { display: block; }
`;

const BACKEND_TIMEOUT_MS = 30_000;

const PYTHON_FIX_PROMPT = `Transitrix Studio needs Python 3 to render block diagrams, but it was not found on this system.

Please install it:

• macOS:   brew install python3
           or download from https://python.org/downloads
• Windows: https://python.org/downloads
           ✓ Check "Add Python to PATH" during installation
           The extension uses the Python Launcher (py.exe) by default on Windows —
           it is installed automatically with Python and is the most reliable option.
• Linux:   sudo apt install python3
           (or: sudo dnf install python3 / sudo pacman -S python)

After installing, either restart VS Code so the new PATH is picked up,
or open VS Code Settings, search for "transitrix.pythonPath",
and set it to the full path to the Python executable.
Examples: /usr/bin/python3
          C:\\Python311\\python.exe`;

interface BackendResult {
  ok: boolean;
  svgs?: string[];
  message?: string;
  details?: string[];
  fixPrompt?: string;
}

export class BlocksPreview {
  private panel: vscode.WebviewPanel | undefined;
  private currentUri: string | undefined;
  private lastSvgs: string[] = [];

  constructor(private readonly extensionPath: string) {}

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvgs.length) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.blocks.transitrix.txt file first.');
      return;
    }
    const sourceUri = this.currentUri ? vscode.Uri.parse(this.currentUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.blocks\.transitrix\.txt$/, '')
      : 'diagram';
    const defaultUri = sourceUri
      ? vscode.Uri.file(path.join(path.dirname(sourceUri.fsPath), `${stem}.svg`))
      : vscode.Uri.file(`${stem}.svg`);
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { 'SVG Image': ['svg'] },
    });
    if (!target) return;
    // ascii mode always produces one SVG; join with gap if multiple
    const content = Buffer.from(this.lastSvgs.join('\n\n'), 'utf-8');
    await vscode.workspace.fs.writeFile(target, content);
    vscode.window.showInformationMessage(`Saved: ${path.basename(target.fsPath)}`);
  }

  async showOrReveal(doc: vscode.TextDocument): Promise<void> {
    if (this.panel && this.currentUri === doc.uri.toString()) {
      this.panel.reveal();
      return;
    }
    if (this.panel) {
      this.panel.dispose();
    }
    this.panel = vscode.window.createWebviewPanel(
      'blocksPreview',
      `Blocks: ${path.basename(doc.fileName)}`,
      vscode.ViewColumn.Beside,
      { enableScripts: false, retainContextWhenHidden: true, enableCommandUris: ['transitrixStudio.saveBlocksAsSvg'] },
    );
    this.currentUri = doc.uri.toString();
    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.currentUri = undefined;
    });
    await this.render(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel || this.currentUri !== doc.uri.toString()) return;
    await this.render(doc);
  }

  private async render(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const filename = path.basename(doc.fileName);
    const source = doc.getText();

    let html: string;
    try {
      const result = await this.runBackend(source);
      if (!result.ok) {
        this.lastSvgs = [];
        const detail = result.details?.join('\n') ?? '';
        html = buildDiagramFrame({
          filename,
          notation: 'blocks',
          errorMsg: result.message ?? 'Blocks backend error',
          warnings: detail ? [detail] : [],
          fixPrompt: result.fixPrompt,
        });
      } else {
        const svgs = result.svgs ?? [];
        this.lastSvgs = svgs;
        const today = todayIso();
        // The blocks backend emits one SVG per top-level block, joined in
        // `.blocks-svg-wrap`. Embedding the title into each SVG would multiply
        // captions, so it lives in an HTML header above the wrapper — the same
        // class as the SVG variant, the Title toggle picks both up via
        // TITLE_TOGGLE_CSS in diagram-frame.ts.
        const titleHtml = `<div class="diagram-title-block diagram-title-block-html">
  <div class="text-header">Block diagram</div>
  <div class="text-secondary">${escHtml(filename)}</div>
  <div class="text-secondary">${escHtml(today)}</div>
</div>`;
        const svgContent = `${titleHtml}<div class="blocks-svg-wrap">${svgs.join('\n')}</div>`;
        html = buildDiagramFrame({
          filename,
          notation: 'blocks',
          svgContent,
          extraStyles: BLOCKS_STYLES,
          saveSvgCommand: 'transitrixStudio.saveBlocksAsSvg',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      html = buildDiagramFrame({ filename, notation: 'blocks', errorMsg: msg });
    }
    this.panel.webview.html = html;
  }

  private runBackend(source: string): Promise<BackendResult> {
    return new Promise((resolve) => {
      const scriptPath = path.join(this.extensionPath, 'backends', 'blocks', 'blocks_stdio.py');
      const cfg = vscode.workspace.getConfiguration('transitrix');
      const defaultPython = process.platform === 'win32' ? 'py' : 'python3';
      const pythonPath = cfg.get<string>('pythonPath') || defaultPython;
      const svgbobPath = cfg.get<string>('svgbobPath') || 'svgbob_cli';
      const payload = JSON.stringify({ mode: 'ascii', source, svgbobCommand: svgbobPath });

      // `cp.spawn` does not throw synchronously when the executable is
      // missing — ENOENT surfaces via the `'error'` event handler below.
      // The previous try/catch around the spawn was therefore dead code and
      // its `resolve(...)` path was never taken.
      const proc = cp.spawn(pythonPath, [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        proc.kill();
        resolve({ ok: false, message: 'Blocks backend timed out after 30 s.' });
      }, BACKEND_TIMEOUT_MS);

      proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (err.code === 'ENOENT') {
          resolve({
            ok: false,
            message: `Python not found at "${pythonPath}". See the prompt below to install it.`,
            fixPrompt: PYTHON_FIX_PROMPT,
          });
        } else {
          resolve({ ok: false, message: `Backend process error: ${err.message}` });
        }
      });

      proc.on('close', () => {
        clearTimeout(timer);
        if (!stdout) {
          resolve({
            ok: false,
            message: 'Backend produced no output.',
            details: stderr ? [stderr.slice(0, 400)] : [],
          });
          return;
        }
        try {
          resolve(JSON.parse(stdout) as BackendResult);
        } catch {
          resolve({
            ok: false,
            message: `Backend output is not valid JSON: ${stdout.slice(0, 200)}`,
            details: stderr ? [stderr.slice(0, 200)] : [],
          });
        }
      });

      proc.stdin?.write(payload);
      proc.stdin?.end();
    });
  }
}
