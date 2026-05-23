import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import {
  validateGoalTree,
  layoutGoalTree,
  type GoalTree,
  type GoalTreeLayout,
  type LaidOutEdge,
} from '../../packages/diagrams/src/goals/index.js';

// ── SVG renderer ─────────────────────────────────────────────────────────────
//
// Validation, layout, and the canonical FLAT shape (`goal_types[]` +
// `goals[]` with numeric `parent_id`) all come from @transitrix/diagrams.
// This file only owns the SVG presentation of the layout the package
// produces — never re-defines the schema, since the example file and the
// shared package were drifting apart.

const NODE_W = 250;
const NODE_H = 60;
const RANK_SEP = 100;
const NODE_SEP = 24;

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function layoutToSvg(layout: GoalTreeLayout, treeName: string, filename?: string, date?: string): string {
  const pad = 24;
  const showTitle = filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;
  const w = layout.bounds.width + pad * 2;
  const h = layout.bounds.height + pad * 2 + titleH;
  const ox = -layout.bounds.x + pad;
  const oy = -layout.bounds.y + pad + titleH;

  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));

  // Cubic bezier with horizontal control handles. Each control point shares
  // its endpoint's Y, so the tangent is horizontal at both ends and the
  // marker-end arrow reads as perpendicular to the node's vertical edge.
  // Handle length grows with both spans so the curve stays visibly
  // horizontal long enough for the arrowhead to sit flush against the line.
  const EDGE_MIN_HANDLE = 48;
  function edgePath(e: LaidOutEdge): string {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (!s || !t) return '';
    const sx = s.x + ox + s.width;
    const sy = s.y + oy + s.height / 2;
    const tx = t.x + ox;
    const ty = t.y + oy + t.height / 2;
    const dx = tx - sx;
    const dy = ty - sy;
    const handle = Math.max(EDGE_MIN_HANDLE, Math.abs(dx) * 0.5, Math.abs(dy) * 0.6);
    return `M${sx},${sy} C${sx + handle},${sy} ${tx - handle},${ty} ${tx},${ty}`;
  }

  const edgeSvg = layout.edges.map(e =>
    `<path d="${edgePath(e)}" class="diagram-edge" marker-end="url(#arrow)"/>`
  ).join('\n');

  const nodeSvg = layout.nodes.map(n => {
    const x = n.x + ox;
    const y = n.y + oy;
    const level = n.data.level % 8;
    const labelText = n.data.name ?? String(n.id);
    const label = labelText.length > 36 ? labelText.slice(0, 34) + '…' : labelText;
    return `<g>
  <rect class="diagram-node level-${level}" x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="8"/>
  <text class="text-primary" x="${x + n.width / 2}" y="${y + n.height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(label)}</text>
</g>`;
  }).join('\n');

  const heading = treeName ? `Goal tree — ${treeName}` : 'Goal tree';
  const titleSvg = showTitle ? titleBlockSvg(heading, filename!, date!, pad, pad) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
</defs>
${titleSvg}
${nodeSvg}
${edgeSvg}
</svg>`;
}

// ── GoalsPreview webview class ───────────────────────────────────────────────

export class GoalsPreview {
  readonly panelTitle = 'Goals Tree Preview';
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
        'goalsPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: false, retainContextWhenHidden: true, enableCommandUris: ['transitrixStudio.saveGoalsAsSvg'] },
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
      const v = validateGoalTree(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const tree = parsed as GoalTree;
        const treeName = (parsed as { title?: unknown }).title;
        const layout = layoutGoalTree(tree, {
          nodeWidth: NODE_W,
          nodeHeight: NODE_H,
          rankSep: RANK_SEP,
          nodeSep: NODE_SEP,
        });
        svgContent = layoutToSvg(layout, typeof treeName === 'string' ? treeName : '', filename, todayIso());
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    this.lastSvg = svgContent;

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({ filename, notation: 'Goal tree', svgContent, errorMsg, warnings, themeId, saveSvgCommand: 'transitrixStudio.saveGoalsAsSvg' });
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.goals.transitrix.yaml file first.');
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
