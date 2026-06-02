import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import {
  validateActivityCard,
  resolveActivityCard,
  layoutActivityCard,
  type ActivityCardDoc,
  type ActivityCardLayout,
} from '../../packages/diagrams/src/activity-card/index.js';
import { coerceDatesToIsoStrings } from '../../packages/diagrams/src/yaml-normalize.js';
import { savePngFromSvg, copyPngFromSvg } from './png-export.js';

// The Activity Card is the first MULTI-DOCUMENT Studio preview. The card YAML
// names a project Activity; the project's name/dates, the motivation chain,
// and the child activities are pulled by reference from sibling
// `*.activities.*` / `*.fgca.*` documents in the SAME directory. This preview
// owns the filesystem half of that resolution (read + parse the siblings); the
// pure resolver in `@transitrix/diagrams` does the rest.

const ACTIVITIES_SUFFIX = '.activities.transitrix.yaml';
const FGCA_SUFFIX = '.fgca.transitrix.yaml';
const CARD_SUFFIX = '.activity-card.transitrix.yaml';

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

interface SiblingDocs {
  activitiesDocs: unknown[];
  fgcaDocs: unknown[];
  warnings: string[];
}

/** Read + parse every sibling `*.activities.*` / `*.fgca.*` doc in `dirUri`. */
async function readSiblingDocs(dirUri: vscode.Uri): Promise<SiblingDocs> {
  const activitiesDocs: unknown[] = [];
  const fgcaDocs: unknown[] = [];
  const warnings: string[] = [];

  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(dirUri);
  } catch {
    return { activitiesDocs, fgcaDocs, warnings: ['Could not read the card directory to resolve sibling documents.'] };
  }

  for (const [name, type] of entries) {
    if (type !== vscode.FileType.File) continue;
    const isActivities = name.endsWith(ACTIVITIES_SUFFIX);
    const isFgca = name.endsWith(FGCA_SUFFIX);
    if (!isActivities && !isFgca) continue;
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dirUri, name));
      const parsed = coerceDatesToIsoStrings(yaml.load(Buffer.from(bytes).toString('utf-8')) as unknown);
      if (isActivities) activitiesDocs.push(parsed);
      else fgcaDocs.push(parsed);
    } catch (e) {
      warnings.push(`Skipped sibling ${name}: ${(e as Error).message ?? 'parse error'}`);
    }
  }

  if (activitiesDocs.length === 0) {
    warnings.push(`No sibling ${ACTIVITIES_SUFFIX} document found — project + child activities cannot resolve.`);
  }
  return { activitiesDocs, fgcaDocs, warnings };
}

const ARROW_DEF = `<defs><marker id="ac-arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/></marker></defs>`;

