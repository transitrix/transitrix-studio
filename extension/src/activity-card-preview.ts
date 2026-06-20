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
import { escXml } from '../../packages/diagrams/src/webview/render-util.js';
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

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
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

  // Title row.
  parts.push(
    `<text class="text-header" x="${layout.titleRow.x + ox}" y="${layout.titleRow.y + oy}" style="dominant-baseline:central" font-size="18">${escXml(truncate(layout.titleRow.name, 60))}</text>`,
  );

  // Activity type badge.
  if (layout.activityTypeBadge) {
    const b = layout.activityTypeBadge;
    parts.push(`<rect class="diagram-node level-2" x="${b.x + ox}" y="${b.y + oy}" width="${b.width}" height="${b.height}" rx="4"/>`);
    parts.push(`<text class="text-secondary" style="dominant-baseline:central;text-anchor:middle" x="${b.x + ox + b.width / 2}" y="${b.y + oy + b.height / 2}">${escXml(b.label)}</text>`);
  }

  // Status badge.
  if (layout.statusBadge) {
    const b = layout.statusBadge;
    parts.push(`<rect class="diagram-node level-3" x="${b.x + ox}" y="${b.y + oy}" width="${b.width}" height="${b.height}" rx="4"/>`);
    parts.push(`<text class="text-secondary" style="dominant-baseline:central;text-anchor:middle" x="${b.x + ox + b.width / 2}" y="${b.y + oy + b.height / 2}">${escXml(b.label)}</text>`);
  }

  // Dates band.
  for (const d of layout.dateFields) {
    parts.push(`<rect class="diagram-node level-2" x="${d.x + ox}" y="${d.y + oy}" width="${d.width}" height="${d.height}" rx="6"/>`);
    parts.push(`<text class="text-secondary" x="${d.x + ox + 12}" y="${d.y + oy + 18}" style="dominant-baseline:central">${escXml(d.label)}</text>`);
    parts.push(`<text class="text-primary" x="${d.x + ox + 12}" y="${d.y + oy + 40}" style="dominant-baseline:central">${escXml(d.value)}</text>`);
  }

  // Stakeholder role slots (2-column grid).
  for (const s of layout.stakeholderRoleSlots) {
    parts.push(`<rect class="diagram-node level-2" x="${s.x + ox}" y="${s.y + oy}" width="${s.width}" height="${s.height}" rx="6"/>`);
    parts.push(`<text class="text-secondary" x="${s.x + ox + 10}" y="${s.y + oy + 16}" style="dominant-baseline:central">${escXml(s.role)}</text>`);
    parts.push(`<text class="text-primary" x="${s.x + ox + 10}" y="${s.y + oy + 36}" style="dominant-baseline:central">${escXml(truncate(s.name, 40))}</text>`);
  }

  // Description row.
  if (layout.descriptionRow) {
    const r = layout.descriptionRow;
    parts.push(`<rect class="diagram-node level-2" x="${r.x + ox}" y="${r.y + oy}" width="${r.width}" height="${r.height}" rx="6"/>`);
    parts.push(`<text class="text-secondary" x="${r.x + ox + 12}" y="${r.y + oy + 22}" style="dominant-baseline:central">${escXml(r.label)}</text>`);
    r.valueLines.forEach((line, i) => {
      parts.push(`<text class="text-primary" x="${r.x + ox + 12}" y="${r.y + oy + 44 + i * 18}" style="dominant-baseline:central">${escXml(line)}</text>`);
    });
  }

  // Chain sections (Drivers → Assessments → Goals → Changes).
  const SECTION_LEVEL: Record<string, number> = { drivers: 4, assessments: 5, goals: 5, changes: 6 };
  for (let si = 0; si < layout.chainSections.length; si++) {
    const section = layout.chainSections[si];
    const level = SECTION_LEVEL[section.type] ?? 5;
    parts.push(`<rect class="diagram-node level-1" x="${section.x + ox}" y="${section.y + oy}" width="${section.width}" height="${section.height}" rx="6"/>`);
    parts.push(`<text class="text-header" x="${section.x + ox + 12}" y="${section.y + oy + 14}" style="dominant-baseline:central">${escXml(section.label)}<tspan class="text-secondary" font-size="11"> (${escXml(section.subtitle)})</tspan></text>`);
    if (section.isEmpty) {
      parts.push(`<text class="text-secondary" x="${section.x + ox + 12}" y="${section.y + oy + 24 + 8 + 16}" style="dominant-baseline:central">— not on file</text>`);
    } else {
      for (const n of section.nodes) {
        parts.push(`<rect class="diagram-node level-${level}" x="${n.x + ox}" y="${n.y + oy}" width="${n.width}" height="${n.height}" rx="4"/>`);
        parts.push(`<text class="text-primary" x="${n.x + ox + 10}" y="${n.y + oy + (n.meta ? 16 : n.height / 2)}" style="dominant-baseline:central">${escXml(truncate(n.name, 80))}</text>`);
        if (n.meta) {
          parts.push(`<text class="text-secondary" x="${n.x + ox + 10}" y="${n.y + oy + 30}" style="dominant-baseline:central">${escXml(n.meta)}</text>`);
        }
      }
    }
    if (si < layout.chainSections.length - 1) {
      const nextSection = layout.chainSections[si + 1];
      const arrowX = section.x + ox + section.width / 2;
      parts.push(`<path class="diagram-edge" d="M${arrowX},${section.y + oy + section.height} L${arrowX},${nextSection.y + oy}" fill="none" marker-end="url(#ac-arrow)"/>`);
    }
  }

  // Milestones.
  for (const m of layout.milestones) {
    parts.push(`<rect class="diagram-node level-3" x="${m.x + ox}" y="${m.y + oy}" width="${m.width}" height="${m.height}" rx="6"/>`);
    parts.push(`<text class="text-secondary" x="${m.x + ox + 10}" y="${m.y + oy + 16}" style="dominant-baseline:central">${escXml(m.date)}</text>`);
    parts.push(`<text class="text-primary" x="${m.x + ox + 10}" y="${m.y + oy + 36}" style="dominant-baseline:central">${escXml(truncate(m.name, 22))}</text>`);
    parts.push(`<text class="text-secondary" x="${m.x + ox + 10}" y="${m.y + oy + 52}" style="dominant-baseline:central">(${escXml(m.archimateClass)})</text>`);
  }

  // Child activities.
  for (const a of layout.childActivities) {
    parts.push(`<rect class="diagram-node level-1" x="${a.x + ox}" y="${a.y + oy}" width="${a.width}" height="${a.height}" rx="6"/>`);
    parts.push(`<text class="text-primary" x="${a.x + ox + 12}" y="${a.y + oy + a.height / 2}" style="dominant-baseline:central">${escXml(truncate(a.name, 48))} <tspan class="text-secondary">(${escXml(a.archimateClass)})</tspan></text>`);
    if (a.meta) {
      parts.push(`<text class="text-secondary" x="${a.x + a.width + ox - 12}" y="${a.y + oy + a.height / 2}" style="dominant-baseline:central;text-anchor:end">${escXml(truncate(a.meta, 40))}</text>`);
    }
  }

  // Footer — notes.
  if (layout.footerRow) {
    const r = layout.footerRow;
    parts.push(`<rect class="diagram-node level-2" x="${r.x + ox}" y="${r.y + oy}" width="${r.width}" height="${r.height}" rx="6"/>`);
    parts.push(`<text class="text-secondary" x="${r.x + ox + 12}" y="${r.y + oy + 22}" style="dominant-baseline:central">${escXml(r.label)}</text>`);
    r.valueLines.forEach((line, i) => {
      parts.push(`<text class="text-primary" x="${r.x + ox + 12}" y="${r.y + oy + 44 + i * 18}" style="dominant-baseline:central">${escXml(line)}</text>`);
    });
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
