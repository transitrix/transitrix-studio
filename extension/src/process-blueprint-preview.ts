import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import {
  validateProcessBlueprint,
  layoutProcessBlueprint,
  type AspectCategory,
  type ComplianceLaneConfig,
  type ComplianceLaneInput,
  type LaneConfig,
  type ProcessBlueprintFile,
  type ProcessBlueprintLayout,
} from '../../packages/diagrams/src/process-blueprint/index.js';
import { coerceDatesToIsoStrings } from '../../packages/diagrams/src/yaml-normalize.js';
import { savePngFromSvg, copyPngFromSvg } from './png-export.js';
import { scanComplianceCanon, type ScannedCanon } from './compliance-scan.js';
import { genNonce } from './preview-controls.js';

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

/**
 * Render a left-anchored, vertically centred multi-line text cell. `lines` are
 * pre-wrapped by the layout; the block is centred within the cell height.
 */
function textCellSvg(
  lines: string[],
  cls: string,
  x: number,
  cellTop: number,
  cellHeight: number,
  lineHeight: number,
): string {
  const ls = lines.length > 0 ? lines : [''];
  const first = cellTop + cellHeight / 2 - ((ls.length - 1) / 2) * lineHeight;
  const tspans = ls
    .map((ln, i) => `<tspan x="${x}" y="${first + i * lineHeight}">${escXml(ln)}</tspan>`)
    .join('');
  return `<text class="${cls}" dominant-baseline="central">${tspans}</text>`;
}

function complianceChipSvg(
  chip: import('../../packages/diagrams/src/process-blueprint/types.js').ComplianceChip,
  ox: number,
  oy: number,
  stageId: string,
): string {
  const { x, y, width, height, lawId, decorations } = chip;
  const ax = x + ox;
  const ay = y + oy;
  const hasNew = decorations.includes('new');
  const hasGap = decorations.includes('gap');
  const hasDeadline = decorations.includes('deadline');
  let rectClass = 'diagram-node level-5 compliance-chip';
  if (hasDeadline) rectClass += ' compliance-deadline';
  else if (hasGap) rectClass += ' compliance-gap';
  const strokeDash = hasNew ? ' stroke-dasharray="4 2"' : '';
  const parts: string[] = [];
  parts.push(
    `<rect class="${rectClass}" x="${ax}" y="${ay}" width="${width}" height="${height}" rx="6"${strokeDash}/>`,
  );
  parts.push(
    `<text class="text-pill" x="${ax + width / 2}" y="${ay + height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncate(lawId, Math.floor(width / 8)))}</text>`,
  );
  if (hasDeadline) {
    const br = 5;
    const bx = ax + width - br - 3;
    const by = ay + br + 3;
    parts.push(`<circle class="compliance-badge" cx="${bx}" cy="${by}" r="${br}"/>`);
    parts.push(
      `<text class="compliance-badge-text" x="${bx}" y="${by}" text-anchor="middle" dominant-baseline="central">!</text>`,
    );
  }
  // Wrap in a <g> so the chip is a single click target with drill-down data attributes.
  return `<g data-chip-law="${escXml(lawId)}" data-chip-stage="${escXml(stageId)}">\n${parts.join('\n')}\n</g>`;
}

