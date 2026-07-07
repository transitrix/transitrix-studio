import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
import { savePngFromSvg, copyPngFromSvg } from './png-export.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import {
  layoutGoalTree,
  type GoalTreeLayout,
} from '@transitrix/diagrams/goals';
import { renderGoalsLayoutSvg } from '@transitrix/diagrams/webview/render-goals.js';
import { parseCanonicalGoals } from '@transitrix/diagrams/goals/parse-canonical.js';
import { coerceDatesToIsoStrings } from '@transitrix/diagrams/yaml-normalize.js';
import { DEFAULT_EDGE_CURVATURE } from '@transitrix/diagrams/edge-path.js';
import { checkScopeRoot } from '@transitrix/diagrams/scope.js';
import { readSpacing, readCurvature, readEntryCurvature, readScope, applyControlMessage, OPEN_SPACING_SETTINGS_COMMAND, OPEN_CURVATURE_SETTINGS_COMMAND, OPEN_SCOPE_SETTINGS_COMMAND, OPEN_NODE_SIZE_SETTINGS_COMMAND } from './spacing-config.js';
import { readGoalsNodeSize, readNodeSizePreset } from './node-size-config.js';
import { genNonce, buildControlsPanel, buildControlsScript, type ControlsModel, type ScopeGoalOption } from './preview-controls.js';

// ── SVG renderer ─────────────────────────────────────────────────────────────
//
// Validation, layout, and the canonical FLAT shape (`goal_types[]` +
// `goals[]` with numeric `parent_id`) all come from @transitrix/diagrams.
// This file only owns the SVG presentation of the layout the package
// produces — never re-defines the schema, since the example file and the
// shared package were drifting apart.

const RANK_SEP = 100;
const NODE_SEP = 24;

function layoutToSvg(layout: GoalTreeLayout, treeName: string, filename?: string, date?: string, version?: string, curvature: number = DEFAULT_EDGE_CURVATURE, entryCurvature?: number): string {
  // The SVG body (nodes, edges, arrow marker, edge geometry) comes from the
  // shared @transitrix/diagrams goals renderer — the single emitter for every
  // host. This preview only reserves room for and stacks its rich title block
  // on top. No theme CSS is embedded here: the webview supplies it live, and
  // export embeds it via prepareSvgForExport.
  const pad = 24;
  const showTitle = filename != null && date != null;
  const heading = treeName ? `Goal tree — ${treeName}` : 'Goal tree';
  const title = showTitle ? titleBlockSvg(heading, filename!, date!, pad, pad, version) : '';
  return renderGoalsLayoutSvg(layout, {
    curvature,
    entryCurvature,
    topInset: showTitle ? TITLE_BLOCK_H : 0,
    title,
  });
}

// ── GoalsPreview webview class ───────────────────────────────────────────────

