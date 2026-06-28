import * as path from 'node:path';
import { escXml } from '@transitrix/diagrams/webview/render-util.js';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import { loadCanon, findCanonRoot, isUnderCanon, type CanonDocs } from './canon-loader.js';
import { parseCanonicalFGCA, parseCanonicalFGA } from '@transitrix/diagrams/fgca/parse-canonical.js';
import { resolveFGCA, isFGCAViewDoc } from '@transitrix/diagrams/fgca/resolver.js';
import {
  layoutFGCAPreview,
  FGCA_PAD as PAD,
  FGCA_DEFAULT_COL_GAP,
  FGCA_DEFAULT_ROW_GAP,
} from '@transitrix/diagrams/fgca/preview-layout.js';
import { DEFAULT_EDGE_CURVATURE } from '@transitrix/diagrams/edge-path.js';
import { renderFgcaBody } from '@transitrix/diagrams/webview/render-fgca.js';
import { buildChainTable, type ChainTable, type ChainColumn } from '@transitrix/diagrams/fgca/chain-table.js';
import { coerceDatesToIsoStrings } from '@transitrix/diagrams/yaml-normalize.js';
import { checkScopeRoot, type Scope } from '@transitrix/diagrams/scope.js';
import { savePngFromSvg, copyPngFromSvg } from './png-export.js';
import { readSpacing, readCurvature, readEntryCurvature, readScope, readView, applyControlMessage, OPEN_SPACING_SETTINGS_COMMAND, OPEN_CURVATURE_SETTINGS_COMMAND, OPEN_SCOPE_SETTINGS_COMMAND } from './spacing-config.js';
import { genNonce, buildControlsPanel, buildControlsScript, buildViewToggle, buildCaptureButton, buildTimelineStrip, type ControlsModel, type ScopeGoalOption, type SnapshotMarker, type SnapshotMessage } from './preview-controls.js';
import { snapshotFilename, buildSnapshotContent, extractViewMeta, listSnapshotFiles, parseSnapshotForDisplay } from './snapshot-writer.js';

// ── Inline render types ────────────────────────────────────────────────────────────────────────────
//
// DGCA and DGA are both the canonical FLAT shape — top-level `drivers[]` /
// `goals[]` / `changes[]` (DGCA only) / `activities[]`. Parsing + validation
// live in `@transitrix/diagrams` (parseCanonicalFGCA / parseCanonicalFGA),
// which return this internal `DGCADoc` (numeric IDs, singular `goal_id`,
// `activity_ids`). This file only renders that doc — DGA reuses the DGCA
// renderer with the Changes column hidden.

interface DriverItem { id: number | string; name: string; }
interface GoalItem { id: number | string; name: string; level?: number; factor?: Array<{ id: number | string }>; }
interface ChangeItem { id: number | string; name: string; goal_id: number | string; activity_ids: Array<number | string>; }
interface ActivityItem { id: number | string; name: string; goal_id?: number | string | null; }

interface DGCADoc {
  notation: string;
  factors: DriverItem[];
  goals: GoalItem[];
  changes?: ChangeItem[];
  activities: ActivityItem[];
}

// ── Column layout ─────────────────────────────────────────────────────────────────────────────────
//
// Geometry + edge routing now live in @transitrix/diagrams
// (`layoutFGCAPreview`) so the configurable-gap behaviour (vkgeorgia/strategy#75)
// is unit-tested. This file owns only the SVG presentation of that layout and
// the column header labels.

// ── SVG renderer ──────────────────────────────────────────────────────────────
/** Goal options + deepest level for the scope control, from a parsed doc. DGCA
 *  and DGA goals are flat, so a `root` scope is the single matching goal. */
function scopeInputsFromDoc(doc: DGCADoc): { goals: ScopeGoalOption[]; maxLevelPresent: number } {
  return {
    goals: doc.goals.map(g => ({ id: String(g.id), name: g.name ?? '' })),
    maxLevelPresent: doc.goals.reduce((m, g) => Math.max(m, typeof g.level === 'number' ? g.level : 0), 0),
  };
}

