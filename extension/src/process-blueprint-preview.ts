import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
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
  type RowId,
} from '../../packages/diagrams/src/process-blueprint/index.js';
import { coerceDatesToIsoStrings } from '../../packages/diagrams/src/yaml-normalize.js';
import { savePngFromSvg, copyPngFromSvg } from './png-export.js';
import { scanComplianceCanon, type ScannedCanon } from './compliance-scan.js';
import { genNonce } from './preview-controls.js';
import { escXml } from '../../packages/diagrams/src/webview/render-util.js';

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
  return `<g data-chip-law="${escXml(lawId)}" data-chip-stage="${escXml(stageId)}">\n${parts.join('\n')}\n</g>`;
}

function layoutToSvg(layout: ProcessBlueprintLayout, filename?: string, date?: string, version?: string): string {
  const pad = 24;
  const showTitle = filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;
  const tw = layout.bounds.width;
  const th = layout.bounds.height;
  const w = tw + pad * 2;
  const h = th + pad * 2 + titleH;
  const ox = pad;
  const oy = pad + titleH;
  const clipId = 'bp-clip';

  const parts: string[] = [];
  // Pills and chips collected separately so they render after (on top of) grid lines.
  const topParts: string[] = [];

  // Outer background (fill only; border drawn last on top).
  parts.push(
    `<rect class="diagram-node level-0 bp-row-bg" x="${ox}" y="${oy}" width="${tw}" height="${th}" rx="6" stroke="none"/>`,
  );

  // ClipPath — clips all inner content to the outer rounded rect so corner cells
  // don't visually overflow the rx=6 boundary.
  parts.push(`<defs><clipPath id="${clipId}"><rect x="${ox}" y="${oy}" width="${tw}" height="${th}" rx="6"/></clipPath></defs>`);

  const inner: string[] = [];

  // Stage headers (top row).
  for (const s of layout.stageHeaders) {
    inner.push(
      `<rect class="diagram-node level-1" x="${s.x + ox}" y="${s.y + oy}" width="${s.width}" height="${s.height}" stroke="none"/>`,
    );
    inner.push(
      `<text class="text-header" x="${s.x + ox + s.width / 2}" y="${s.y + oy + s.height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncate(s.name, 28))}</text>`,
    );
  }

  // Legend column (row labels).
  for (const l of layout.legend) {
    inner.push(
      `<rect class="diagram-node level-2 bp-row-bg" x="${ox}" y="${l.y + oy}" width="${layout.legendColumnWidth}" height="${l.height}" stroke="none"/>`,
    );
    inner.push(
      `<text class="text-primary" x="${ox + 12}" y="${l.y + oy + l.height / 2}" dominant-baseline="central">${escXml(l.label)}</text>`,
    );
  }

  // Goal and result cells.
  const textX = layout.cellTextPadX;
  for (const c of layout.goalCells) {
    inner.push(
      `<rect class="diagram-node level-3 bp-row-bg" x="${c.x + ox}" y="${c.y + oy}" width="${c.width}" height="${c.height}" stroke="none"/>`,
    );
    inner.push(textCellSvg(c.lines, 'text-secondary', c.x + ox + textX, c.y + oy, c.height, layout.textLineHeight));
  }
  for (const c of layout.resultCells) {
    inner.push(
      `<rect class="diagram-node level-4 bp-row-bg" x="${c.x + ox}" y="${c.y + oy}" width="${c.width}" height="${c.height}" stroke="none"/>`,
    );
    inner.push(textCellSvg(c.lines, 'text-secondary', c.x + ox + textX, c.y + oy, c.height, layout.textLineHeight));
  }

  // Aspect rows — transparent background; pills carry the colour.
  for (let r = 0; r < layout.aspectRows.length; r++) {
    const row = layout.aspectRows[r];
    const level = 5 + (r % 3);
    inner.push(
      `<rect class="diagram-node level-${level} bp-row-bg" x="${layout.legendColumnWidth + ox}" y="${row.y + oy}" width="${tw - layout.legendColumnWidth}" height="${row.height}" stroke="none"/>`,
    );
    for (const p of row.pills) {
      const cx = p.x + ox + p.width / 2;
      const pillLH = 15;
      // p.lines: name lines (possibly wrapped), optionally with id as last line.
      const hasIdLine = !!(p.id && p.lines.length > 0 && p.lines[p.lines.length - 1] === p.id);
      const nameLines = hasIdLine ? p.lines.slice(0, -1) : p.lines;
      const idLine = hasIdLine ? p.id : undefined;
      const pillFirstY = p.y + oy + p.height / 2 - ((p.lines.length - 1) / 2) * pillLH;
      topParts.push(
        `<rect class="diagram-node level-${level}" x="${p.x + ox}" y="${p.y + oy}" width="${p.width}" height="${p.height}" rx="6"/>`,
      );
      if (nameLines.length > 0) {
        const tspans = nameLines
          .map((ln, i) => `<tspan x="${cx}" y="${pillFirstY + i * pillLH}">${escXml(ln)}</tspan>`)
          .join('');
        topParts.push(`<text class="text-pill" text-anchor="middle" dominant-baseline="central">${tspans}</text>`);
      }
      if (idLine) {
        topParts.push(
          `<text class="text-secondary" x="${cx}" y="${pillFirstY + nameLines.length * pillLH}" text-anchor="middle" dominant-baseline="central">${escXml(idLine)}</text>`,
        );
      }
    }
  }

  // Compliance row (optional).
  if (layout.complianceRow) {
    const row = layout.complianceRow;
    inner.push(
      `<rect class="diagram-node level-5 bp-row-bg" x="${layout.legendColumnWidth + ox}" y="${row.y + oy}" width="${tw - layout.legendColumnWidth}" height="${row.height}" stroke="none"/>`,
    );
    for (const chip of row.chips) {
      const stageId = layout.stageHeaders[chip.stageIndex]?.id ?? '';
      topParts.push(complianceChipSvg(chip, ox, oy, stageId));
    }
  }

  // Grid lines — drawn before pills so they appear under pill content.
  const gridX1 = ox;
  const gridX2 = ox + tw;
  const gridY1 = oy;
  const gridY2 = oy + th;
  if (layout.legend.length > 0) {
    const headerBottomY = oy + layout.legend[0].y;
    inner.push(`<line class="diagram-edge" x1="${gridX1}" y1="${headerBottomY}" x2="${gridX2}" y2="${headerBottomY}"/>`);
    for (let i = 0; i < layout.legend.length - 1; i++) {
      const rowBottomY = oy + layout.legend[i].y + layout.legend[i].height;
      inner.push(`<line class="diagram-edge" x1="${gridX1}" y1="${rowBottomY}" x2="${gridX2}" y2="${rowBottomY}"/>`);
    }
  }
  const legLineX = ox + layout.legendColumnWidth;
  inner.push(`<line class="diagram-edge" x1="${legLineX}" y1="${gridY1}" x2="${legLineX}" y2="${gridY2}"/>`);
  for (let i = 1; i < layout.stageHeaders.length; i++) {
    const stageLineX = ox + layout.legendColumnWidth + i * layout.stageColumnWidth;
    inner.push(`<line class="diagram-edge" x1="${stageLineX}" y1="${gridY1}" x2="${stageLineX}" y2="${gridY2}"/>`);
  }

  // Inner content (fills + grid lines) clipped to rounded outer rect.
  parts.push(`<g clip-path="url(#${clipId})">${inner.join('\n')}${topParts.join('\n')}</g>`);

  // Outer border on top — fill="none" as attribute so PNG export (no external CSS) never shows black.
  parts.push(`<rect class="bp-border" x="${ox}" y="${oy}" width="${tw}" height="${th}" rx="6" fill="none"/>`);

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

const CHIP_LEGEND_HTML = `
<div id="bp-chip-legend">
  <span class="bp-chip-legend-heading">Legend</span>
  <span class="bp-chip-legend-item">
    <svg class="bp-chip-legend-svg" xmlns="http://www.w3.org/2000/svg" width="62" height="22">
      <rect class="diagram-node level-5 compliance-chip" x="1" y="1" width="60" height="20" rx="5"/>
      <text class="text-pill" x="31" y="11" text-anchor="middle" dominant-baseline="central">LAW-001</text>
    </svg>
    Compliant
  </span>
  <span class="bp-chip-legend-item">
    <svg class="bp-chip-legend-svg" xmlns="http://www.w3.org/2000/svg" width="62" height="22">
      <rect class="diagram-node level-5 compliance-chip" x="1" y="1" width="60" height="20" rx="5" stroke-dasharray="4 2"/>
      <text class="text-pill" x="31" y="11" text-anchor="middle" dominant-baseline="central">LAW-002</text>
    </svg>
    New since last report
  </span>
  <span class="bp-chip-legend-item">
    <svg class="bp-chip-legend-svg" xmlns="http://www.w3.org/2000/svg" width="62" height="22">
      <rect class="diagram-node level-5 compliance-chip compliance-gap" x="1" y="1" width="60" height="20" rx="5"/>
      <text class="text-pill" x="31" y="11" text-anchor="middle" dominant-baseline="central">LAW-003</text>
    </svg>
    Compliance gap
  </span>
  <span class="bp-chip-legend-item">
    <svg class="bp-chip-legend-svg" xmlns="http://www.w3.org/2000/svg" width="62" height="22">
      <rect class="diagram-node level-5 compliance-chip compliance-deadline" x="1" y="1" width="60" height="20" rx="5"/>
      <text class="text-pill" x="31" y="11" text-anchor="middle" dominant-baseline="central">LAW-004</text>
      <circle class="compliance-badge" cx="56" cy="6" r="5"/>
      <text class="compliance-badge-text" x="56" y="6" text-anchor="middle" dominant-baseline="central">!</text>
    </svg>
    Deadline risk
  </span>
</div>`;

// Outer border-only rect rendered on top of the clipped inner content.
const BLUEPRINT_CSS = `
.bp-border { fill: none; stroke: var(--ts-border, #cbd5e1); stroke-width: 1; }
`;

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
.bp-row-bg { fill: none; }
.bp-legend-btn::before { content: '\\2611\\00a0'; font-size: 12px; }
.bp-legend-btn.bp-hidden::before { content: '\\2610\\00a0'; font-size: 12px; }
.bp-legend-hidden #bp-chip-legend { display: none; }
#bp-chip-legend {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px 20px;
  padding: 8px 24px;
  font-size: 12px; color: var(--ts-text, #0f172a);
  border-top: 1px solid var(--ts-border, #e2e8f0);
  background: var(--ts-bg, #fff);
}
.bp-chip-legend-heading {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--ts-text-muted, #94a3b8); margin-right: 4px;
}
.bp-chip-legend-item { display: flex; align-items: center; gap: 6px; }
.bp-chip-legend-svg { display: block; flex-shrink: 0; overflow: visible; }
`;

function buildDisplayControls(
  rows: Array<{ id: string; label: string; hidden: boolean }>,
  columns: Array<{ id: string; label: string; hidden: boolean }>,
  stageColumnWidth: number,
): string {
  function chk(toggle: string, id: string, hidden: boolean, label: string): string {
    return `<label><input type="checkbox" data-bp-toggle="${escXml(toggle)}" data-bp-id="${escXml(id)}"${hidden ? '' : ' checked'}> ${escXml(label)}</label>`;
  }
  const rowHtml = rows.map(r => chk('row', r.id, r.hidden, r.label)).join(' ');
  const colHtml = columns.map(c => chk('column', c.id, c.hidden, c.label.length > 22 ? c.label.slice(0, 21) + '…' : c.label)).join(' ');
  return `<details class="tx-ctl" id="tx-bp-ctl">
  <summary>Display</summary>
  <div class="tx-ctl-body">
    <div class="tx-ctl-row"><span class="tx-ctl-label">Rows</span>${rowHtml}</div>
    <div class="tx-ctl-row"><span class="tx-ctl-label">Columns</span>${colHtml}</div>
    <div class="tx-ctl-row">
      <span class="tx-ctl-label">Col width</span>
      <input type="range" id="tx-bp-col-w-range" min="100" max="450" step="10" value="${stageColumnWidth}">
      <output id="tx-bp-col-w-out">${stageColumnWidth}</output>px
    </div>
  </div>
</details>`;
}

function buildBlueprintScript(nonce: string, chipData: Record<string, ChipDetail>): string {
  const safeJson = JSON.stringify(chipData).replace(/<\//g, '<\\/');
  return `<script nonce="${nonce}">
(function(){
var vscode=acquireVsCodeApi();
var toggles=document.querySelectorAll('[data-bp-toggle]');
for(var i=0;i<toggles.length;i++){(function(el){
  el.addEventListener('change',function(){
    vscode.postMessage({type:'transitrix:bp-toggle',kind:el.getAttribute('data-bp-toggle'),id:el.getAttribute('data-bp-id'),visible:el.checked});
  });
})(toggles[i]);}
var colWRange=document.getElementById('tx-bp-col-w-range');
var colWOut=document.getElementById('tx-bp-col-w-out');
if(colWRange){colWRange.addEventListener('input',function(){
  if(colWOut)colWOut.value=colWRange.value;
  vscode.postMessage({type:'transitrix:bp-toggle',kind:'column-width',value:Number(colWRange.value)});
});}
var det=document.getElementById('tx-bp-ctl');
if(det){var st=vscode.getState()||{};if(st.txBpCtlOpen)det.open=true;
  det.addEventListener('toggle',function(){var s=vscode.getState()||{};s.txBpCtlOpen=det.open;vscode.setState(s);});}
(function(){
  if(!document.getElementById('bp-chip-legend'))return;
  var legendBtn=document.createElement('label');
  legendBtn.className='title-toggle bp-legend-btn';
  legendBtn.title='Show or hide the compliance legend';
  legendBtn.textContent='Legend';
  var st2=vscode.getState()||{};
  if(st2.txBpLegendHidden){legendBtn.classList.add('bp-hidden');document.body.classList.add('bp-legend-hidden');}
  legendBtn.addEventListener('click',function(){
    var hiding=!legendBtn.classList.contains('bp-hidden');
    legendBtn.classList.toggle('bp-hidden',hiding);
    document.body.classList.toggle('bp-legend-hidden',hiding);
    var s=vscode.getState()||{};s.txBpLegendHidden=hiding;vscode.setState(s);
  });
  var actions=document.querySelector('#toolbar .toolbar-actions');
  if(actions){
    var titleLbl=actions.querySelector('label[for="ts-title-toggle"]');
    if(titleLbl){actions.insertBefore(legendBtn,titleLbl.nextSibling);}
    else{actions.insertBefore(legendBtn,actions.firstChild);}
  }
}());
var data=${safeJson};
var panel=document.getElementById('tx-chip-panel');
var content=document.getElementById('tx-chip-content');
var closeBtn=document.getElementById('tx-chip-close');
if(panel&&content){
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  var SL={compliant:'\\u2713 Compliant',partial:'\\u007e Partial',non_compliant:'\\u2717 Non-compliant',under_review:'\\u2299 Under review',pending_owner:'\\u2299 Pending owner',n_a:'\\u2014 N/A'};
  function sc(s){return 'tx-chip-status tx-chip-status-'+s.replace(/_/g,'-');}
  function rd(d){
    var h='<span class="tx-chip-law-heading">'+esc(d.lawId)+'<\\/span><span class="tx-chip-stage-label">\\u00b7 Stage: '+esc(d.stageName)+'<\\/span>';
    if(!d.items||!d.items.length){h+='<div class="tx-chip-empty">No assertions for this stage.<\\/div>';}
    else{for(var i=0;i<d.items.length;i++){var it=d.items[i];
      h+='<div class="tx-chip-item"><div class="tx-chip-req-id">'+esc(it.reqId)+'<\\/div><div class="tx-chip-req-name">'+esc(it.reqName)+'<\\/div>';
      if(it.deadline)h+='<div class="tx-chip-deadline">Deadline: '+esc(it.deadline)+'<\\/div>';
      h+='<div class="tx-chip-assertion-row"><span class="tx-chip-subject">'+esc(it.subject)+'<\\/span> <span class="'+sc(it.status)+'">'+esc(SL[it.status]||it.status)+'<\\/span><\\/div><\\/div>';
    }}return h;
  }
  var chips=document.querySelectorAll('[data-chip-law]');
  for(var i=0;i<chips.length;i++){(function(el){
    el.addEventListener('click',function(e){
      e.stopPropagation();
      var key=el.getAttribute('data-chip-stage')+'|'+el.getAttribute('data-chip-law');
      var d=data[key];if(!d){panel.hidden=true;return;}
      content.innerHTML=rd(d);panel.hidden=false;
    });
  })(chips[i]);}
  if(closeBtn)closeBtn.addEventListener('click',function(){panel.hidden=true;});
  document.addEventListener('click',function(e){if(!panel.hidden&&!panel.contains(e.target))panel.hidden=true;});
}
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
  private hiddenRows = new Set<string>();
  private hiddenStages = new Set<string>();
  private lastYamlText = '';
  private lastFilename = '';
  // Column width persists across documents (user preference).
  private stageColumnWidth = 220;

  isShowingDocument(uri: vscode.Uri): boolean {
    return this.panel != null && this.trackedUri === uri.toString();
  }

  async showOrReveal(doc: vscode.TextDocument): Promise<void> {
    if (doc.uri.toString() !== this.trackedUri) {
      this.hiddenRows.clear();
      this.hiddenStages.clear();
    }
    this.trackedUri = doc.uri.toString();
    if (this.panel) {
      this.panel.title = `${this.panelTitle} — ${path.basename(doc.fileName)}`;
      this.panel.reveal(vscode.ViewColumn.Beside, true);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'processBlueprintPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          enableCommandUris: [
            'transitrixStudio.saveProcessBlueprintAsSvg',
            'transitrixStudio.saveProcessBlueprintAsPng',
            'transitrixStudio.copyProcessBlueprintAsPng',
            'transitrixStudio.changeTheme',
          ],
        },
      );
      this.panel.onDidDispose(() => { this.panel = undefined; this.trackedUri = undefined; });
      this.panel.webview.onDidReceiveMessage(async (msg: unknown) => {
        if (!msg || typeof msg !== 'object') return;
        const m = msg as Record<string, unknown>;
        if (m['type'] !== 'transitrix:bp-toggle') return;
        const kind = m['kind'] as string;
        const id = m['id'] as string;
        const visible = Boolean(m['visible']);
        if (kind === 'row' || kind === 'column') {
          if (!id) return;
          if (kind === 'row') { if (visible) this.hiddenRows.delete(id); else this.hiddenRows.add(id); }
          else { if (visible) this.hiddenStages.delete(id); else this.hiddenStages.add(id); }
        } else if (kind === 'column-width') {
          const wv = Number(m['value']);
          if (Number.isFinite(wv)) this.stageColumnWidth = Math.max(100, Math.min(450, wv));
        }
        if (this.panel && this.lastYamlText) {
          this.panel.webview.html = await this.buildHtml(this.lastYamlText, this.lastFilename);
        }
      });
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

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    this.lastYamlText = doc.getText();
    this.lastFilename = path.basename(doc.fileName);
    this.panel.webview.html = await this.buildHtml(this.lastYamlText, this.lastFilename);
  }

  private async buildHtml(yamlText: string, filename: string): Promise<string> {
    let svgContent = '';
    let errorMsg = '';
    let warnings: string[] = [];
    let controlsPanel = '';
    let combinedScript = '';
    let nonce = '';

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      const v = validateProcessBlueprint(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const file = parsed as ProcessBlueprintFile;
        const raw = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
        const pb = (file as unknown as { process_blueprint?: { version?: unknown; date?: unknown } }).process_blueprint ?? {};
        const docVersion = typeof pb.version === 'string' ? pb.version : undefined;
        const docDate = (typeof raw['generated_at'] === 'string' ? raw['generated_at'] : undefined)
          ?? (typeof pb.date === 'string' ? pb.date : undefined)
          ?? todayIso();

        // Compliance lane — scan workspace when opt-in via lane_config.compliance: true.
        const laneConfigRaw = file.process_blueprint?.lane_config;
        const laneCfg = resolveLaneConfig(laneConfigRaw);

        // Per-user display preferences override the blueprint's lane_config.visible_lanes.
        const userPrefs = await readBlueprintDisplayPreferences();
        const visibleLanes: string[] | undefined =
          userPrefs.visible_lanes ??
          (Array.isArray(laneConfigRaw?.visible_lanes) ? laneConfigRaw!.visible_lanes : undefined);

        // Derive visible aspect categories from merged lanes (used when no visibleRows toggle active).
        const visibleAspects: AspectCategory[] | undefined = visibleLanes
          ? (ASPECT_CATEGORY_IDS.filter(c => visibleLanes.includes(c)) as AspectCategory[])
          : undefined;

        // Compute available rows (only rows that have data or are enabled).
        const availableRows: Array<{ id: string; label: string }> = [
          { id: 'goal', label: 'Goal' },
          { id: 'result', label: 'Result' },
        ];
        if (file.process_blueprint.systems?.length) availableRows.push({ id: 'systems', label: 'Systems' });
        if (file.process_blueprint.actors?.length) availableRows.push({ id: 'actors', label: 'Actors' });
        if (file.process_blueprint.equipment?.length) availableRows.push({ id: 'equipment', label: 'Equipment' });
        if (file.process_blueprint.information_entities?.length) availableRows.push({ id: 'information_entities', label: 'Information' });
        if (laneCfg.enabled) availableRows.push({ id: 'compliance', label: 'Compliance' });

        const availableStages = file.process_blueprint.stages.map(s => ({ id: s.id, name: s.name }));

        // Derive layout filter lists from session state.
        const visibleRowsForLayout: RowId[] | undefined = this.hiddenRows.size === 0
          ? undefined
          : (availableRows.map(r => r.id as RowId).filter(id => !this.hiddenRows.has(id)));

        const visibleStagesList: string[] | undefined = this.hiddenStages.size === 0
          ? undefined
          : availableStages.map(s => s.id).filter(id => !this.hiddenStages.has(id));

        // When user has interacted with toggles, their choice controls compliance;
        // otherwise fall back to the prefs-derived complianceVisible.
        const complianceVisibleByPrefs = visibleLanes ? visibleLanes.includes('compliance') : true;
        const complianceWillRender = laneCfg.enabled && (
          visibleRowsForLayout
            ? visibleRowsForLayout.includes('compliance')
            : complianceVisibleByPrefs
        );
        const complianceLaneEnabled = visibleRowsForLayout
          ? laneCfg.enabled  // let visibleRows handle filtering
          : laneCfg.enabled && complianceVisibleByPrefs;

        let complianceInput: ComplianceLaneInput | undefined;
        let scannedCanon: ScannedCanon | undefined;
        if (complianceWillRender) {
          try {
            const canon = await scanComplianceCanon();
            scannedCanon = canon;
            complianceInput = buildComplianceLaneInput(canon);
          } catch {
            // Non-fatal: render blueprint without compliance lane if scan fails.
          }
        }

        const layout = layoutProcessBlueprint(file, {
          stageColumnWidth: this.stageColumnWidth,
          complianceLane: { ...laneCfg, enabled: complianceLaneEnabled },
          complianceInput,
          visibleAspects: visibleRowsForLayout ? undefined : visibleAspects,
          visibleRows: visibleRowsForLayout,
          visibleStages: visibleStagesList,
        });
        svgContent = layoutToSvg(layout, filename, docDate, docVersion);

        // Build display controls panel and combined script.
        nonce = genNonce();
        const chipData = layout.complianceRow && scannedCanon
          ? buildChipDetailData(layout, scannedCanon)
          : {};
        controlsPanel = buildDisplayControls(
          availableRows.map(r => ({ ...r, hidden: this.hiddenRows.has(r.id) })),
          availableStages.map(s => ({ id: s.id, label: s.name, hidden: this.hiddenStages.has(s.id) })),
          this.stageColumnWidth,
        );
        combinedScript = buildBlueprintScript(nonce, chipData);

        // Append the drill-down panel and visual legend when compliance chips are present.
        if (layout.complianceRow) {
          svgContent = svgContent + CHIP_DETAIL_PANEL_HTML + CHIP_LEGEND_HTML;
        }
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    // Store pure SVG only — HTML blocks must be stripped before passing to resvg for PNG.
    this.lastSvg = svgContent.replace(CHIP_DETAIL_PANEL_HTML, '').replace(CHIP_LEGEND_HTML, '');

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({
      filename,
      notation: 'Process Blueprint',
      svgContent,
      errorMsg,
      warnings,
      themeId,
      extraStyles: BLUEPRINT_CSS + CHIP_DETAIL_CSS,
      saveSvgCommand: 'transitrixStudio.saveProcessBlueprintAsSvg',
      savePngCommand: 'transitrixStudio.saveProcessBlueprintAsPng',
      copyPngCommand: 'transitrixStudio.copyProcessBlueprintAsPng',
      themeCommand: OPEN_THEME_COMMAND,
      interactive: nonce
        ? { nonce, controlsPanel, controlsScript: combinedScript }
        : undefined,
    });
  }

  private pngTarget() {
    return {
      rawSvg: this.lastSvg || undefined,
      themeId: vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix'),
      notationCss: BLUEPRINT_CSS + CHIP_DETAIL_CSS,
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
