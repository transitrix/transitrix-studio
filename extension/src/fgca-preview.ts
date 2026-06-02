import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import { parseCanonicalFGCA, parseCanonicalFGA } from '../../packages/diagrams/src/fgca/parse-canonical.js';
import {
  layoutFGCAPreview,
  FGCA_NODE_W as NODE_W,
  FGCA_NODE_H as NODE_H,
  FGCA_HEADER_H as HEADER_H,
  FGCA_PAD as PAD,
  FGCA_DEFAULT_COL_GAP,
  FGCA_DEFAULT_ROW_GAP,
} from '../../packages/diagrams/src/fgca/preview-layout.js';
import { horizontalCubicEdgePath, DEFAULT_EDGE_CURVATURE } from '../../packages/diagrams/src/edge-path.js';
import { coerceDatesToIsoStrings } from '../../packages/diagrams/src/yaml-normalize.js';
import { checkScopeRoot, type Scope } from '../../packages/diagrams/src/scope.js';
import { savePngFromSvg, copyPngFromSvg } from './png-export.js';
import { readSpacing, readCurvature, readScope, applyControlMessage, OPEN_SPACING_SETTINGS_COMMAND, OPEN_CURVATURE_SETTINGS_COMMAND, OPEN_SCOPE_SETTINGS_COMMAND } from './spacing-config.js';
import { genNonce, buildControlsPanel, buildControlsScript, type ControlsModel, type ScopeGoalOption } from './preview-controls.js';

// ── Inline render types ─────────────────────────────────────────────────────
//
// FGCA (notations/02-fgca.md) and FGA (notations/03-fga.md) are both the
// canonical FLAT shape — top-level `factors[]` / `goals[]` / `changes[]`
// (FGCA only) / `activities[]`, no `fgca:` / `fga:` wrapper. Parsing +
// validation live in `@transitrix/diagrams` (parseCanonicalFGCA /
// parseCanonicalFGA), which return this internal `FGCADoc` (numeric IDs,
// singular `goal_id`, `activity_ids`). This file only renders that doc —
// FGA reuses the FGCA renderer with the Changes column hidden.

interface FactorItem { id: number | string; name: string; }
interface GoalItem { id: number | string; name: string; level?: number; factor?: Array<{ id: number | string }>; }
interface ChangeItem { id: number | string; name: string; goal_id: number | string; activity_ids: Array<number | string>; }
interface ActivityItem { id: number | string; name: string; goal_id?: number | string | null; }

interface FGCADoc {
  notation: string;
  factors: FactorItem[];
  goals: GoalItem[];
  changes?: ChangeItem[];
  activities: ActivityItem[];
}

// ── Column layout ─────────────────────────────────────────────────────────────
//
// Geometry + edge routing now live in @transitrix/diagrams
// (`layoutFGCAPreview`) so the configurable-gap behaviour (vkgeorgia/strategy#75)
// is unit-tested. This file owns only the SVG presentation of that layout and
// the column header labels.

const COL_LABELS: Record<string, string> = {
  factor: 'Factors (F)',
  goal: 'Goals (G)',
  change: 'Changes (C)',
  activity: 'Activities (A)',
};

// ── SVG renderer ──────────────────────────────────────────────────────────────

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Goal options + deepest level for the scope control, from a parsed doc. FGCA
 *  and FGA goals are flat, so a `root` scope is the single matching goal. */
function scopeInputsFromDoc(doc: FGCADoc): { goals: ScopeGoalOption[]; maxLevelPresent: number } {
  return {
    goals: doc.goals.map(g => ({ id: String(g.id), name: g.name ?? '' })),
    maxLevelPresent: doc.goals.reduce((m, g) => Math.max(m, typeof g.level === 'number' ? g.level : 0), 0),
  };
}

