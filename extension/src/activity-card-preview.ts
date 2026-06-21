import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import {
  validateActivityCard,
  resolveActivityCard,
  layoutActivityCard,
  type ActivityCardDoc,
  type ActivityCardLayout,
} from '../../packages/diagrams/src/activity-card/index.js';
import { coerceDatesToIsoStrings } from '../../packages/diagrams/src/yaml-normalize.js';
import { renderActivityCardBody } from '../../packages/diagrams/src/webview/render-activity-card.js';
import {
  type CanonDocs,
  findCanonRoot,
  isUnderCanon,
  loadCanon,
} from './canon-loader.js';
import { savePngFromSvg, copyPngFromSvg } from './png-export.js';

// The Activity Card is the first MULTI-DOCUMENT Studio preview. The card YAML
// names a project Activity; the project's name/dates, the motivation chain,
// and the child activities are pulled BY REFERENCE from the canonical ELEMENT
// and RELATION store — never from other view documents (view-purity: a view is
// a projection over elements + relations, methodology ELEMENT_PRIMITIVES.md
// §1). The filesystem half of that resolution is now in canon-loader.ts;
// the pure resolver in `@transitrix/diagrams` does the rest.

const CARD_SUFFIX = '.activity-card.transitrix.yaml';

// Single-line `<defs>` marker kept host-specific: the VS Code SVG places it
// after the title block, while the host-neutral renderer emits a multi-line
// `<defs>` before the title. The shared body emitter owns everything else.
const ARROW_DEF = `<defs><marker id="ac-arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/></marker></defs>`;

/**
 * VS Code wrapper around the shared {@link renderActivityCardBody} emitter. Adds
 * the rich title block (reserving `TITLE_BLOCK_H` for it) and the arrow marker,
 * delegating the card body to the single source of truth in
 * `@transitrix/diagrams`. No embedded CSS: the webview supplies it live and the
 * export path embeds it via `prepareSvgForExport`.
 */
function layoutToSvg(layout: ActivityCardLayout, filename?: string, date?: string, version?: string): string {
  const pad = 24;
  const showTitle = filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;
  const w = layout.bounds.width + pad * 2;
  const h = layout.bounds.height + pad * 2 + titleH;
  const ox = pad;
  const oy = pad + titleH;

  const body = renderActivityCardBody(layout, ox, oy);
  const titleSvg = showTitle ? titleBlockSvg('Activity Card', filename!, date!, pad, pad, version) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${titleSvg}
${ARROW_DEF}
${body}
</svg>`;
}

export class ActivityCardPreview {
  readonly panelTitle = 'Activity Card Preview';
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
        'activityCardPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          enableScripts: false,
          retainContextWhenHidden: true,
          enableCommandUris: [
            'transitrixStudio.saveActivityCardAsSvg',
            'transitrixStudio.saveActivityCardAsPng',
            'transitrixStudio.copyActivityCardAsPng',
            'transitrixStudio.changeTheme',
          ],
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

  /**
   * Multi-document refresh: when a canon element/relation document under the
   * same `canon/` root as the tracked card is saved, re-resolve and re-render.
   * (Method name kept for the extension router; sources are now the canon
   * element + relation store, not sibling view docs.)
   */
  async refreshIfSiblingSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    if (!doc.fileName.endsWith('.yaml')) return;
    const cardUri = vscode.Uri.parse(this.trackedUri);
    const canonRoot = findCanonRoot(cardUri);
    if (!canonRoot) return;
    if (!isUnderCanon(canonRoot, doc.uri)) return;
    const cardDoc = await vscode.workspace.openTextDocument(cardUri);
    await this.pushDocument(cardDoc);
  }

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const sources = await loadCanon(doc.uri);
    this.panel.webview.html = this.buildHtml(doc.getText(), path.basename(doc.fileName), sources);
  }

  private buildHtml(yamlText: string, filename: string, sources: CanonDocs): string {
    let svgContent = '';
    let errorMsg = '';
    const warnings: string[] = [...sources.warnings];

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      const v = validateActivityCard(parsed);
      warnings.push(...v.warnings.map((w) => `${w.code}: ${w.message}`));
      if (!v.valid) {
        errorMsg = v.errors.map((e) => `${e.code}: ${e.message}`).join('\n');
      } else {
        const cardDoc = parsed as ActivityCardDoc;
        const r = resolveActivityCard(cardDoc, {
          elements: sources.elements,
          relations: sources.relations,
        });
        warnings.push(...r.warnings.map((w) => `${w.code}: ${w.message}`));
        if (!r.valid || !r.resolved) {
          errorMsg = r.errors.map((e) => `${e.code}: ${e.message}`).join('\n');
        } else {
          const meta = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
          const docVersion = typeof meta['version'] === 'string' ? (meta['version'] as string) : undefined;
          const docDate = (typeof meta['generated_at'] === 'string' ? (meta['generated_at'] as string) : undefined)
            ?? (typeof meta['date'] === 'string' ? (meta['date'] as string) : undefined)
            ?? todayIso();
          const layout = layoutActivityCard(r.resolved);
          svgContent = layoutToSvg(layout, filename, docDate, docVersion);
        }
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    this.lastSvg = svgContent;

    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    return buildDiagramFrame({
      filename, notation: 'Activity Card', svgContent, errorMsg, warnings, themeId,
      saveSvgCommand: 'transitrixStudio.saveActivityCardAsSvg',
      savePngCommand: 'transitrixStudio.saveActivityCardAsPng',
      copyPngCommand: 'transitrixStudio.copyActivityCardAsPng',
      themeCommand: OPEN_THEME_COMMAND,
    });
  }

  private pngTarget() {
    return {
      rawSvg: this.lastSvg || undefined,
      themeId: vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix'),
      emptyMessage: 'No card rendered yet. Open a *.activity-card.transitrix.yaml file first.',
    };
  }

  saveAsPng(): Promise<void> {
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    return savePngFromSvg({ ...this.pngTarget(), sourceUri, stripExt: /\.activity-card\.transitrix\.yaml$/ });
  }

  copyAsPng(): Promise<void> {
    return copyPngFromSvg(this.pngTarget());
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No card rendered yet. Open a *.activity-card.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.activity-card\.transitrix\.yaml$/, '')
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

/** Suffix guard used by the extension router. */
export function isActivityCardFileName(fileName: string): boolean {
  return fileName.endsWith(CARD_SUFFIX);
}
