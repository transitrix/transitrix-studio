import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import {
  validateProcessBlueprint,
  layoutProcessBlueprint,
  type ProcessBlueprintFile,
  type ProcessBlueprintLayout,
} from '../../packages/diagrams/src/process-blueprint/index.js';

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

function layoutToSvg(layout: ProcessBlueprintLayout, filename?: string, date?: string): string {
  const pad = 24;
  const showTitle = filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;
  const w = layout.bounds.width + pad * 2;
  const h = layout.bounds.height + pad * 2 + titleH;
  const ox = pad;
  const oy = pad + titleH;

  const parts: string[] = [];

  parts.push(
    `<rect class="diagram-node level-0" x="${ox}" y="${oy}" width="${layout.bounds.width}" height="${layout.bounds.height}" rx="6"/>`,
  );

  for (const s of layout.stageHeaders) {
    parts.push(
      `<rect class="diagram-node level-1" x="${s.x + ox}" y="${s.y + oy}" width="${s.width}" height="${s.height}"/>`,
    );
    parts.push(
      `<text class="text-header" x="${s.x + ox + s.width / 2}" y="${s.y + oy + s.height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncate(s.name, 28))}</text>`,
    );
  }

  for (const l of layout.legend) {
    parts.push(
      `<rect class="diagram-node level-2" x="${ox}" y="${l.y + oy}" width="${layout.legendColumnWidth}" height="${l.height}"/>`,
    );
    parts.push(
      `<text class="text-primary" x="${ox + 12}" y="${l.y + oy + l.height / 2}" dominant-baseline="central">${escXml(l.label)}</text>`,
    );
  }

  for (const c of layout.goalCells) {
    parts.push(
      `<rect class="diagram-node level-3" x="${c.x + ox}" y="${c.y + oy}" width="${c.width}" height="${c.height}"/>`,
    );
    parts.push(
      `<text class="text-secondary" x="${c.x + ox + 10}" y="${c.y + oy + c.height / 2}" dominant-baseline="central">${escXml(truncate(c.text, 32))}</text>`,
    );
  }
  for (const c of layout.resultCells) {
    parts.push(
      `<rect class="diagram-node level-4" x="${c.x + ox}" y="${c.y + oy}" width="${c.width}" height="${c.height}"/>`,
    );
    parts.push(
      `<text class="text-secondary" x="${c.x + ox + 10}" y="${c.y + oy + c.height / 2}" dominant-baseline="central">${escXml(truncate(c.text, 32))}</text>`,
    );
  }

  for (let r = 0; r < layout.aspectRows.length; r++) {
    const row = layout.aspectRows[r];
    const level = 5 + (r % 3);
    parts.push(
      `<rect class="diagram-node level-${level}" x="${layout.legendColumnWidth + ox}" y="${row.y + oy}" width="${layout.bounds.width - layout.legendColumnWidth}" height="${row.height}" opacity="0.15"/>`,
    );
    for (let i = 1; i < layout.stageHeaders.length; i++) {
      const x = layout.legendColumnWidth + i * layout.stageColumnWidth + ox;
      parts.push(
        `<line class="diagram-edge" x1="${x}" y1="${row.y + oy}" x2="${x}" y2="${row.y + row.height + oy}" opacity="0.3"/>`,
      );
    }
    for (const p of row.pills) {
      parts.push(
        `<rect class="diagram-node level-${level}" x="${p.x + ox}" y="${p.y + oy}" width="${p.width}" height="${p.height}" rx="6"/>`,
      );
      const label = p.id ? `${p.name} · ${p.id}` : p.name;
      parts.push(
        `<text class="text-pill" x="${p.x + ox + p.width / 2}" y="${p.y + oy + p.height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncate(label, Math.floor(p.width / 8)))}</text>`,
      );
    }
  }

  const titleSvg = showTitle ? titleBlockSvg('Process Blueprint', filename!, date!, pad, pad) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${titleSvg}
${parts.join('\n')}
</svg>`;
}

export class ProcessBlueprintPreview {
  readonly panelTitle = 'Process Blueprint Preview';
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
        'processBlueprintPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: false, retainContextWhenHidden: true, enableCommandUris: ['transitrixStudio.saveProcessBlueprintAsSvg'] },
      );
      this.panel.onDidDispose(() => { this.panel = undefined; this.trackedUri = undefined; });
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
      const v = validateProcessBlueprint(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const file = parsed as ProcessBlueprintFile;
        const layout = layoutProcessBlueprint(file);
        svgContent = layoutToSvg(layout, filename, todayIso());
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    this.lastSvg = svgContent;

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({ filename, notation: 'Process Blueprint', svgContent, errorMsg, warnings, themeId, saveSvgCommand: 'transitrixStudio.saveProcessBlueprintAsSvg' });
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.process-blueprint.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.process-blueprint\.transitrix\.yaml$/, '')
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
