import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';
import {
  validateActivities,
  layoutActivities,
  computeCpm,
  computeGanttLayout,
  isGanttUnavailable,
  type ActivityDoc,
  type ActivitiesLayout,
  type GanttLayout,
  type GanttResult,
} from '../../packages/diagrams/src/activities/index.js';

// ── Shared helpers ───────────────────────────────────────────────────────────

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

// ── Network (PSND) SVG renderer ──────────────────────────────────────────────
//
// Consumes layoutActivities + computeCpm from @transitrix/diagrams. Studio
// supplies the SVG presentation layer only.

const N_NODE_W = 200;
const N_NODE_H = 80;
const N_PAD = 24;

function networkSvg(doc: ActivityDoc): string {
  const layout: ActivitiesLayout = layoutActivities(doc);
  if (layout.nodes.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="10" y="40" font-family="system-ui,sans-serif" font-size="13">No activities</text></svg>';
  }

  const cpm = computeCpm(doc.activities ?? []);
  const W = layout.bounds.width + N_PAD * 2;
  const H = layout.bounds.height + N_PAD * 2;
  const ox = -layout.bounds.x + N_PAD;
  const oy = -layout.bounds.y + N_PAD;

  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));
  const edgeSvg = layout.edges.map(e => {
    const s = nodeMap.get(e.sourceId);
    const t = nodeMap.get(e.targetId);
    if (!s || !t) return '';
    const sx = s.x + ox + s.width;
    const sy = s.y + oy + s.height / 2;
    const tx = t.x + ox;
    const ty = t.y + oy + t.height / 2;
    const mx = (sx + tx) / 2;
    const cls = e.isCritical ? 'diagram-edge critical-edge' : 'diagram-edge';
    return `<path d="M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}" class="${cls}" marker-end="url(#${e.isCritical ? 'arrow-crit' : 'arrow'})"/>`;
  }).join('\n');

  const nodeSvg = layout.nodes.map(n => {
    const x = n.x + ox;
    const y = n.y + oy;
    const isCritical = cpm.get(n.id)?.isCritical ?? false;
    const isMilestone = (n.data.duration ?? -1) === 0;
    const cls = `diagram-node act-node ${isCritical ? 'critical-node' : ''} ${isMilestone ? 'milestone-node' : ''}`.trim();
    const idLabel = escXml(n.id);
    const nameLabel = escXml(truncate(n.data.name, 24));
    const durLabel = n.data.duration !== undefined ? `${n.data.duration}d` : '—';
    return [
      `<rect class="${cls}" x="${x}" y="${y}" width="${N_NODE_W}" height="${N_NODE_H}" rx="6"/>`,
      `<text class="text-id" x="${x + 8}" y="${y + 18}" font-size="10" font-family="system-ui,sans-serif" font-weight="600">${idLabel}</text>`,
      `<text class="text-primary" x="${x + N_NODE_W / 2}" y="${y + N_NODE_H / 2 + 4}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="600" font-family="system-ui,sans-serif">${nameLabel}</text>`,
      `<text class="text-secondary" x="${x + N_NODE_W - 8}" y="${y + N_NODE_H - 10}" text-anchor="end" font-size="11" font-family="system-ui,sans-serif">${durLabel}</text>`,
    ].join('\n');
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
  <marker id="arrow-crit" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill-critical"/>
  </marker>
</defs>
${edgeSvg}
${nodeSvg}
</svg>`;
}

// ── Gantt SVG renderer ───────────────────────────────────────────────────────

const G_DAY_W = 24;       // px per calendar day on the timeline axis
const G_ROW_H = 28;
const G_LABEL_COL_W = 220;
const G_HEADER_H = 36;
const G_PAD = 24;
const G_BAR_INSET_Y = 4;  // top/bottom inset of bars inside the row band

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function daysBetween(startISO: string, endISO: string): number {
  const ms = parseISO(endISO).getTime() - parseISO(startISO).getTime();
  return Math.round(ms / 86_400_000);
}

function ganttSvg(layout: GanttLayout): string {
  // Sort bars by start date then id for stable display order.
  const bars = [...layout.bars].sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const totalDays = daysBetween(layout.timelineStart, layout.timelineEnd) + 1;
  const timelineWidth = totalDays * G_DAY_W;
  const W = G_LABEL_COL_W + timelineWidth + G_PAD * 2;
  const H = G_HEADER_H + bars.length * G_ROW_H + G_PAD * 2;

  const ox = G_PAD;
  const oy = G_PAD;

  // Date header strip: month labels above, day ticks below.
  const headerParts: string[] = [];
  headerParts.push(
    `<rect class="diagram-node gantt-header" x="${ox}" y="${oy}" width="${G_LABEL_COL_W + timelineWidth}" height="${G_HEADER_H}"/>`,
  );
  headerParts.push(
    `<text class="text-secondary" x="${ox + 12}" y="${oy + G_HEADER_H / 2}" dominant-baseline="central" font-size="11" font-weight="600" font-family="system-ui,sans-serif">Activity</text>`,
  );
  // Month band: walk days, group by yyyy-mm.
  const months: Array<{ label: string; startCol: number; endCol: number }> = [];
  for (let i = 0; i < totalDays; i++) {
    const d = parseISO(layout.timelineStart);
    d.setUTCDate(d.getUTCDate() + i);
    const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const last = months[months.length - 1];
    if (last && last.label === label) last.endCol = i;
    else months.push({ label, startCol: i, endCol: i });
  }
  for (const m of months) {
    const x = ox + G_LABEL_COL_W + m.startCol * G_DAY_W;
    const w = (m.endCol - m.startCol + 1) * G_DAY_W;
    headerParts.push(
      `<text class="text-secondary" x="${x + w / 2}" y="${oy + 14}" text-anchor="middle" dominant-baseline="central" font-size="10" font-family="system-ui,sans-serif">${escXml(m.label)}</text>`,
    );
  }
  // Day grid: thin vertical lines every 7 days.
  for (let i = 0; i <= totalDays; i += 7) {
    const x = ox + G_LABEL_COL_W + i * G_DAY_W;
    headerParts.push(
      `<line class="gantt-grid" x1="${x}" y1="${oy + G_HEADER_H}" x2="${x}" y2="${oy + G_HEADER_H + bars.length * G_ROW_H}"/>`,
    );
  }

  // Rows
  const rowParts: string[] = [];
  const yByBarId = new Map<string, number>();
  for (let r = 0; r < bars.length; r++) {
    const bar = bars[r];
    const rowY = oy + G_HEADER_H + r * G_ROW_H;
    yByBarId.set(bar.id, rowY + G_ROW_H / 2);

    // Alternating row band for readability.
    if (r % 2 === 1) {
      rowParts.push(
        `<rect class="gantt-row-alt" x="${ox}" y="${rowY}" width="${G_LABEL_COL_W + timelineWidth}" height="${G_ROW_H}"/>`,
      );
    }
    // Label column
    rowParts.push(
      `<text class="text-id" x="${ox + 8}" y="${rowY + G_ROW_H / 2}" dominant-baseline="central" font-size="10" font-family="system-ui,sans-serif" font-weight="600">${escXml(bar.id)}</text>`,
    );
    rowParts.push(
      `<text class="text-primary" x="${ox + 56}" y="${rowY + G_ROW_H / 2}" dominant-baseline="central" font-size="11" font-family="system-ui,sans-serif">${escXml(truncate(bar.name, 22))}</text>`,
    );

    // Bar geometry
    const startOffset = daysBetween(layout.timelineStart, bar.startDate);
    const endOffset = daysBetween(layout.timelineStart, bar.endDate);
    const barX = ox + G_LABEL_COL_W + startOffset * G_DAY_W;
    const barY = rowY + G_BAR_INSET_Y;
    const barH = G_ROW_H - G_BAR_INSET_Y * 2;

    if (bar.kind === 'milestone') {
      // Diamond marker
      const cx = barX + G_DAY_W / 2;
      const cy = rowY + G_ROW_H / 2;
      const s = barH / 2;
      const cls = `gantt-milestone ${bar.isCritical ? 'critical-bar' : ''}`.trim();
      rowParts.push(
        `<polygon class="${cls}" points="${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}"/>`,
      );
    } else {
      const widthDays = endOffset - startOffset + 1;
      const barWidth = widthDays * G_DAY_W;
      const cls = bar.kind === 'phase'
        ? 'gantt-phase'
        : `gantt-bar ${bar.isCritical ? 'critical-bar' : ''}`.trim();
      rowParts.push(
        `<rect class="${cls}" x="${barX}" y="${barY}" width="${barWidth}" height="${barH}" rx="3"/>`,
      );
    }
  }

  // Link lines
  const linkParts: string[] = [];
  for (const link of layout.links) {
    const sourceBar = bars.find(b => b.id === link.sourceId);
    const targetBar = bars.find(b => b.id === link.targetId);
    if (!sourceBar || !targetBar) continue;
    const sourceEndOffset = daysBetween(layout.timelineStart, sourceBar.endDate);
    const targetStartOffset = daysBetween(layout.timelineStart, targetBar.startDate);
    const sx = ox + G_LABEL_COL_W + (sourceEndOffset + 1) * G_DAY_W;
    const sy = yByBarId.get(link.sourceId) ?? 0;
    const tx = ox + G_LABEL_COL_W + targetStartOffset * G_DAY_W;
    const ty = yByBarId.get(link.targetId) ?? 0;
    const cls = link.isCritical ? 'diagram-edge critical-edge' : 'diagram-edge';
    // Right-angle elbow.
    linkParts.push(
      `<path d="M${sx},${sy} L${sx + 6},${sy} L${sx + 6},${ty} L${tx},${ty}" class="${cls}" fill="none"/>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${headerParts.join('\n')}
${rowParts.join('\n')}
${linkParts.join('\n')}
</svg>`;
}

// ── Stacked canvas content (network + gantt) ─────────────────────────────────

function buildCanvasContent(doc: ActivityDoc): string {
  const network = networkSvg(doc);
  const gantt: GanttResult = computeGanttLayout(doc);

  const networkSection = `<section class="diagram-section">
  <h3 class="section-heading">Network view — Project Schedule Network Diagram (PSND)</h3>
  ${network}
</section>`;

  let ganttSection: string;
  if (isGanttUnavailable(gantt)) {
    ganttSection = `<section class="diagram-section">
  <h3 class="section-heading">Gantt view</h3>
  <div class="section-notice">${escXml(gantt.reason)}</div>
</section>`;
  } else {
    const modeLabel = gantt.mode === 'computed'
      ? `computed mode (project ${gantt.timelineStart} → ${gantt.timelineEnd})`
      : `pinned mode (${gantt.timelineStart} → ${gantt.timelineEnd})`;
    ganttSection = `<section class="diagram-section">
  <h3 class="section-heading">Gantt view — ${escXml(modeLabel)}</h3>
  ${ganttSvg(gantt)}
</section>`;
  }

  return networkSection + ganttSection;
}

// ── Extra CSS injected into the diagram frame ───────────────────────────────

const ACTIVITIES_STYLES = `
  .diagram-section { margin: 16px 0; }
  .section-heading { font-size: 13px; font-weight: 600; color: var(--ts-text-muted, #64748b); margin: 0 16px 8px; letter-spacing: 0.02em; }
  .section-notice { margin: 0 16px; padding: 10px 14px; border-left: 3px solid var(--ts-text-muted, #94a3b8); background: var(--ts-bg-subtle, #f8fafc); color: var(--ts-text-muted, #64748b); font-size: 12px; }

  .act-node { fill: var(--ts-bg-surface, #f8fafc); stroke: var(--ts-border, #94a3b8); stroke-width: 1.5; }
  .critical-node { fill: #fff7ed; stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 2.5; }
  .milestone-node { fill: #ecfeff; stroke: var(--ts-text-muted, #64748b); stroke-dasharray: 4 2; }
  .critical-edge { stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 2; }
  .arrow-fill-critical { fill: var(--ts-brand-orange, #ff4d00); }
  .text-id { fill: var(--ts-text-muted, #64748b); }

  .gantt-header { fill: var(--ts-bg-subtle, #f1f5f9); stroke: var(--ts-border, #cbd5e1); stroke-width: 1; }
  .gantt-grid { stroke: var(--ts-border, #cbd5e1); stroke-width: 1; opacity: 0.5; }
  .gantt-row-alt { fill: var(--ts-bg-subtle, #f8fafc); opacity: 0.5; }
  .gantt-bar { fill: var(--ts-bg-surface, #dbeafe); stroke: var(--ts-border, #60a5fa); stroke-width: 1; }
  .gantt-bar.critical-bar { fill: #fff7ed; stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 1.5; }
  .gantt-phase { fill: var(--ts-text-muted, #475569); opacity: 0.85; }
  .gantt-milestone { fill: var(--ts-text, #0f172a); }
  .gantt-milestone.critical-bar { fill: var(--ts-brand-orange, #ff4d00); }
`;

// ── ActivitiesPreview webview class ───────────────────────────────────────────

export class ActivitiesPreview {
  readonly panelTitle = 'Activities Preview';
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
        'activitiesPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: false, retainContextWhenHidden: true },
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
    let bodyContent = '';
    let errorMsg = '';
    let warnings: string[] = [];

    try {
      const parsed = yaml.load(yamlText) as unknown;
      const v = validateActivities(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        bodyContent = buildCanvasContent(parsed as ActivityDoc);
        // Save-as-SVG exports only the network view today; the Gantt is a
        // companion section in the webview. (Reconsider when the Gantt becomes
        // a primary view.)
        this.lastSvg = networkSvg(parsed as ActivityDoc);
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    if (!bodyContent) this.lastSvg = '';

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({
      filename,
      notation: 'Activities (PSND + Gantt)',
      bodyContent,
      errorMsg,
      warnings,
      themeId,
      extraStyles: ACTIVITIES_STYLES,
    });
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.activities.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.activities\.transitrix\.yaml$/, '')
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