function layoutToSvg(layout: ActivityCardLayout, filename?: string, date?: string, version?: string): string {
  const pad = 24;
  const showTitle = filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;
  const w = layout.bounds.width + pad * 2;
  const h = layout.bounds.height + pad * 2 + titleH;
  const ox = pad;
  const oy = pad + titleH;

  const parts: string[] = [ARROW_DEF];

  // Outer card.
  parts.push(
    `<rect class="diagram-node level-0" x="${ox}" y="${oy}" width="${layout.bounds.width}" height="${layout.bounds.height}" rx="8"/>`,
  );

  // Title (project name).
  parts.push(
    `<text class="text-header" x="${layout.title.x + ox}" y="${layout.title.y + oy}" dominant-baseline="central" font-size="18">${escXml(truncate(layout.title.name, 70))}</text>`,
  );

  // Dates band.
  for (const d of layout.dateFields) {
    parts.push(
      `<rect class="diagram-node level-2" x="${d.x + ox}" y="${d.y + oy}" width="${d.width}" height="${d.height}" rx="6"/>`,
    );
    parts.push(
      `<text class="text-secondary" x="${d.x + ox + 12}" y="${d.y + oy + 18}" dominant-baseline="central">${escXml(d.label)}</text>`,
    );
    parts.push(
      `<text class="text-primary" x="${d.x + ox + 12}" y="${d.y + oy + 40}" dominant-baseline="central">${escXml(d.value)}</text>`,
    );
  }

  // Section headers.
  for (const s of layout.sectionHeaders) {
    parts.push(
      `<text class="text-header" x="${s.x + ox}" y="${s.y + oy + s.height / 2}" dominant-baseline="central">${escXml(s.label)}</text>`,
    );
  }

  // Milestones.
  for (const m of layout.milestones) {
    parts.push(
      `<rect class="diagram-node level-3" x="${m.x + ox}" y="${m.y + oy}" width="${m.width}" height="${m.height}" rx="6"/>`,
    );
    parts.push(
      `<text class="text-secondary" x="${m.x + ox + 10}" y="${m.y + oy + 16}" dominant-baseline="central">${escXml(m.date)}</text>`,
    );
    parts.push(
      `<text class="text-primary" x="${m.x + ox + 10}" y="${m.y + oy + 36}" dominant-baseline="central">${escXml(truncate(m.name, 22))}</text>`,
    );
    parts.push(
      `<text class="text-secondary" x="${m.x + ox + 10}" y="${m.y + oy + 52}" dominant-baseline="central" font-style="italic">(${escXml(m.archimateClass)})</text>`,
    );
  }

  // Motivation chain — edges first (under nodes).
  const nodeById = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const col of [layout.chainColumns.factors, layout.chainColumns.goals, layout.chainColumns.changes]) {
    for (const n of col) nodeById.set(n.id, n);
  }
  for (const e of layout.chainEdges) {
    const s = nodeById.get(e.sourceId);
    const t = nodeById.get(e.targetId);
    if (!s || !t) continue;
    const x1 = s.x + s.width + ox;
    const y1 = s.y + s.height / 2 + oy;
    const x2 = t.x + ox;
    const y2 = t.y + t.height / 2 + oy;
    const mx = (x1 + x2) / 2;
    parts.push(
      `<path class="diagram-edge" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" marker-end="url(#ac-arrow)"/>`,
    );
  }
  const chainLevels: Array<[typeof layout.chainColumns.factors, number]> = [
    [layout.chainColumns.factors, 4],
    [layout.chainColumns.goals, 5],
    [layout.chainColumns.changes, 6],
  ];
  for (const [col, level] of chainLevels) {
    for (const n of col) {
      parts.push(
        `<rect class="diagram-node level-${level}" x="${n.x + ox}" y="${n.y + oy}" width="${n.width}" height="${n.height}" rx="6"/>`,
      );
      parts.push(
        `<text class="text-pill" x="${n.x + ox + n.width / 2}" y="${n.y + oy + n.height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncate(n.name, Math.floor(n.width / 7)))}</text>`,
      );
    }
  }

  // Child activities.
  for (const a of layout.childActivities) {
    parts.push(
      `<rect class="diagram-node level-1" x="${a.x + ox}" y="${a.y + oy}" width="${a.width}" height="${a.height}" rx="6"/>`,
    );
    parts.push(
      `<text class="text-primary" x="${a.x + ox + 12}" y="${a.y + oy + a.height / 2}" dominant-baseline="central">${escXml(truncate(a.name, 48))} <tspan class="text-secondary" font-style="italic">(${escXml(a.archimateClass)})</tspan></text>`,
    );
    if (a.meta) {
      parts.push(
        `<text class="text-secondary" x="${a.x + a.width + ox - 12}" y="${a.y + oy + a.height / 2}" text-anchor="end" dominant-baseline="central">${escXml(truncate(a.meta, 40))}</text>`,
      );
    }
  }

  const titleSvg = showTitle ? titleBlockSvg('Activity Card', filename!, date!, pad, pad, version) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${titleSvg}
${parts.join('\n')}
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

  /**
   * Multi-document refresh: when a sibling `*.activities.*` / `*.fgca.*` doc in
   * the same directory as the tracked card is saved, re-resolve and re-render.
   */
  async refreshIfSiblingSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    const name = path.basename(doc.fileName);
    if (!name.endsWith(ACTIVITIES_SUFFIX) && !name.endsWith(FGCA_SUFFIX)) return;
    const cardUri = vscode.Uri.parse(this.trackedUri);
    if (path.dirname(doc.uri.fsPath) !== path.dirname(cardUri.fsPath)) return;
    const cardDoc = await vscode.workspace.openTextDocument(cardUri);
    await this.pushDocument(cardDoc);
  }

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const dirUri = vscode.Uri.file(path.dirname(doc.uri.fsPath));
    const siblings = await readSiblingDocs(dirUri);
    this.panel.webview.html = this.buildHtml(doc.getText(), path.basename(doc.fileName), siblings);
  }

  private buildHtml(yamlText: string, filename: string, siblings: SiblingDocs): string {
    let svgContent = '';
    let errorMsg = '';
    const warnings: string[] = [...siblings.warnings];

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      const v = validateActivityCard(parsed);
      warnings.push(...v.warnings.map((w) => `${w.code}: ${w.message}`));
      if (!v.valid) {
        errorMsg = v.errors.map((e) => `${e.code}: ${e.message}`).join('\n');
      } else {
        const cardDoc = parsed as ActivityCardDoc;
        const r = resolveActivityCard(cardDoc, {
          activitiesDocs: siblings.activitiesDocs,
          fgcaDocs: siblings.fgcaDocs,
        });
        warnings.push(...r.warnings.map((w) => `${w.code}: ${w.message}`));
        if (!r.valid || !r.resolved) {
          errorMsg = r.errors.map((e) => `${e.code}: ${e.message}`).join('\n');
        } else {
          const meta = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
          const docVersion = typeof meta['version'] === 'string' ? (meta['version'] as string) : undefined;
          const docDate = typeof meta['date'] === 'string' ? (meta['date'] as string) : todayIso();
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