function layoutToSvg(layout: ProcessBlueprintLayout, filename?: string, date?: string, version?: string): string {
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

  const textX = layout.cellTextPadX;
  for (const c of layout.goalCells) {
    parts.push(
      `<rect class="diagram-node level-3" x="${c.x + ox}" y="${c.y + oy}" width="${c.width}" height="${c.height}"/>`,
    );
    parts.push(
      textCellSvg(c.lines, 'text-secondary', c.x + ox + textX, c.y + oy, c.height, layout.textLineHeight),
    );
  }
  for (const c of layout.resultCells) {
    parts.push(
      `<rect class="diagram-node level-4" x="${c.x + ox}" y="${c.y + oy}" width="${c.width}" height="${c.height}"/>`,
    );
    parts.push(
      textCellSvg(c.lines, 'text-secondary', c.x + ox + textX, c.y + oy, c.height, layout.textLineHeight),
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

  // Compliance row (optional).
  if (layout.complianceRow) {
    const row = layout.complianceRow;
    parts.push(
      `<rect class="diagram-node level-5" x="${layout.legendColumnWidth + ox}" y="${row.y + oy}" width="${layout.bounds.width - layout.legendColumnWidth}" height="${row.height}" opacity="0.10"/>`,
    );
    for (let i = 1; i < layout.stageHeaders.length; i++) {
      const x = layout.legendColumnWidth + i * layout.stageColumnWidth + ox;
      parts.push(
        `<line class="diagram-edge" x1="${x}" y1="${row.y + oy}" x2="${x}" y2="${row.y + row.height + oy}" opacity="0.3"/>`,
      );
    }
    for (const chip of row.chips) {
      const stageId = layout.stageHeaders[chip.stageIndex]?.id ?? '';
      parts.push(complianceChipSvg(chip, ox, oy, stageId));
    }
  }

  const titleSvg = showTitle ? titleBlockSvg('Process Blueprint', filename!, date!, pad, pad, version) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${titleSvg}
${parts.join('\n')}
</svg>`;
}

// ── Compliance chip drill-down ───────────────────────────────────────────────

interface ChipDetailItem {
  reqId: string;
  reqName: string;
  deadline?: string;
  assertionId: string;
  status: string;
  subject: string;
}

interface ChipDetail {
  lawId: string;
  stageName: string;
  items: ChipDetailItem[];
}

/** Pre-compute per-chip detail rows from the scanned canon for client-side lookup. */
function buildChipDetailData(
  layout: ProcessBlueprintLayout,
  canon: ScannedCanon,
): Record<string, ChipDetail> {
  if (!layout.complianceRow) return {};

  const reqByLaw = new Map<string, Array<{ id: string; name: string; deadline?: string }>>();
  for (const req of canon.requirements) {
    for (const lawId of req.derived_from ?? []) {
      if (!reqByLaw.has(lawId)) reqByLaw.set(lawId, []);
      reqByLaw.get(lawId)!.push({ id: req.id, name: req.name, deadline: req.deadline });
    }
  }

  const assertionsByReq = new Map<string, Array<{ id: string; status: string; subject: string; realised_via?: string[] }>>();
  for (const a of canon.assertions) {
    if (!assertionsByReq.has(a.about)) assertionsByReq.set(a.about, []);
    assertionsByReq.get(a.about)!.push({ id: a.id, status: a.status, subject: a.subject, realised_via: a.realised_via });
  }

  const result: Record<string, ChipDetail> = {};
  for (const chip of layout.complianceRow.chips) {
    const stageHeader = layout.stageHeaders[chip.stageIndex];
    if (!stageHeader) continue;
    const { id: stageId, name: stageName } = stageHeader;
    const key = `${stageId}|${chip.lawId}`;
    const items: ChipDetailItem[] = [];
    for (const req of reqByLaw.get(chip.lawId) ?? []) {
      for (const a of assertionsByReq.get(req.id) ?? []) {
        const covers =
          !a.realised_via || a.realised_via.length === 0 || a.realised_via.includes(stageId);
        if (covers) {
          items.push({
            reqId: req.id,
            reqName: req.name,
            deadline: req.deadline,
            assertionId: a.id,
            status: a.status,
            subject: a.subject,
          });
        }
      }
    }
    result[key] = { lawId: chip.lawId, stageName, items };
  }
  return result;
}

const CHIP_DETAIL_PANEL_HTML = `
<div id="tx-chip-panel" hidden class="tx-chip-panel">
  <div class="tx-chip-panel-header">
    <span>Compliance detail</span>
    <button id="tx-chip-close" class="tx-chip-close" aria-label="Close">&times;</button>
  </div>
  <div id="tx-chip-content" class="tx-chip-content"></div>
</div>`;

const CHIP_DETAIL_CSS = `
[data-chip-law] { cursor: pointer; }
.tx-chip-panel {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: var(--vscode-editor-background, #ffffff);
  border-top: 2px solid var(--ts-border, #cbd5e1);
  padding: 10px 16px 14px;
  max-height: 260px; overflow-y: auto; z-index: 20;
  box-shadow: 0 -2px 8px rgba(0,0,0,0.12);
}
.tx-chip-panel[hidden] { display: none; }
.tx-chip-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.tx-chip-panel-header > span { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ts-text-muted, #64748b); }
.tx-chip-close { background: none; border: none; cursor: pointer; color: var(--ts-text-muted, #64748b); font-size: 18px; line-height: 1; padding: 0 4px; }
.tx-chip-close:hover { color: var(--ts-text, #0f172a); }
.tx-chip-law-heading { font-weight: 700; font-size: 14px; color: var(--ts-text, #0f172a); }
.tx-chip-stage-label { font-size: 11px; color: var(--ts-text-muted, #64748b); margin-left: 8px; }
.tx-chip-item { border-top: 1px solid var(--ts-border, #e2e8f0); padding: 6px 0 2px; margin-top: 4px; }
.tx-chip-req-id { font-size: 10px; font-weight: 600; color: var(--ts-text-muted, #64748b); letter-spacing: 0.05em; text-transform: uppercase; }
.tx-chip-req-name { font-size: 12px; color: var(--ts-text, #0f172a); margin: 2px 0; }
.tx-chip-deadline { font-size: 11px; color: var(--vscode-editorWarning-foreground, #c07030); margin-bottom: 4px; }
.tx-chip-assertion-row { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; margin-top: 2px; }
.tx-chip-subject { font-size: 11px; color: var(--ts-text-muted, #64748b); }
.tx-chip-status { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 10px; white-space: nowrap; }
.tx-chip-status-compliant { background: var(--ts-status-success-bg, #d1fae5); color: var(--ts-status-success-fg, #065f46); }
.tx-chip-status-partial { background: var(--ts-status-warning-bg, #fef9c3); color: var(--ts-status-warning-fg, #854d0e); }
.tx-chip-status-non-compliant { background: var(--ts-status-error-bg, #fee2e2); color: var(--ts-status-error-fg, #991b1b); }
.tx-chip-status-under-review, .tx-chip-status-pending-owner { background: var(--ts-status-info-bg, #e0f2fe); color: var(--ts-status-info-fg, #0c4a6e); }
.tx-chip-status-n-a { background: var(--ts-bg-elevated, #f1f5f9); color: var(--ts-text-muted, #64748b); }
.tx-chip-empty { color: var(--ts-text-muted, #64748b); font-size: 12px; padding: 4px 0; }
`;

function buildChipDetailScript(nonce: string, chipData: Record<string, ChipDetail>): string {
  const safeJson = JSON.stringify(chipData).replace(/<\//g, '<\\/');
  return `<script nonce="${nonce}">
(function () {
  var data = ${safeJson};
  var panel = document.getElementById('tx-chip-panel');
  var content = document.getElementById('tx-chip-content');
  var closeBtn = document.getElementById('tx-chip-close');
  if (!panel || !content) return;
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var STATUS_LABEL = {
    compliant: '\\u2713 Compliant', partial: '\\u007e Partial',
    non_compliant: '\\u2717 Non-compliant', under_review: '\\u2299 Under review',
    pending_owner: '\\u2299 Pending owner', n_a: '\\u2014 N/A'
  };
  function statusCls(s) { return 'tx-chip-status tx-chip-status-' + s.replace(/_/g, '-'); }
  function renderDetail(d) {
    var html = '<span class="tx-chip-law-heading">' + esc(d.lawId) + '<\\/span>'
             + '<span class="tx-chip-stage-label">\\u00b7 Stage: ' + esc(d.stageName) + '<\\/span>';
    if (!d.items || d.items.length === 0) {
      html += '<div class="tx-chip-empty">No assertions for this stage.<\\/div>';
    } else {
      for (var i = 0; i < d.items.length; i++) {
        var it = d.items[i];
        html += '<div class="tx-chip-item">'
              + '<div class="tx-chip-req-id">' + esc(it.reqId) + '<\\/div>'
              + '<div class="tx-chip-req-name">' + esc(it.reqName) + '<\\/div>';
        if (it.deadline) html += '<div class="tx-chip-deadline">Deadline: ' + esc(it.deadline) + '<\\/div>';
        html += '<div class="tx-chip-assertion-row">'
              + '<span class="tx-chip-subject">' + esc(it.subject) + '<\\/span> '
              + '<span class="' + statusCls(it.status) + '">' + esc(STATUS_LABEL[it.status] || it.status) + '<\\/span>'
              + '<\\/div><\\/div>';
      }
    }
    return html;
  }
  var groups = document.querySelectorAll('[data-chip-law]');
  for (var i = 0; i < groups.length; i++) {
    (function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var lawId = el.getAttribute('data-chip-law');
        var stageId = el.getAttribute('data-chip-stage');
        var key = stageId + '|' + lawId;
        var detail = data[key];
        if (!detail) { panel.hidden = true; return; }
        content.innerHTML = renderDetail(detail);
        panel.hidden = false;
      });
    })(groups[i]);
  }
  if (closeBtn) closeBtn.addEventListener('click', function () { panel.hidden = true; });
  document.addEventListener('click', function (e) {
    if (!panel.hidden && !panel.contains(e.target)) panel.hidden = true;
  });
}());
<\/script>`;
}

/** Extract compliance lane config from the blueprint's `lane_config:` block. */
function resolveLaneConfig(lc: LaneConfig | undefined): ComplianceLaneConfig {
  const ps = lc?.compliance_filter?.previous_snapshot;
  return {
    enabled: lc?.compliance === true,
    jurisdictions: Array.isArray(lc?.compliance_filter?.jurisdictions)
      ? (lc!.compliance_filter!.jurisdictions as string[]).filter((x): x is string => typeof x === 'string')
      : [],
    previousSnapshot:
      ps !== null && ps !== undefined && typeof ps === 'object' && !Array.isArray(ps)
        ? (ps as Record<string, string[]>)
        : undefined,
  };
}

const ASPECT_CATEGORY_IDS = ['systems', 'actors', 'equipment', 'information_entities'] as const;

/**
 * Read per-user display preferences from `.transitrix/display-preferences/process-blueprint.json`.
 * Returns an empty object when the file is absent or unreadable (non-fatal).
 */
async function readBlueprintDisplayPreferences(): Promise<{ visible_lanes?: string[] }> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return {};
  for (const folder of folders) {
    try {
      const prefUri = vscode.Uri.joinPath(
        folder.uri,
        '.transitrix',
        'display-preferences',
        'process-blueprint.json',
      );
      const bytes = await vscode.workspace.fs.readFile(prefUri);
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf-8')) as unknown;
      if (parsed !== null && typeof parsed === 'object' && 'visible_lanes' in parsed) {
        return parsed as { visible_lanes?: string[] };
      }
    } catch {
      // No prefs file in this workspace folder — try next.
    }
  }
  return {};
}

/** Project scanned compliance canon into the minimal shape the layout needs. */
function buildComplianceLaneInput(canon: ScannedCanon): ComplianceLaneInput {
  const codexJurisdictions: Record<string, string> = {};
  for (const c of canon.codex) {
    if (c.jurisdiction) codexJurisdictions[c.id] = c.jurisdiction;
  }
  return {
    assertions: canon.assertions.map(a => ({
      about: a.about,
      status: a.status,
      realised_via: a.realised_via,
    })),
    requirements: canon.requirements.map(r => ({
      id: r.id,
      derived_from: r.derived_from,
      deadline: r.deadline,
    })),
    codexJurisdictions,
  };
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
        { enableScripts: true, retainContextWhenHidden: true, enableCommandUris: ['transitrixStudio.saveProcessBlueprintAsSvg', 'transitrixStudio.saveProcessBlueprintAsPng', 'transitrixStudio.copyProcessBlueprintAsPng'] },
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
    this.panel.webview.html = await this.buildHtml(doc.getText(), path.basename(doc.fileName));
  }

  private async buildHtml(yamlText: string, filename: string): Promise<string> {
    let svgContent = '';
    let errorMsg = '';
    let warnings: string[] = [];
    let drillDownNonce = '';
    let drillDownScript = '';

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      const v = validateProcessBlueprint(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const file = parsed as ProcessBlueprintFile;
        const pb = (file as unknown as { process_blueprint?: { version?: unknown; date?: unknown } }).process_blueprint ?? {};
        const docVersion = typeof pb.version === 'string' ? pb.version : undefined;
        const docDate = typeof pb.date === 'string' ? pb.date : todayIso();

        // Compliance lane — scan workspace when opt-in via lane_config.compliance: true.
        const laneConfigRaw = file.process_blueprint?.lane_config;
        const laneCfg = resolveLaneConfig(laneConfigRaw);

        // Per-user display preferences override the blueprint's lane_config.visible_lanes.
        const userPrefs = await readBlueprintDisplayPreferences();
        const visibleLanes: string[] | undefined =
          userPrefs.visible_lanes ??
          (Array.isArray(laneConfigRaw?.visible_lanes) ? laneConfigRaw!.visible_lanes : undefined);

        // Derive visible aspect categories and compliance lane visibility from merged lanes.
        const visibleAspects: AspectCategory[] | undefined = visibleLanes
          ? (ASPECT_CATEGORY_IDS.filter(c => visibleLanes.includes(c)) as AspectCategory[])
          : undefined;
        const complianceVisible = visibleLanes ? visibleLanes.includes('compliance') : true;

        let complianceInput: ComplianceLaneInput | undefined;
        let scannedCanon: ScannedCanon | undefined;
        if (laneCfg.enabled && complianceVisible) {
          try {
            const canon = await scanComplianceCanon();
            scannedCanon = canon;
            complianceInput = buildComplianceLaneInput(canon);
          } catch {
            // Non-fatal: render blueprint without compliance lane if scan fails.
          }
        }

        const layout = layoutProcessBlueprint(file, {
          complianceLane: { ...laneCfg, enabled: laneCfg.enabled && complianceVisible },
          complianceInput,
          visibleAspects,
        });
        svgContent = layoutToSvg(layout, filename, docDate, docVersion);

        // Append the drill-down panel when compliance chips are present.
        if (layout.complianceRow && scannedCanon) {
          drillDownNonce = genNonce();
          drillDownScript = buildChipDetailScript(
            drillDownNonce,
            buildChipDetailData(layout, scannedCanon),
          );
        }
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    // Store pure SVG only — the drill-down HTML panel must not be included
    // here because lastSvg is passed directly to resvg for PNG rasterization.
    this.lastSvg = svgContent;
    const webviewSvgContent = drillDownNonce ? svgContent + CHIP_DETAIL_PANEL_HTML : svgContent;

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({
      filename,
      notation: 'Process Blueprint',
      svgContent: webviewSvgContent,
      errorMsg,
      warnings,
      themeId,
      extraStyles: CHIP_DETAIL_CSS,
      saveSvgCommand: 'transitrixStudio.saveProcessBlueprintAsSvg',
      savePngCommand: 'transitrixStudio.saveProcessBlueprintAsPng',
      copyPngCommand: 'transitrixStudio.copyProcessBlueprintAsPng',
      interactive: drillDownNonce
        ? { nonce: drillDownNonce, controlsPanel: '', controlsScript: drillDownScript }
        : undefined,
    });
  }

  private pngTarget() {
    return {
      rawSvg: this.lastSvg || undefined,
      themeId: vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix'),
      emptyMessage: 'No diagram rendered yet. Open a *.process-blueprint.transitrix.yaml file first.',
    };
  }

  saveAsPng(): Promise<void> {
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    return savePngFromSvg({ ...this.pngTarget(), sourceUri, stripExt: /\.process-blueprint\.transitrix\.yaml$/ });
  }

  copyAsPng(): Promise<void> {
    return copyPngFromSvg(this.pngTarget());
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