export class GoalsPreview {
  readonly panelTitle = 'Goals Tree Preview';
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
        'goalsPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          // Scripts enabled for the in-preview spacing/curvature/scope controls
          // (vkgeorgia/strategy#75/#76/#77 PR2) under the strict nonce CSP set
          // in buildDiagramFrame. localResourceRoots is pinned to the
          // extension's own media even though the inline-nonce'd controls load
          // no resources — defence in depth per Valerii's posture call.
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
          enableCommandUris: ['transitrixStudio.saveGoalsAsSvg', 'transitrixStudio.saveGoalsAsPng', 'transitrixStudio.copyGoalsAsPng', OPEN_SPACING_SETTINGS_COMMAND, OPEN_CURVATURE_SETTINGS_COMMAND, OPEN_SCOPE_SETTINGS_COMMAND, OPEN_THEME_COMMAND],
        },
      );
      this.panel.webview.onDidReceiveMessage((m) => { void applyControlMessage('goals', m); });
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

    const spacingDefaults = { horizontalGap: RANK_SEP, verticalGap: NODE_SEP };
    const gaps = readSpacing('goals', spacingDefaults);
    const scope = readScope('goals');
    const curvature = readCurvature('goals');
    const entryCurvature = readEntryCurvature('goals');
    // Populated on a successful parse — feeds the scope root-picker dropdown
    // and the level-cap upper bound in the interactive control panel.
    let goalOptions: ScopeGoalOption[] = [];
    let maxLevelPresent = 0;

    try {
      const parsedYaml = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      const v = parseCanonicalGoals(parsedYaml);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid || !v.parsed) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const meta = parsedYaml as { name?: unknown; version?: unknown; date?: unknown; generated_at?: unknown };
        const treeName = typeof meta.name === 'string' ? meta.name : '';
        const docVersion = typeof meta.version === 'string' ? meta.version : undefined;
        const docDate = (typeof meta.generated_at === 'string' ? meta.generated_at : undefined)
          ?? (typeof meta.date === 'string' ? meta.date : undefined)
          ?? todayIso();
        goalOptions = v.parsed.goals.map(g => ({ id: g.canonical_id ?? String(g.id), name: g.name ?? '' }));
        maxLevelPresent = v.parsed.goals.reduce((m, g) => Math.max(m, typeof g.level === 'number' ? g.level : 0), 0);
        const scopeWarning = checkScopeRoot(scope, v.parsed.goals.map(g => g.canonical_id ?? g.id));
        if (scopeWarning) warnings.push(`${scopeWarning.code}: ${scopeWarning.message}`);
        const nodeSize = readGoalsNodeSize();
        const layout = layoutGoalTree(v.parsed, {
          nodeWidth: nodeSize.width,
          nodeHeight: nodeSize.height,
          rankSep: gaps.horizontalGap,
          nodeSep: gaps.verticalGap,
          scope,
        });
        svgContent = layoutToSvg(layout, treeName, filename, docDate, docVersion, curvature, entryCurvature);
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    this.lastSvg = svgContent;

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    const nonce = genNonce();
    const nodeSizePreset = readNodeSizePreset('goals');
    const model: ControlsModel = {
      spacing: { ...gaps, defaults: spacingDefaults },
      curvature: { value: curvature, default: 1 },
      nodeSize: { value: nodeSizePreset, default: 'normal' },
      scope: {
        rootId: scope.mode === 'root' ? scope.rootGoalId : '',
        maxLevel: scope.mode === 'level' ? scope.maxLevel : -1,
        maxLevelPresent,
        goals: goalOptions,
      },
    };

    return buildDiagramFrame({
      filename, notation: 'Goal tree', svgContent, errorMsg, warnings, themeId,
      saveSvgCommand: 'transitrixStudio.saveGoalsAsSvg',
      savePngCommand: 'transitrixStudio.saveGoalsAsPng',
      copyPngCommand: 'transitrixStudio.copyGoalsAsPng',
      spacingCommand: OPEN_SPACING_SETTINGS_COMMAND,
      curvatureCommand: OPEN_CURVATURE_SETTINGS_COMMAND,
      scopeCommand: OPEN_SCOPE_SETTINGS_COMMAND,
      themeCommand: OPEN_THEME_COMMAND,
      interactive: { nonce, controlsPanel: buildControlsPanel(model), controlsScript: buildControlsScript(nonce) },
    });
  }

  private pngTarget(): { rawSvg: string | undefined; themeId: ThemeId; emptyMessage: string } {
    return {
      rawSvg: this.lastSvg || undefined,
      themeId: vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix'),
      emptyMessage: 'No diagram rendered yet. Open a *.goals.transitrix.yaml or *.dgca.transitrix.yaml (with notation: goals) file first.',
    };
  }

  private sourceUri(): vscode.Uri | undefined {
    return this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
  }

  saveAsPng(): Promise<void> {
    return savePngFromSvg({ ...this.pngTarget(), sourceUri: this.sourceUri(), stripExt: /\.goals\.transitrix\.yaml$/ });
  }

  copyAsPng(): Promise<void> {
    return copyPngFromSvg(this.pngTarget());
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.goals.transitrix.yaml or *.dgca.transitrix.yaml (with notation: goals) file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.goals\.transitrix\.yaml$/, '')
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