// ── Chain table (#137) ───────────────────────────────────────────────────────
//
// The flattening + rowspan derivation lives in @transitrix/diagrams
// (`buildChainTable`). Here we render that model as an HTML <table>. Scope
// is a no-op in table view (per #137) — the table always shows the full doc.

const CHAIN_COLUMN_HEADERS: Record<ChainColumn, string> = {
  driver: 'Driver', goal: 'Goal', change: 'Change', activity: 'Action',
};

const CHAIN_TABLE_CSS = `
.chain-table-wrap { padding: 0 16px 16px; overflow-x: auto; }
.chain-table { border-collapse: collapse; font-size: 12px; }
.chain-table th, .chain-table td { border: 1px solid var(--ts-border, #cbd5e1); padding: 6px 12px; text-align: left; vertical-align: top; min-width: var(--ts-col-w, 120px); }
.chain-table th { background: var(--ts-bg-subtle, #f1f5f9); color: var(--ts-text, #0f172a); font-weight: 600; }
.chain-table td { color: var(--ts-text, #0f172a); }
.chain-table td.chain-empty { background: var(--ts-bg-subtle, #f8fafc); }
.chain-empty-table { padding: 24px 16px; color: var(--ts-text-muted, #64748b); }
`;

function chainTableHtml(table: ChainTable): string {
  if (table.rows.length === 0) {
    return `<div class="chain-empty-table">Nothing to tabulate — the document has no factors, goals or activities.</div>`;
  }
  const head = `<tr>${table.columns.map(c => `<th>${CHAIN_COLUMN_HEADERS[c]}</th>`).join('')}</tr>`;
  const body = table.rows.map(row => {
    const cells = row.map(c => {
      if (c === null) return ''; // covered by a rowspan above — emit no <td>
      const span = c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : '';
      if (c.cell === null) return `<td${span} class="chain-empty"></td>`;
      return `<td${span}>${escXml(c.cell.label)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');
  return `<div class="chain-table-wrap"><table class="chain-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

/** Assembles the interactive control-panel model shared by DGCA and DGA. */
function dgcaControlsModel(
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

interface ChainPreviewParams {
  /** Toolbar / frame notation label. */
  notation: 'DGCA' | 'DGA';
  /** Settings namespace + view key (`transitrix.{spacing,curvature,scope,view}.<this>`). */
  viewNotation: 'dgca' | 'dga';
  /** DGA hides the Change column. */
  hideChanges: boolean;
  /** SVG title-block heading (tree view). */
  heading: string;
  saveSvgCommand: string;
  savePngCommand: string;
  copyPngCommand: string;
  /** Snapshot markers for the timeline strip. */
  snapshotMarkers: SnapshotMarker[];
}

/**
 * Shared render path for the DGCA and DGA previews. Branches on the persisted
 * tree↔table view:
 *  - **tree** — the chain SVG, with the spacing/curvature/scope control panel +
 *    Save/Zoom toolbar (the PR #86 interactive surface) plus the view toggle.
 *  - **table** — the flattened chain table; the spacing/curvature/scope controls
 *    are hidden and scope is a no-op (the table always shows the full doc), so
 *    only the view toggle + Title toggle remain in the toolbar.
 * Returns the frame HTML and the tree SVG (for Save-as-SVG; empty in table view).
 */
function renderChainPreview(
  p: ChainPreviewParams,
  parsedDoc: DGCADoc | null,
  baseWarnings: string[],
  errorMsg: string,
  docVersion: string | undefined,
  docDate: string,
  filename: string,
  themeId: ThemeId,
): { html: string; svg: string } {
  const view = readView(p.viewNotation);
  const nonce = genNonce();
  const script = buildControlsScript(nonce);
  const viewToggleHtml = buildViewToggle(view);
  const captureButton = buildCaptureButton();
  const timelineStrip = buildTimelineStrip(p.snapshotMarkers);

  if (view === 'table') {
    // Scope is a no-op in table view, so no scope-warning is added here.
    const body = parsedDoc ? chainTableHtml(buildChainTable(parsedDoc, { hideChanges: p.hideChanges })) : '';
    const showHeader = !errorMsg && parsedDoc != null;
    const colW = vscode.workspace.getConfiguration('transitrix').get<string>('report.columnWidth', 'normal');
    const colWPx = colW === 'narrow' ? 80 : colW === 'wide' ? 200 : 120;
    const html = buildDiagramFrame({
      filename, notation: p.notation, bodyContent: body, errorMsg, warnings: baseWarnings, themeId,
      extraStyles: `:root { --ts-col-w: ${colWPx}px; }\n` + CHAIN_TABLE_CSS,
      title: showHeader ? p.heading : undefined,
      version: docVersion,
      date: showHeader ? docDate : undefined,
      interactive: { nonce, controlsPanel: '', controlsScript: script, viewToggleHtml },
      snapshotUi: { captureButton, timelineStrip },
    });
    return { html, svg: '' };
  }

  // Tree view (default) — the PR #86 interactive control surface.
  const spacingDefaults = { horizontalGap: FGCA_DEFAULT_COL_GAP, verticalGap: FGCA_DEFAULT_ROW_GAP };
  const gaps = readSpacing(p.viewNotation, spacingDefaults);
  const scope = readScope(p.viewNotation);
  const curvature = readCurvature(p.viewNotation);
  const entryCurvature = readEntryCurvature(p.viewNotation);
  const warnings = [...baseWarnings];
  let svg = '';
  let goalOptions: ScopeGoalOption[] = [];
  let maxLevelPresent = 0;
  if (parsedDoc) {
    ({ goals: goalOptions, maxLevelPresent } = scopeInputsFromDoc(parsedDoc));
    const scopeWarning = checkScopeRoot(scope, parsedDoc.goals.map(g => g.id));
    if (scopeWarning) warnings.push(`${scopeWarning.code}: ${scopeWarning.message}`);
    svg = buildSvg(parsedDoc, p.hideChanges, { colGap: gaps.horizontalGap, rowGap: gaps.verticalGap, curvature, entryCurvature, scope }, p.heading, filename, docDate, docVersion);
  }
  const model = dgcaControlsModel(gaps, spacingDefaults, curvature, scope, goalOptions, maxLevelPresent);
  const html = buildDiagramFrame({
    filename, notation: p.notation, svgContent: svg, errorMsg, warnings, themeId,
    saveSvgCommand: p.saveSvgCommand,
    savePngCommand: p.savePngCommand,
    copyPngCommand: p.copyPngCommand,
    spacingCommand: OPEN_SPACING_SETTINGS_COMMAND,
    curvatureCommand: OPEN_CURVATURE_SETTINGS_COMMAND,
    scopeCommand: OPEN_SCOPE_SETTINGS_COMMAND,
    themeCommand: OPEN_THEME_COMMAND,
    interactive: { nonce, controlsPanel: buildControlsPanel(model), controlsScript: script, viewToggleHtml },
    snapshotUi: { captureButton, timelineStrip },
  });
  return { html, svg };
}

function buildSvg(
  doc: DGCADoc,
  hideChanges = false,
  opts: { colGap?: number; rowGap?: number; curvature?: number; entryCurvature?: number; scope?: Scope } = {},
  heading?: string,
  filename?: string,
  date?: string,
  version?: string,
): string {
  const curvature = opts.curvature ?? DEFAULT_EDGE_CURVATURE;
  const entryCurvature = opts.entryCurvature;
  const { nodes, edges, columns, width, height } = layoutFGCAPreview(doc, {
    hideChanges,
    colGap: opts.colGap,
    rowGap: opts.rowGap,
    scope: opts.scope,
  });
  const showTitle = heading != null && filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;

  const body = renderFgcaBody(columns, nodes, edges, curvature, entryCurvature);

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
${body}
</g>
</svg>`;
}

// ── DGCAPreview webview class ────────────────────────────────────────────────────────────────────────────

export class DGCAPreview {
  readonly panelTitle = 'DGCA Preview';
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
        'dgcaPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          // Scripts enabled for the in-preview controls under the strict nonce
          // CSP (see goals-preview.ts for the full rationale; #75/#76/#77 PR2).
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
          enableCommandUris: ['transitrixStudio.saveDGCAAsSvg', 'transitrixStudio.saveDGCAAsPng', 'transitrixStudio.copyDGCAAsPng', OPEN_SPACING_SETTINGS_COMMAND, OPEN_CURVATURE_SETTINGS_COMMAND, OPEN_SCOPE_SETTINGS_COMMAND, OPEN_THEME_COMMAND],
        },
      );
      this.panel.webview.onDidReceiveMessage(async (m) => {
        if (m.type === 'transitrix:control') { void applyControlMessage('dgca', m); }
        if (m.type === 'transitrix:snapshot') { await this.handleSnapshotMessage(m as SnapshotMessage); }
      });
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

  /** Re-render the tracked document when a sibling canon element/relation saves. */
  async refreshIfSiblingSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    if (!doc.fileName.endsWith('.yaml')) return;
    const viewUri = vscode.Uri.parse(this.trackedUri);
    const canonRoot = findCanonRoot(viewUri);
    if (!canonRoot) return;
    if (!isUnderCanon(canonRoot, doc.uri)) return;
    const viewDoc = await vscode.workspace.openTextDocument(viewUri);
    await this.pushDocument(viewDoc);
  }

  private async loadSnapshotMarkers(): Promise<SnapshotMarker[]> {
    if (!this.trackedUri) return [];
    const viewUri = vscode.Uri.parse(this.trackedUri);
    const snapshotsDir = vscode.Uri.file(path.join(path.dirname(viewUri.fsPath), 'snapshots'));
    try {
      const entries = await vscode.workspace.fs.readDirectory(snapshotsDir);
      const files = entries
        .filter(([, type]) => type === vscode.FileType.File)
        .map(([name]) => name);
      return listSnapshotFiles(files).map(fname => ({
        filename: fname,
        dateLabel: fname.slice(0, 10),
      }));
    } catch {
      return [];
    }
  }

  private async handleSnapshotMessage(m: SnapshotMessage): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    const viewUri = vscode.Uri.parse(this.trackedUri);
    const viewDir = path.dirname(viewUri.fsPath);

    if (m.field === 'capture') {
      const doc = await vscode.workspace.openTextDocument(viewUri);
      const { viewId, methodologyVersion } = extractViewMeta(doc.getText());
      const today = new Date().toISOString().slice(0, 10);
      const chosenDate = await vscode.window.showInputBox({
        title: 'Capture snapshot — date',
        prompt: 'Date for this snapshot (YYYY-MM-DD). Accept today or enter a different date.',
        value: today,
        validateInput: v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Enter a date in YYYY-MM-DD format',
      });
      if (!chosenDate) return;
      const now = new Date();
      const fname = snapshotFilename(now);
      const generatedAt = now.toISOString().replace(/\.\d+Z$/, 'Z');
      const content = buildSnapshotContent({ viewId, generatedAt, methodologyVersion, capturedAtDate: chosenDate });
      const snapshotsDirUri = vscode.Uri.file(path.join(viewDir, 'snapshots'));
      await vscode.workspace.fs.createDirectory(snapshotsDirUri);
      const outPath = path.join(viewDir, 'snapshots', fname);
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(outPath),
        Buffer.from(content, 'utf-8'),
      );
      vscode.window.showInformationMessage(`Snapshot saved: ${fname}`);
      await this.pushDocument(doc);
    }

    if (m.field === 'load' && m.snapshot) {
      const snapshotPath = path.join(viewDir, 'snapshots', m.snapshot);
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(snapshotPath));
        const text = Buffer.from(bytes).toString('utf-8');
        const parsed = parseSnapshotForDisplay(text);
        void this.panel?.webview.postMessage({
          type: 'transitrix:snapshotLoaded',
          filename: m.snapshot,
          content: parsed,
        });
      } catch {
        vscode.window.showWarningMessage(`Could not read snapshot: ${m.snapshot}`);
      }
    }
  }

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const sources = await loadCanon(doc.uri);
    const markers = await this.loadSnapshotMarkers();
    this.panel.webview.html = this.buildHtml(doc.getText(), path.basename(doc.fileName), sources, markers);
  }

  private buildHtml(yamlText: string, filename: string, sources: CanonDocs, markers: SnapshotMarker[]): string {
    let parsedDoc: DGCADoc | null = null;
    let errorMsg = '';
    let warnings: string[] = [];
    let docVersion: string | undefined;
    let docDate = todayIso();

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      const meta = (parsed && typeof parsed === 'object' ? parsed : {}) as { version?: unknown; date?: unknown; generated_at?: unknown };
      docVersion = typeof meta.version === 'string' ? meta.version : undefined;
      docDate = (typeof meta.generated_at === 'string' ? meta.generated_at : undefined)
        ?? (typeof meta.date === 'string' ? meta.date : undefined)
        ?? todayIso();
      // Canon-projection form (VP-3): view_config present, no inline elements.
      // Fall back to inline parsing for legacy documents that carry factors[]/goals[].
      const input = isFGCAViewDoc(parsed) ? resolveFGCA(parsed, sources) : parsed;
      warnings = [...sources.warnings];
      const v = parseCanonicalFGCA(input);
      warnings.push(...v.warnings.map(w => `${w.code}: ${w.message}`));
      if (!v.valid || !v.parsed) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        parsedDoc = v.parsed as unknown as DGCADoc;
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    const { html, svg } = renderChainPreview(
      {
        notation: 'DGCA', viewNotation: 'dgca', hideChanges: false,
        heading: 'DGCA — Driver → Goal → Change → Action',
        saveSvgCommand: 'transitrixStudio.saveDGCAAsSvg',
        savePngCommand: 'transitrixStudio.saveDGCAAsPng',
        copyPngCommand: 'transitrixStudio.copyDGCAAsPng',
        snapshotMarkers: markers,
      },
      parsedDoc, warnings, errorMsg, docVersion, docDate, filename, themeId,
    );
    this.lastSvg = svg;
    return html;
  }

  private pngTarget() {
    return {
      rawSvg: this.lastSvg || undefined,
      themeId: vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix'),
      emptyMessage: 'No diagram rendered yet. Open a *.dgca.transitrix.yaml file first.',
    };
  }

  saveAsPng(): Promise<void> {
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    return savePngFromSvg({ ...this.pngTarget(), sourceUri, stripExt: /\.dgca\.transitrix\.yaml$/ });
  }

  copyAsPng(): Promise<void> {
    return copyPngFromSvg(this.pngTarget());
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.dgca.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.dgca\.transitrix\.yaml$/, '')
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

// ── DGAPreview webview class ──────────────────────────────────────────────────────────────────────────────

export class DGAPreview {
  readonly panelTitle = 'DGA Preview';
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
        'dgaPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          // Scripts enabled for the in-preview controls under the strict nonce
          // CSP (#75/#76/#77 PR2).
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
          enableCommandUris: ['transitrixStudio.saveDGAAsSvg', 'transitrixStudio.saveDGAAsPng', 'transitrixStudio.copyDGAAsPng', OPEN_SPACING_SETTINGS_COMMAND, OPEN_CURVATURE_SETTINGS_COMMAND, OPEN_SCOPE_SETTINGS_COMMAND, OPEN_THEME_COMMAND],
        },
      );
      this.panel.webview.onDidReceiveMessage(async (m) => {
        if (m.type === 'transitrix:control') { void applyControlMessage('dga', m); }
        if (m.type === 'transitrix:snapshot') { await this.handleSnapshotMessage(m as SnapshotMessage); }
      });
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

  private async loadSnapshotMarkers(): Promise<SnapshotMarker[]> {
    if (!this.trackedUri) return [];
    const viewUri = vscode.Uri.parse(this.trackedUri);
    const snapshotsDir = vscode.Uri.file(path.join(path.dirname(viewUri.fsPath), 'snapshots'));
    try {
      const entries = await vscode.workspace.fs.readDirectory(snapshotsDir);
      const files = entries
        .filter(([, type]) => type === vscode.FileType.File)
        .map(([name]) => name);
      return listSnapshotFiles(files).map(fname => ({
        filename: fname,
        dateLabel: fname.slice(0, 10),
      }));
    } catch {
      return [];
    }
  }

  private async handleSnapshotMessage(m: SnapshotMessage): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    const viewUri = vscode.Uri.parse(this.trackedUri);
    const viewDir = path.dirname(viewUri.fsPath);

    if (m.field === 'capture') {
      const doc = await vscode.workspace.openTextDocument(viewUri);
      const { viewId, methodologyVersion } = extractViewMeta(doc.getText());
      const today = new Date().toISOString().slice(0, 10);
      const chosenDate = await vscode.window.showInputBox({
        title: 'Capture snapshot — date',
        prompt: 'Date for this snapshot (YYYY-MM-DD). Accept today or enter a different date.',
        value: today,
        validateInput: v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Enter a date in YYYY-MM-DD format',
      });
      if (!chosenDate) return;
      const now = new Date();
      const fname = snapshotFilename(now);
      const generatedAt = now.toISOString().replace(/\.\d+Z$/, 'Z');
      const content = buildSnapshotContent({ viewId, generatedAt, methodologyVersion, capturedAtDate: chosenDate });
      const snapshotsDirUri = vscode.Uri.file(path.join(viewDir, 'snapshots'));
      await vscode.workspace.fs.createDirectory(snapshotsDirUri);
      const outPath = path.join(viewDir, 'snapshots', fname);
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(outPath),
        Buffer.from(content, 'utf-8'),
      );
      vscode.window.showInformationMessage(`Snapshot saved: ${fname}`);
      await this.pushDocument(doc);
    }

    if (m.field === 'load' && m.snapshot) {
      const snapshotPath = path.join(viewDir, 'snapshots', m.snapshot);
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(snapshotPath));
        const text = Buffer.from(bytes).toString('utf-8');
        const parsed = parseSnapshotForDisplay(text);
        void this.panel?.webview.postMessage({
          type: 'transitrix:snapshotLoaded',
          filename: m.snapshot,
          content: parsed,
        });
      } catch {
        vscode.window.showWarningMessage(`Could not read snapshot: ${m.snapshot}`);
      }
    }
  }

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const markers = await this.loadSnapshotMarkers();
    this.panel.webview.html = this.buildHtml(doc.getText(), path.basename(doc.fileName), markers);
  }

  private buildHtml(yamlText: string, filename: string, markers: SnapshotMarker[]): string {
    let parsedDoc: DGCADoc | null = null;
    let errorMsg = '';
    let warnings: string[] = [];
    let docVersion: string | undefined;
    let docDate = todayIso();

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      const meta = (parsed && typeof parsed === 'object' ? parsed : {}) as { version?: unknown; date?: unknown; generated_at?: unknown };
      docVersion = typeof meta.version === 'string' ? meta.version : undefined;
      docDate = (typeof meta.generated_at === 'string' ? meta.generated_at : undefined)
        ?? (typeof meta.date === 'string' ? meta.date : undefined)
        ?? todayIso();
      const v = parseCanonicalFGA(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid || !v.parsed) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        // DGA shares DGCA's FLAT shape; just hide the (absent) Changes column.
        parsedDoc = v.parsed as unknown as DGCADoc;
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    const { html, svg } = renderChainPreview(
      {
        notation: 'DGA', viewNotation: 'dga', hideChanges: true,
        heading: 'DGA — Driver → Goal → Activity',
        saveSvgCommand: 'transitrixStudio.saveDGAAsSvg',
        savePngCommand: 'transitrixStudio.saveDGAAsPng',
        copyPngCommand: 'transitrixStudio.copyDGAAsPng',
        snapshotMarkers: markers,
      },
      parsedDoc, warnings, errorMsg, docVersion, docDate, filename, themeId,
    );
    this.lastSvg = svg;
    return html;
  }

  private pngTarget() {
    return {
      rawSvg: this.lastSvg || undefined,
      themeId: vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix'),
      emptyMessage: 'No diagram rendered yet. Open a *.dga.transitrix.yaml file first.',
    };
  }

  saveAsPng(): Promise<void> {
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    return savePngFromSvg({ ...this.pngTarget(), sourceUri, stripExt: /\.dga\.transitrix\.yaml$/ });
  }

  copyAsPng(): Promise<void> {
    return copyPngFromSvg(this.pngTarget());
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.dga.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.dga\.transitrix\.yaml$/, '')
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
