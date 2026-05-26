import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import {
  validateNestedBlocks,
  layoutNestedBlocks,
  iterateBlocks,
  type BlocksFile,
  type BlocksLayout,
  type LaidOutBlock,
} from '../../packages/diagrams/src/blocks/index.js';

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

/**
 * Pick the diagram-frame level class for a block at the given depth.
 *
 * `level-0` is the lightest fill in the brand colour ramp; deeper levels are
 * progressively darker. The methodology spec mandates "outermost lightest"
 * (08-blocks.md §7), so depth 1 (top-level) maps to `level-0`.
 *
 * The frame defines `level-0` … `level-6`; deeper blocks reuse `level-6` so
 * extreme nesting still renders without crashing (BL-008 already warns at
 * depth 6+).
 */
function levelClassForDepth(depth: number): string {
  const idx = Math.min(Math.max(depth - 1, 0), 6);
  return `level-${idx}`;
}

function emitBlockSvg(b: LaidOutBlock, ox: number, oy: number, parts: string[]): void {
  const cls = levelClassForDepth(b.depth);
  parts.push(
    `<rect class="diagram-node ${cls}" x="${b.x + ox}" y="${b.y + oy}" width="${b.width}" height="${b.height}" rx="6"/>`,
  );

  // Header label, centred horizontally within the block's header strip.
  const headerY = b.y + oy + b.headerHeight / 2;
  const maxChars = Math.max(4, Math.floor(b.width / 8));
  parts.push(
    `<text class="text-header" x="${b.x + ox + b.width / 2}" y="${headerY}" text-anchor="middle" dominant-baseline="central">${escXml(truncate(b.name, maxChars))}</text>`,
  );

  for (const c of b.children) emitBlockSvg(c, ox, oy, parts);
}

function layoutToSvg(
  layout: BlocksLayout,
  filename?: string,
  date?: string,
  version?: string,
): string {
  const pad = 24;
  const showTitle = filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;
  const w = layout.bounds.width + pad * 2;
  const h = layout.bounds.height + pad * 2 + titleH;
  const ox = pad;
  const oy = pad + titleH;

  const parts: string[] = [];
  for (const top of layout.blocks) emitBlockSvg(top, ox, oy, parts);

  const titleSvg = showTitle ? titleBlockSvg('Nested Blocks', filename!, date!, pad, pad, version) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${titleSvg}
${parts.join('\n')}
</svg>`;
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
          enableCommandUris: ['transitrixStudio.saveBlocksAsSvg'],
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

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    this.panel.webview.html = this.buildHtml(doc.getText(), path.basename(doc.fileName));
  }

  private buildHtml(yamlText: string, filename: string): string {
    let svgContent = '';
    let errorMsg = '';
    let warnings: string[] = [];

    try {
      const parsed = yaml.load(yamlText) as unknown;
      const v = validateNestedBlocks(parsed);
      warnings = v.warnings.map((w) => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map((e) => `${e.code}: ${e.message}`).join('\n');
      } else {
        const file = parsed as BlocksFile;
        const nb =
          (file as unknown as { nested_blocks?: { version?: unknown; date?: unknown } })
            .nested_blocks ?? {};
        const docVersion = typeof nb.version === 'string' ? nb.version : undefined;
        const docDate = typeof nb.date === 'string' ? nb.date : todayIso();
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
    });
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
