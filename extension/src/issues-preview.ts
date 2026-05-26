import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import {
  validateIssues,
  layoutIssues,
  type IssuesFile,
  type IssuesLayout,
  type IssueStatus,
} from '../../packages/diagrams/src/issues/index.js';

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

/**
 * Map the methodology spec's status vocabulary (§5.3) onto Studio's
 * existing four-palette status colour set:
 *
 *   open         → info     (neutral blue — registered, not yet worked)
 *   in_progress  → warning  (yellow — work in motion)
 *   blocked      → error    (red — cannot progress)
 *   resolved     → success  (green — fixed)
 *   closed       → neutral  (muted — no longer tracked)
 *
 * Returns `[bgVar, fgVar]` so the caller can reference the CSS variable
 * names defined in `packages/diagrams/src/theme/themes.ts`.
 */
function statusPalette(s: IssueStatus | undefined): [bg: string, fg: string, label: string] {
  switch (s) {
    case 'open':
      return ['var(--ts-status-info-bg)', 'var(--ts-status-info-fg)', 'open'];
    case 'in_progress':
      return ['var(--ts-status-warning-bg)', 'var(--ts-status-warning-fg)', 'in progress'];
    case 'blocked':
      return ['var(--ts-status-error-bg)', 'var(--ts-status-error-fg)', 'blocked'];
    case 'resolved':
      return ['var(--ts-status-success-bg)', 'var(--ts-status-success-fg)', 'resolved'];
    case 'closed':
      return ['var(--ts-divider)', 'var(--ts-text-secondary)', 'closed'];
    default:
      // Validation surfaces a bad status as ISS-002, so we won't usually
      // reach here — but the layout module is robust to garbage, so the
      // renderer should be too.
      return ['var(--ts-divider)', 'var(--ts-text-secondary)', String(s ?? '?')];
  }
}

const STATUS_BADGE_WIDTH = 96;
const STATUS_BADGE_HEIGHT = 22;
const STATUS_BADGE_PAD = 10;

function layoutToSvg(
  layout: IssuesLayout,
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

  for (const row of layout.rows) {
    const x = row.x + ox;
    const y = row.y + oy;

    parts.push(
      `<rect class="diagram-node level-0" x="${x}" y="${y}" width="${row.width}" height="${row.height}" rx="6"/>`,
    );

    // Name label, left-aligned with internal padding. The badge sits on
    // the right; reserve its column so the name does not overlap when the
    // status label is long.
    const nameMaxChars = Math.max(
      8,
      Math.floor((row.width - STATUS_BADGE_WIDTH - STATUS_BADGE_PAD * 3) / 7),
    );
    parts.push(
      `<text class="text-primary" x="${x + STATUS_BADGE_PAD}" y="${y + row.height / 2}" dominant-baseline="central">${escXml(truncate(row.data.name, nameMaxChars))}</text>`,
    );

    // Status badge on the right.
    const [bg, fg, label] = statusPalette(row.data.status);
    const badgeX = x + row.width - STATUS_BADGE_WIDTH - STATUS_BADGE_PAD;
    const badgeY = y + (row.height - STATUS_BADGE_HEIGHT) / 2;
    parts.push(
      `<rect x="${badgeX}" y="${badgeY}" width="${STATUS_BADGE_WIDTH}" height="${STATUS_BADGE_HEIGHT}" rx="4" fill="${bg}"/>`,
    );
    parts.push(
      `<text x="${badgeX + STATUS_BADGE_WIDTH / 2}" y="${badgeY + STATUS_BADGE_HEIGHT / 2}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="600" fill="${fg}">${escXml(label)}</text>`,
    );

    // Secondary line under the name when there is room: owner role +
    // relates_to count. Drawn only when the node height permits — today
    // the default 44 px row stays single-line; this is for future tuning.
    // (Skipped in v1: keeps the surface area small.)
  }

  const titleSvg = showTitle ? titleBlockSvg('Issues Register', filename!, date!, pad, pad, version) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${titleSvg}
${parts.join('\n')}
</svg>`;
}

export class IssuesPreview {
  readonly panelTitle = 'Issues Preview';
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
        'issuesPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          enableScripts: false,
          retainContextWhenHidden: true,
          enableCommandUris: ['transitrixStudio.saveIssuesAsSvg'],
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
      const v = validateIssues(parsed);
      warnings = v.warnings.map((w) => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map((e) => `${e.code}: ${e.message}`).join('\n');
      } else {
        const file = parsed as IssuesFile;
        const cat = (file as unknown as { issues_catalogue?: { version?: unknown; updated_at?: unknown } })
          .issues_catalogue ?? {};
        const docVersion = typeof cat.version === 'string' ? cat.version : undefined;
        const docDate = typeof cat.updated_at === 'string' ? cat.updated_at : todayIso();
        const layout = layoutIssues(file);
        svgContent = layoutToSvg(layout, filename, docDate, docVersion);
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
      notation: 'Issues Register',
      svgContent,
      errorMsg,
      warnings,
      themeId,
      saveSvgCommand: 'transitrixStudio.saveIssuesAsSvg',
    });
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage(
        'No diagram rendered yet. Open a *.issues.transitrix.yaml file first.',
      );
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.issues\.transitrix\.yaml$/, '')
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
