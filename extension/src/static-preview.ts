import * as path from 'node:path';
import * as vscode from 'vscode';
import { prepareSvgForExport, type ThemeId } from './diagram-frame.js';
import { savePngFromSvg, copyPngFromSvg } from './png-export.js';

/**
 * Shared lifecycle for document-bound static webview previews. Subclasses
 * either override {@link renderHtml} (simple case) or override
 * {@link pushDocument} (when async loading is required before rendering).
 */
export abstract class StaticPreview {
  protected panel: vscode.WebviewPanel | undefined;
  protected trackedUri: string | undefined;

  abstract readonly panelTitle: string;
  protected abstract readonly viewType: string;
  protected abstract readonly enableCommandUris: string[];

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
        this.viewType,
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          enableScripts: false,
          retainContextWhenHidden: true,
          enableCommandUris: this.enableCommandUris,
        },
      );
      this.panel.onDidDispose(() => { this.panel = undefined; this.trackedUri = undefined; });
    }
    await this.pushDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
    await this.pushDocument(doc);
  }

  async refreshConfig(): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(this.trackedUri));
    await this.pushDocument(doc);
  }

  protected async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    this.panel.webview.html = this.renderHtml(doc.getText(), path.basename(doc.fileName));
  }

  // Non-abstract: subclasses that override pushDocument don't need to implement this.
  // Subclasses that use the default pushDocument must override this.
  protected renderHtml(_yamlText: string, _filename: string): string {
    throw new Error(`${this.constructor.name}: override pushDocument or renderHtml`);
  }
}

/**
 * Extends {@link StaticPreview} with SVG save/export helpers. Subclasses set
 * {@link lastSvg} inside {@link renderHtml} before returning the HTML frame.
 */
export abstract class StaticSvgPreview extends StaticPreview {
  protected lastSvg = '';

  protected abstract readonly stripExt: RegExp;
  protected abstract readonly emptyMessage: string;

  protected pngTarget(): { rawSvg: string | undefined; themeId: ThemeId; emptyMessage: string } {
    return {
      rawSvg: this.lastSvg || undefined,
      themeId: vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix'),
      emptyMessage: this.emptyMessage,
    };
  }

  saveAsPng(): Promise<void> {
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    return savePngFromSvg({ ...this.pngTarget(), sourceUri, stripExt: this.stripExt });
  }

  copyAsPng(): Promise<void> {
    return copyPngFromSvg(this.pngTarget());
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage(this.emptyMessage);
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(this.stripExt, '')
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
}
