import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
import { savePngFromSvg, copyPngFromSvg } from './png-export.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import {
  validateNestedBlocks,
  layoutNestedBlocks,
  iterateBlocks,
  type BlocksFile,
  type BlocksLayout,
} from '../../packages/diagrams/src/blocks/index.js';
import { coerceDatesToIsoStrings } from '../../packages/diagrams/src/yaml-normalize.js';
import { renderBlocksLayoutSvg } from '../../packages/diagrams/src/webview/render-blocks.js';

// Pad reserved around the diagram; mirrors `PAD` in the shared emitter
// (`render-blocks.ts`) so the VS Code title block lines up with the body.
const PAD = 24;

/**
 * VS Code wrapper around the shared {@link renderBlocksLayoutSvg} emitter. Adds
 * the rich title block (reserving `topInset` for it) and leaves the body — node
 * rects, headers, level classes — to the single source of truth in
 * `@transitrix/diagrams`. No embedded CSS: the webview supplies it live and the
 * export path embeds it via `prepareSvgForExport`.
 */
function layoutToSvg(
  layout: BlocksLayout,
  filename?: string,
  date?: string,
  version?: string,
): string {
  const showTitle = filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;
  const titleSvg = showTitle ? titleBlockSvg('Nested Blocks', filename!, date!, PAD, PAD, version) : '';
  return renderBlocksLayoutSvg(layout, { topInset: titleH, title: titleSvg });
}

export class BlocksPreview {
  readonly panelTitle = 'Blocks Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;
  private lastSvg = '';

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
        'blocksPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          enableScripts: false,
          retainContextWhenHidden: true,
          enableCommandUris: ['transitrixStudio.saveBlocksAsSvg', 'transitrixStudio.saveBlocksAsPng', 'transitrixStudio.copyBlocksAsPng', 'transitrixStudio.changeTheme'],
        },
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

  async refreshConfig(): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(this.trackedUri));
    await this.pushDocument(doc);
  }

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    this.panel.webview.html = this.buildHtml(doc.getText(), path.basename(doc.fileName));
  }

  private buildHtml(yamlText: string, filename: string): string {
    let svgContent = '';
    let errorMsg = '';
    let warnings: string[] = [];

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      const v = validateNestedBlocks(parsed);
      warnings = v.warnings.map((w) => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map((e) => `${e.code}: ${e.message}`).join('\n');
      } else {
        const file = parsed as BlocksFile;
        const raw = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
        const nb =
          (file as unknown as { nested_blocks?: { version?: unknown; date?: unknown } })
            .nested_blocks ?? {};
        const docVersion = typeof nb.version === 'string' ? nb.version : undefined;
        const docDate = (typeof raw['generated_at'] === 'string' ? raw['generated_at'] : undefined)
          ?? (typeof nb.date === 'string' ? nb.date : undefined)
          ?? todayIso();
        const layout = layoutNestedBlocks(file);
        svgContent = layoutToSvg(layout, filename, docDate, docVersion);

        // BL-008 / BL-009 may still be present even when the document is
        // valid; surface them through the diagram-frame warnings channel.
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    this.lastSvg = svgContent;

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({
      filename,
      notation: 'Nested Blocks',
      svgContent,
      errorMsg,
      warnings,
      themeId,
      saveSvgCommand: 'transitrixStudio.saveBlocksAsSvg',
      savePngCommand: 'transitrixStudio.saveBlocksAsPng',
      copyPngCommand: 'transitrixStudio.copyBlocksAsPng',
      themeCommand: OPEN_THEME_COMMAND,
    });
  }

  private pngTarget() {
    return {
      rawSvg: this.lastSvg || undefined,
      themeId: vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix'),
      emptyMessage: 'No diagram rendered yet. Open a *.blocks.transitrix.yaml file first.',
    };
  }

  saveAsPng(): Promise<void> {
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    return savePngFromSvg({ ...this.pngTarget(), sourceUri, stripExt: /\.blocks\.transitrix\.yaml$/ });
  }

  copyAsPng(): Promise<void> {
    return copyPngFromSvg(this.pngTarget());
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage(
        'No diagram rendered yet. Open a *.blocks.transitrix.yaml file first.',
      );
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.blocks\.transitrix\.yaml$/, '')
      : 'diagram';
    const defaultUri = sourceUri
      ? vscode.Uri.file(path.join(path.dirname(sourceUri.fsPath), `${stem}.svg`))
      : vscode.Uri.file(`${stem}.svg`);
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { 'SVG Image': ['svg'] },
    });
    if (!target) return;
    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');
    const svg = prepareSvgForExport(this.lastSvg, themeId);
    await vscode.workspace.fs.writeFile(target, Buffer.from(svg, 'utf-8'));
    vscode.window.showInformationMessage(`Saved: ${path.basename(target.fsPath)}`);
  }
}

// `iterateBlocks` is re-exported by the diagrams package and used internally
// by the SVG emitter via tree walks; keep it imported here so the test that
// asserts pre-order iteration can run against the same source-of-truth.
void iterateBlocks;