/** Assembles the interactive control-panel model shared by FGCA and FGA. */
function fgcaControlsModel(
  gaps: { horizontalGap: number; verticalGap: number },
  defaults: { horizontalGap: number; verticalGap: number },
  curvature: number,
  scope: Scope,
  goals: ScopeGoalOption[],
  maxLevelPresent: number,
): ControlsModel {
  return {
    spacing: { ...gaps, defaults },
    curvature: { value: curvature, default: 1 },
    scope: {
      rootId: scope.mode === 'root' ? scope.rootGoalId : '',
      maxLevel: scope.mode === 'level' ? scope.maxLevel : -1,
      maxLevelPresent,
      goals,
    },
  };
}

function buildSvg(
  doc: FGCADoc,
  hideChanges = false,
  opts: { colGap?: number; rowGap?: number; curvature?: number; scope?: Scope } = {},
  heading?: string,
  filename?: string,
  date?: string,
  version?: string,
): string {
  const curvature = opts.curvature ?? DEFAULT_EDGE_CURVATURE;
  const { nodes, edges, columns, width, height } = layoutFGCAPreview(doc, {
    hideChanges,
    colGap: opts.colGap,
    rowGap: opts.rowGap,
    scope: opts.scope,
  });
  const showTitle = heading != null && filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;

  const headerSvg = columns.map(({ col, x }) => {
    return [
      `<rect class="diagram-node layer-${col}" x="${x}" y="${PAD}" width="${NODE_W}" height="${HEADER_H}" rx="6"/>`,
      `<text class="text-header" x="${x + NODE_W / 2}" y="${PAD + HEADER_H / 2}" text-anchor="middle" dominant-baseline="central">${escXml(COL_LABELS[col])}</text>`,
    ].join('\n');
  }).join('\n');

  // Cubic bezier with horizontal control handles (shared geometry in
  // @transitrix/diagrams). `curvature` scales the handle length: 1 = default,
  // 0 = straight, higher = stronger arc (vkgeorgia/strategy#76).
  const edgeSvg = edges.map(e =>
    `<path d="${horizontalCubicEdgePath(e.sx, e.sy, e.tx, e.ty, curvature)}" class="diagram-edge" marker-end="url(#arrow)"/>`
  ).join('\n');

  const nodeSvg = nodes.map(n => {
    const words = n.label.split(' ');
    let line1 = '';
    let line2 = '';
    for (const w of words) {
      if ((line1 + ' ' + w).trim().length <= 26) {
        line1 = (line1 + ' ' + w).trim();
      } else if ((line2 + ' ' + w).trim().length <= 26) {
        line2 = (line2 + ' ' + w).trim();
      } else if (!line2) {
        line2 = w.slice(0, 24) + '…';
        break;
      }
    }
    const twoLines = line2.length > 0;
    const y1 = twoLines ? n.y + NODE_H / 2 - 8 : n.y + NODE_H / 2 + 5;
    const y2 = y1 + 18;
    return [
      `<rect class="diagram-node layer-${n.col}" x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="8"/>`,
      `<text class="text-primary" x="${n.x + NODE_W / 2}" y="${y1}" text-anchor="middle">${escXml(line1)}</text>`,
      twoLines ? `<text class="text-secondary" x="${n.x + NODE_W / 2}" y="${y2}" text-anchor="middle">${escXml(line2)}</text>` : '',
    ].filter(Boolean).join('\n');
  }).join('\n');

  const totalH = height + titleH;
  const titleSvg = showTitle ? titleBlockSvg(heading!, filename!, date!, PAD, PAD, version) : '';
  // The layoutFGCA coordinates are absolute; wrap the diagram in a translate
  // group so the title block can sit above without rewriting every node/edge.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalH}" viewBox="0 0 ${width} ${totalH}">
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
</defs>
${titleSvg}
<g transform="translate(0, ${titleH})">
${headerSvg}
${nodeSvg}
${edgeSvg}
</g>
</svg>`;
}

// ── FGCAPreview webview class ─────────────────────────────────────────────────

export class FGCAPreview {
  readonly panelTitle = 'FGCA Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;
  private lastSvg = '';

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
      this.panel = vscode.window.createWebviewPanel(
        'fgcaPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          // Scripts enabled for the in-preview controls under the strict nonce
          // CSP (see goals-preview.ts for the full rationale; #75/#76/#77 PR2).
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
          enableCommandUris: ['transitrixStudio.saveFGCAAsSvg', 'transitrixStudio.saveFGCAAsPng', 'transitrixStudio.copyFGCAAsPng', OPEN_SPACING_SETTINGS_COMMAND, OPEN_CURVATURE_SETTINGS_COMMAND, OPEN_SCOPE_SETTINGS_COMMAND],
        },
      );
      this.panel.webview.onDidReceiveMessage((m) => { void applyControlMessage('fgca', m); });
      this.panel.onDidDispose(() => { this.panel = undefined; this.trackedUri = undefined; });
    }
    await this.pushDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
    await this.pushDocument(doc);
  }

  /** Re-render the tracked document — used when a spacing/theme setting changes. */
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

    const spacingDefaults = { horizontalGap: FGCA_DEFAULT_COL_GAP, verticalGap: FGCA_DEFAULT_ROW_GAP };
    const gaps = readSpacing('fgca', spacingDefaults);
    const scope = readScope('fgca');
    const curvature = readCurvature('fgca');
    let goalOptions: ScopeGoalOption[] = [];
    let maxLevelPresent = 0;

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      const meta = (parsed && typeof parsed === 'object' ? parsed : {}) as { version?: unknown; date?: unknown };
      const docVersion = typeof meta.version === 'string' ? meta.version : undefined;
      const docDate = typeof meta.date === 'string' ? meta.date : todayIso();
      const v = parseCanonicalFGCA(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid || !v.parsed) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        // parseCanonicalFGCA returns the strict internal form with numeric
        // IDs and singular `change.goal_id` / `change.activity_ids`. The
        // inline FGCADoc / buildSvg here accept both forms (number | string
        // unions) — pass through.
        const fgcaDoc = v.parsed as unknown as FGCADoc;
        ({ goals: goalOptions, maxLevelPresent } = scopeInputsFromDoc(fgcaDoc));
        const scopeWarning = checkScopeRoot(scope, fgcaDoc.goals.map(g => g.id));
        if (scopeWarning) warnings.push(`${scopeWarning.code}: ${scopeWarning.message}`);
        svgContent = buildSvg(fgcaDoc, false, { colGap: gaps.horizontalGap, rowGap: gaps.verticalGap, curvature, scope }, 'FGCA — Factor → Goal → Change → Activity', filename, docDate, docVersion);
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    this.lastSvg = svgContent;

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    const nonce = genNonce();
    const model = fgcaControlsModel(gaps, spacingDefaults, curvature, scope, goalOptions, maxLevelPresent);

    return buildDiagramFrame({
      filename, notation: 'FGCA', svgContent, errorMsg, warnings, themeId,
      saveSvgCommand: 'transitrixStudio.saveFGCAAsSvg',
      savePngCommand: 'transitrixStudio.saveFGCAAsPng',
      copyPngCommand: 'transitrixStudio.copyFGCAAsPng',
      spacingCommand: OPEN_SPACING_SETTINGS_COMMAND,
      curvatureCommand: OPEN_CURVATURE_SETTINGS_COMMAND,
      scopeCommand: OPEN_SCOPE_SETTINGS_COMMAND,
      interactive: { nonce, controlsPanel: buildControlsPanel(model), controlsScript: buildControlsScript(nonce) },
    });
  }

  private pngTarget() {
    return {
      rawSvg: this.lastSvg || undefined,
      themeId: vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix'),
      emptyMessage: 'No diagram rendered yet. Open a *.fgca.transitrix.yaml file first.',
    };
  }

  saveAsPng(): Promise<void> {
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    return savePngFromSvg({ ...this.pngTarget(), sourceUri, stripExt: /\.fgca\.transitrix\.yaml$/ });
  }

  copyAsPng(): Promise<void> {
    return copyPngFromSvg(this.pngTarget());
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.fgca.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.fgca\.transitrix\.yaml$/, '')
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

// ── FGAPreview webview class ──────────────────────────────────────────────────

export class FGAPreview {
  readonly panelTitle = 'FGA Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;
  private lastSvg = '';

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
      this.panel = vscode.window.createWebviewPanel(
        'fgaPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          // Scripts enabled for the in-preview controls under the strict nonce
          // CSP (#75/#76/#77 PR2).
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
          enableCommandUris: ['transitrixStudio.saveFGAAsSvg', 'transitrixStudio.saveFGAAsPng', 'transitrixStudio.copyFGAAsPng', OPEN_SPACING_SETTINGS_COMMAND, OPEN_CURVATURE_SETTINGS_COMMAND, OPEN_SCOPE_SETTINGS_COMMAND],
        },
      );
      this.panel.webview.onDidReceiveMessage((m) => { void applyControlMessage('fga', m); });
      this.panel.onDidDispose(() => { this.panel = undefined; this.trackedUri = undefined; });
    }
    await this.pushDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
    await this.pushDocument(doc);
  }

  /** Re-render the tracked document — used when a spacing/theme setting changes. */
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

    const spacingDefaults = { horizontalGap: FGCA_DEFAULT_COL_GAP, verticalGap: FGCA_DEFAULT_ROW_GAP };
    const gaps = readSpacing('fga', spacingDefaults);
    const scope = readScope('fga');
    const curvature = readCurvature('fga');
    let goalOptions: ScopeGoalOption[] = [];
    let maxLevelPresent = 0;

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      const meta = (parsed && typeof parsed === 'object' ? parsed : {}) as { version?: unknown; date?: unknown };
      const docVersion = typeof meta.version === 'string' ? meta.version : undefined;
      const docDate = typeof meta.date === 'string' ? meta.date : todayIso();
      const v = parseCanonicalFGA(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid || !v.parsed) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        // FGA shares FGCA's FLAT shape; just hide the (absent) Changes column.
        const fgaDoc = v.parsed as unknown as FGCADoc;
        ({ goals: goalOptions, maxLevelPresent } = scopeInputsFromDoc(fgaDoc));
        const scopeWarning = checkScopeRoot(scope, fgaDoc.goals.map(g => g.id));
        if (scopeWarning) warnings.push(`${scopeWarning.code}: ${scopeWarning.message}`);
        svgContent = buildSvg(fgaDoc, true, { colGap: gaps.horizontalGap, rowGap: gaps.verticalGap, curvature, scope }, 'FGA — Factor → Goal → Activity', filename, docDate, docVersion);
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    this.lastSvg = svgContent;

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    const nonce = genNonce();
    const model = fgcaControlsModel(gaps, spacingDefaults, curvature, scope, goalOptions, maxLevelPresent);

    return buildDiagramFrame({
      filename, notation: 'FGA', svgContent, errorMsg, warnings, themeId,
      saveSvgCommand: 'transitrixStudio.saveFGAAsSvg',
      savePngCommand: 'transitrixStudio.saveFGAAsPng',
      copyPngCommand: 'transitrixStudio.copyFGAAsPng',
      spacingCommand: OPEN_SPACING_SETTINGS_COMMAND,
      curvatureCommand: OPEN_CURVATURE_SETTINGS_COMMAND,
      scopeCommand: OPEN_SCOPE_SETTINGS_COMMAND,
      interactive: { nonce, controlsPanel: buildControlsPanel(model), controlsScript: buildControlsScript(nonce) },
    });
  }

  private pngTarget() {
    return {
      rawSvg: this.lastSvg || undefined,
      themeId: vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix'),
      emptyMessage: 'No diagram rendered yet. Open a *.fga.transitrix.yaml file first.',
    };
  }

  saveAsPng(): Promise<void> {
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    return savePngFromSvg({ ...this.pngTarget(), sourceUri, stripExt: /\.fga\.transitrix\.yaml$/ });
  }

  copyAsPng(): Promise<void> {
    return copyPngFromSvg(this.pngTarget());
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.fga.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.fga\.transitrix\.yaml$/, '')
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
