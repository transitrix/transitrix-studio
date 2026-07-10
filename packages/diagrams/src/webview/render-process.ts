/**
 * Host-neutral SVG emitter for the BPMN process notation.
 *
 * Part of the custom process renderer programme (ADR 2026-06-22).
 * P1: skeleton emitter — current DSL element subset: tasks, user/service tasks,
 * XOR/AND gateways, start/end events, data objects, sequence flows (with
 * default-flow markers), and association edges.
 *
 * Single-emitter unification (review C): `renderProcessBody` is the canonical
 * body shared by every host. Callers wrap it with a host-specific title block
 * or a standalone SVG shell.
 *
 * No VS Code APIs. No Node.js built-ins. Browser-safe.
 */

import { generateSvgEmbedCss } from '../theme/index.js';
import { escXml } from './render-util.js';

// ---------------------------------------------------------------------------
// Structural interface — mirrors LayoutIr from the BPMN core without taking a
// build-time dependency on that package. TypeScript structural typing ensures
// any LayoutIr value satisfies ProcessDiagramLayout.
// ---------------------------------------------------------------------------

export interface ProcessBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProcessFlowElement {
  id: string;
  type: string;
  name?: string;
}

export interface ProcessLane {
  id: string;
  name: string;
  elements: ProcessFlowElement[];
}

export interface ProcessInfo {
  id: string;
  name: string;
  poolId: string;
  poolName: string;
  lanes: ProcessLane[];
}

export interface ProcessFlow {
  id: string;
  from: string;
  to: string;
  condition?: string;
  default?: boolean;
  name?: string;
  waypoints: { x: number; y: number }[];
}

export interface ProcessAssociation {
  id: string;
  from: string;
  to: string;
  waypoints: { x: number; y: number }[];
}

export interface ProcessDiagramLayout {
  process: ProcessInfo;
  elements: Map<string, ProcessBounds>;
  laneBounds: Map<string, ProcessBounds>;
  poolBounds: ProcessBounds;
  flows: ProcessFlow[];
  associations: ProcessAssociation[];
}

export interface RenderProcessOptions {
  /** Raw SVG injected after `<style>` — a title line or full title block. */
  title?: string;
  /** Extra vertical space (px) reserved above the pool for a title block. */
  topInset?: number;
}

// ---------------------------------------------------------------------------
// Constants — match DEFAULT_LAYOUT_DIAGRAM_OPTIONS in src/layout-options.ts
// ---------------------------------------------------------------------------

/** Width of the lane-name column (px). Matches the laneLabelWidth default. */
const LANE_LABEL_BAND = 44;

/** End margin (px) along the header height axis for rotated pool/lane captions. */
const HEADER_LABEL_AXIS_PAD = 32;

/** Estimated horizontal advance (px) per character at the header label font size. */
const HEADER_LABEL_CHAR_W = 6.5;

/** Maximum characters per wrapped line inside a task box. */
const TASK_CHARS = 14;

/** Line height for wrapped task-name text (px). */
const TASK_LINE_H = 14;

/** Maximum characters per line for below-element labels (events, gateways). */
const LABEL_CHARS = 18;

/** Line height for multi-line below-element labels (px). */
const LABEL_LINE_H = 13;

// ---------------------------------------------------------------------------
// BPMN-specific CSS — no font-style:italic per CLAUDE.md design rule
// ---------------------------------------------------------------------------

export const BPMN_PROCESS_CSS = `
.bpmn-pool { fill: var(--ts-bg-surface,#f8fafc); stroke: var(--ts-node-stroke,#004d67); stroke-width: 1.5; }
.bpmn-pool-name { fill: var(--ts-bg-elevated,#f1f5f9); stroke: var(--ts-node-stroke,#004d67); stroke-width: 0.75; }
.bpmn-lane { fill: var(--ts-bg,#ffffff); stroke: var(--ts-node-stroke,#004d67); stroke-width: 0.75; }
.bpmn-lane-header { fill: var(--ts-bg-elevated,#f1f5f9); stroke: var(--ts-node-stroke,#004d67); stroke-width: 0.75; }
.bpmn-pool-label { fill: var(--ts-text-primary,#0d2b35); font-size: 11px; font-weight: 700; }
.bpmn-lane-label { fill: var(--ts-text-primary,#0d2b35); font-size: 11px; font-weight: 600; }
.bpmn-task { fill: var(--ts-bg,#ffffff); stroke: var(--ts-node-stroke,#004d67); stroke-width: 1.5; }
.bpmn-task-name { fill: var(--ts-text-primary,#0d2b35); font-size: 11px; text-anchor: middle; }
.bpmn-event { fill: var(--ts-bg,#ffffff); stroke: var(--ts-node-stroke,#004d67); }
.bpmn-event-start { stroke-width: 1.5; }
.bpmn-event-end { stroke-width: 4; }
.bpmn-event-label { fill: var(--ts-text-secondary,#516970); font-size: 10px; text-anchor: middle; }
.bpmn-gateway { fill: var(--ts-bg,#ffffff); stroke: var(--ts-node-stroke,#004d67); stroke-width: 1.5; }
.bpmn-gateway-marker { stroke: var(--ts-node-stroke,#004d67); stroke-width: 2.5; stroke-linecap: round; fill: none; }
.bpmn-gateway-label { fill: var(--ts-text-secondary,#516970); font-size: 10px; text-anchor: middle; }
.bpmn-seq-flow { fill: none; stroke: var(--ts-edge-stroke,#004d67); stroke-width: 1.5; }
.bpmn-default-mark { stroke: var(--ts-edge-stroke,#004d67); stroke-width: 1.5; stroke-linecap: round; }
.bpmn-assoc { fill: none; stroke: var(--ts-edge-stroke,#004d67); stroke-width: 1; stroke-dasharray: 4 2; }
.bpmn-data-obj { fill: var(--ts-bg,#ffffff); stroke: var(--ts-node-stroke,#004d67); stroke-width: 1; }
.bpmn-data-obj-label { fill: var(--ts-text-secondary,#516970); font-size: 10px; text-anchor: middle; }
.bpmn-event-intermediate { fill: none; stroke: var(--ts-node-stroke,#004d67); stroke-width: 1; }
.bpmn-event-icon { fill: none; stroke: var(--ts-node-stroke,#004d67); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
`;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function r(n: number): number {
  return Math.round(n);
}

/** Truncate at a word boundary so rotated header labels never break mid-word. */
function wordTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut) + '…';
}

function fitRotatedHeaderText(name: string, spanPx: number): string {
  const maxChars = Math.max(4, Math.floor(spanPx / HEADER_LABEL_CHAR_W));
  return wordTruncate(name, maxChars);
}

function wrapTaskName(name: string): string[] {
  if (!name) return [];
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const token = w.length > TASK_CHARS ? w.slice(0, TASK_CHARS - 1) + '…' : w;
    if (!cur) {
      cur = token;
    } else if (cur.length + 1 + token.length <= TASK_CHARS) {
      cur += ' ' + token;
    } else {
      lines.push(cur);
      if (lines.length === 3) {
        if (lines[2].length > TASK_CHARS - 1) lines[2] = lines[2].slice(0, TASK_CHARS - 1) + '…';
        return lines;
      }
      cur = token;
    }
  }
  if (cur && lines.length < 3) lines.push(cur);
  if (lines.length === 0) lines.push(name.slice(0, TASK_CHARS));
  return lines;
}

function taskNameSvg(name: string | undefined, cx: number, cy: number): string {
  if (!name) return '';
  const lines = wrapTaskName(name);
  const totalH = lines.length * TASK_LINE_H;
  const startY = cy - totalH / 2 + TASK_LINE_H * 0.8;
  const tspans = lines
    .map((ln, i) => `<tspan x="${r(cx)}" y="${r(startY + i * TASK_LINE_H)}">${escXml(ln)}</tspan>`)
    .join('');
  return `<text class="bpmn-task-name">${tspans}</text>`;
}

function wrapBelowLabel(name: string): string[] {
  const words = name.split(/\s+/).filter(Boolean);
  const allLines: string[] = [];
  let cur = '';
  for (const word of words) {
    const tok = word.length > LABEL_CHARS ? word.slice(0, LABEL_CHARS - 1) + '…' : word;
    const test = cur ? `${cur} ${tok}` : tok;
    if (test.length <= LABEL_CHARS) {
      cur = test;
    } else {
      if (cur) allLines.push(cur);
      cur = tok;
    }
  }
  if (cur) allLines.push(cur);
  if (allLines.length === 0) return [name.slice(0, LABEL_CHARS)];
  if (allLines.length <= 3) return allLines;
  const lines = allLines.slice(0, 3);
  const last = lines[2];
  lines[2] = last.length + 1 <= LABEL_CHARS ? last + '…' : last.slice(0, LABEL_CHARS - 1) + '…';
  return lines;
}

function belowLabelSvg(name: string | undefined, cls: string, cx: number, belowY: number, minX = 0): string {
  if (!name) return '';
  const lines = wrapBelowLabel(name);
  const halfW = Math.max(...lines.map((l) => l.length)) * 3;
  const textX = minX > 0 ? Math.max(cx, minX + halfW + 2) : cx;
  const startY = r(belowY + 12);
  if (lines.length === 1) {
    return `<text class="${cls}" x="${r(textX)}" y="${startY}">${escXml(lines[0])}</text>`;
  }
  const tspans = lines
    .map((ln, i) => `<tspan x="${r(textX)}" dy="${i === 0 ? 0 : LABEL_LINE_H}">${escXml(ln)}</tspan>`)
    .join('');
  return `<text class="${cls}" x="${r(textX)}" y="${startY}">${tspans}</text>`;
}

// ---------------------------------------------------------------------------
// Element renderer
// ---------------------------------------------------------------------------

function renderElement(el: ProcessFlowElement, b: ProcessBounds, ox: number, oy: number, minLabelX = 0): string {
  const ex = b.x + ox;
  const ey = b.y + oy;
  const cx = ex + b.width / 2;
  const cy = ey + b.height / 2;
  const halfR = Math.min(b.width, b.height) / 2;

  switch (el.type) {
    case 'startEvent':
      return [
        `<circle class="bpmn-event bpmn-event-start" cx="${r(cx)}" cy="${r(cy)}" r="${r(halfR)}"/>`,
        belowLabelSvg(el.name, 'bpmn-event-label', cx, ey + b.height, minLabelX),
      ].join('\n');

    case 'endEvent':
      return [
        `<circle class="bpmn-event bpmn-event-end" cx="${r(cx)}" cy="${r(cy)}" r="${r(halfR - 2)}"/>`,
        belowLabelSvg(el.name, 'bpmn-event-label', cx, ey + b.height, minLabelX),
      ].join('\n');

    case 'task':
    case 'userTask':
    case 'serviceTask':
      return [
        `<rect class="diagram-node bpmn-task" x="${r(ex)}" y="${r(ey)}" width="${r(b.width)}" height="${r(b.height)}" rx="4" ry="4"/>`,
        taskNameSvg(el.name, cx, cy),
      ].join('\n');

    case 'exclusiveGateway':
      return [
        `<path class="bpmn-gateway" d="M ${r(cx)},${r(ey)} L ${r(ex + b.width)},${r(cy)} L ${r(cx)},${r(ey + b.height)} L ${r(ex)},${r(cy)} Z"/>`,
        `<path class="bpmn-gateway-marker" d="M ${r(cx - 10)},${r(cy - 10)} L ${r(cx + 10)},${r(cy + 10)} M ${r(cx + 10)},${r(cy - 10)} L ${r(cx - 10)},${r(cy + 10)}"/>`,
        belowLabelSvg(el.name, 'bpmn-gateway-label', cx, ey + b.height, minLabelX),
      ].join('\n');

    case 'parallelGateway':
      return [
        `<path class="bpmn-gateway" d="M ${r(cx)},${r(ey)} L ${r(ex + b.width)},${r(cy)} L ${r(cx)},${r(ey + b.height)} L ${r(ex)},${r(cy)} Z"/>`,
        `<path class="bpmn-gateway-marker" d="M ${r(cx)},${r(cy - 12)} L ${r(cx)},${r(cy + 12)} M ${r(cx - 12)},${r(cy)} L ${r(cx + 12)},${r(cy)}"/>`,
        belowLabelSvg(el.name, 'bpmn-gateway-label', cx, ey + b.height, minLabelX),
      ].join('\n');

    case 'inclusiveGateway':
      return [
        `<path class="bpmn-gateway" d="M ${r(cx)},${r(ey)} L ${r(ex + b.width)},${r(cy)} L ${r(cx)},${r(ey + b.height)} L ${r(ex)},${r(cy)} Z"/>`,
        `<circle class="bpmn-gateway-marker" cx="${r(cx)}" cy="${r(cy)}" r="${r(halfR * 0.4)}"/>`,
        belowLabelSvg(el.name, 'bpmn-gateway-label', cx, ey + b.height, minLabelX),
      ].join('\n');

    case 'intermediateMessageEvent': {
      const innerR = r(halfR - 4);
      const eHW = r(halfR * 0.45);
      const eHH = r(halfR * 0.3);
      return [
        `<circle class="bpmn-event bpmn-event-start" cx="${r(cx)}" cy="${r(cy)}" r="${r(halfR)}"/>`,
        `<circle class="bpmn-event-intermediate" cx="${r(cx)}" cy="${r(cy)}" r="${innerR}"/>`,
        `<rect class="bpmn-event-icon" x="${r(cx - eHW)}" y="${r(cy - eHH)}" width="${r(eHW * 2)}" height="${r(eHH * 2)}"/>`,
        `<path class="bpmn-event-icon" d="M ${r(cx - eHW)},${r(cy - eHH)} L ${r(cx)},${r(cy)} L ${r(cx + eHW)},${r(cy - eHH)}"/>`,
        belowLabelSvg(el.name, 'bpmn-event-label', cx, ey + b.height, minLabelX),
      ].join('\n');
    }

    case 'intermediateTimerEvent': {
      const innerR = r(halfR - 4);
      const clockR = r(halfR * 0.5);
      const handLen = r(halfR * 0.38);
      return [
        `<circle class="bpmn-event bpmn-event-start" cx="${r(cx)}" cy="${r(cy)}" r="${r(halfR)}"/>`,
        `<circle class="bpmn-event-intermediate" cx="${r(cx)}" cy="${r(cy)}" r="${innerR}"/>`,
        `<circle class="bpmn-event-icon" cx="${r(cx)}" cy="${r(cy)}" r="${clockR}"/>`,
        `<line class="bpmn-event-icon" x1="${r(cx)}" y1="${r(cy)}" x2="${r(cx)}" y2="${r(cy - handLen)}"/>`,
        `<line class="bpmn-event-icon" x1="${r(cx)}" y1="${r(cy)}" x2="${r(cx + r(handLen * 0.7))}" y2="${r(cy)}"/>`,
        belowLabelSvg(el.name, 'bpmn-event-label', cx, ey + b.height, minLabelX),
      ].join('\n');
    }

    case 'dataObject': {
      const fold = Math.min(8, b.width / 3, b.height / 3);
      return [
        `<path class="bpmn-data-obj" d="M ${r(ex)},${r(ey)} L ${r(ex + b.width - fold)},${r(ey)} L ${r(ex + b.width)},${r(ey + fold)} L ${r(ex + b.width)},${r(ey + b.height)} L ${r(ex)},${r(ey + b.height)} Z"/>`,
        `<path class="bpmn-data-obj" fill="none" d="M ${r(ex + b.width - fold)},${r(ey)} L ${r(ex + b.width - fold)},${r(ey + fold)} L ${r(ex + b.width)},${r(ey + fold)}"/>`,
        belowLabelSvg(el.name, 'bpmn-data-obj-label', cx, ey + b.height, minLabelX),
      ].join('\n');
    }

    default:
      return [
        `<rect class="diagram-node" x="${r(ex)}" y="${r(ey)}" width="${r(b.width)}" height="${r(b.height)}"/>`,
        el.name
          ? `<text class="text-primary" x="${r(cx)}" y="${r(cy)}" text-anchor="middle" dominant-baseline="central">${escXml(el.name)}</text>`
          : '',
      ].join('\n');
  }
}

// ---------------------------------------------------------------------------
// Pool / lane structure
// ---------------------------------------------------------------------------

function renderPoolLanes(layout: ProcessDiagramLayout, ox: number, oy: number): string {
  const { process, laneBounds, poolBounds: pb } = layout;
  const parts: string[] = [];
  const px = r(pb.x + ox);
  const py = r(pb.y + oy);
  const pw = r(pb.width);
  const ph = r(pb.height);

  // Pool name band width: distance from pool left edge to first lane left edge
  const firstLb = laneBounds.size > 0 ? [...laneBounds.values()][0] : undefined;
  const poolNameW = firstLb ? r(firstLb.x - pb.x) : 48;

  parts.push(`<rect class="bpmn-pool" x="${px}" y="${py}" width="${pw}" height="${ph}"/>`);
  parts.push(`<rect class="bpmn-pool-name" x="${px}" y="${py}" width="${poolNameW}" height="${ph}"/>`);

  const pLX = r(px + poolNameW / 2);
  const poolLabelSpan = Math.max(ph - 2 * HEADER_LABEL_AXIS_PAD, 0);
  const pLY = r(py + HEADER_LABEL_AXIS_PAD + poolLabelSpan / 2);
  parts.push(
    `<text class="bpmn-pool-label" text-anchor="middle" dominant-baseline="central"` +
    ` transform="rotate(-90,${pLX},${pLY})" x="${pLX}" y="${pLY}">${escXml(fitRotatedHeaderText(process.poolName, poolLabelSpan))}</text>`,
  );

  for (const lane of process.lanes) {
    const lb = laneBounds.get(lane.id);
    if (!lb) continue;
    const lx = r(lb.x + ox);
    const ly = r(lb.y + oy);
    const lw = r(lb.width);
    const lh = r(lb.height);

    parts.push(`<rect class="bpmn-lane" x="${lx}" y="${ly}" width="${lw}" height="${lh}"/>`);
    parts.push(`<rect class="bpmn-lane-header" x="${lx}" y="${ly}" width="${LANE_LABEL_BAND}" height="${lh}"/>`);

    const lLX = r(lx + LANE_LABEL_BAND / 2);
    const laneLabelSpan = Math.max(lh - 2 * HEADER_LABEL_AXIS_PAD, 0);
    const lLY = r(ly + HEADER_LABEL_AXIS_PAD + laneLabelSpan / 2);
    parts.push(
      `<text class="bpmn-lane-label" text-anchor="middle" dominant-baseline="central"` +
      ` transform="rotate(-90,${lLX},${lLY})" x="${lLX}" y="${lLY}">${escXml(fitRotatedHeaderText(lane.name, laneLabelSpan))}</text>`,
    );
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Canonical body emitter, shared by every host (VS Code, JCEF, static export).
 *
 * Renders: pool + lane structure, all flow elements, sequence flows (with
 * default-flow markers), and association edges. The `<defs>` block
 * containing the arrowhead marker is included so the body is self-contained.
 *
 * @param layout - Positioned process layout (output of `layoutProcess`).
 * @param ox - Horizontal canvas offset (px) applied to all coordinates.
 * @param oy - Vertical canvas offset (px) applied to all coordinates.
 */
export function renderProcessBody(
  layout: ProcessDiagramLayout,
  ox: number,
  oy: number,
): string {
  const parts: string[] = [];

  // Build clip-path rects for every lane so element labels can't bleed into the
  // lane-name header strip on the left.
  const laneClipDefs = layout.process.lanes.map((lane) => {
    const lb = layout.laneBounds.get(lane.id);
    if (!lb) return '';
    const clipId = `bpmn-lc-${escXml(lane.id)}`;
    const cx2 = r(lb.x + ox + LANE_LABEL_BAND);
    const cy2 = r(lb.y + oy);
    const cw  = r(lb.width - LANE_LABEL_BAND);
    const ch  = r(lb.height);
    return `  <clipPath id="${clipId}"><rect x="${cx2}" y="${cy2}" width="${cw}" height="${ch}"/></clipPath>`;
  }).filter(Boolean).join('\n');

  parts.push(
    `<defs>\n` +
    `  <marker id="bpmn-arrow" viewBox="0 0 10 10" refX="9" refY="5"` +
    ` markerWidth="8" markerHeight="8" orient="auto">\n` +
    `    <path d="M 0 0 L 10 5 L 0 10 z" class="arrow-fill"/>\n` +
    `  </marker>\n` +
    (laneClipDefs ? laneClipDefs + '\n' : '') +
    `</defs>`,
  );

  parts.push(renderPoolLanes(layout, ox, oy));

  for (const lane of layout.process.lanes) {
    const lb = layout.laneBounds.get(lane.id);
    const clipId = lb ? `bpmn-lc-${escXml(lane.id)}` : undefined;
    const laneContentX = lb ? lb.x + ox + LANE_LABEL_BAND : 0;
    if (clipId) parts.push(`<g clip-path="url(#${clipId})">`);
    for (const el of lane.elements) {
      const b = layout.elements.get(el.id);
      if (!b) continue;
      parts.push(renderElement(el, b, ox, oy, laneContentX));
    }
    if (clipId) parts.push('</g>');
  }

  for (const flow of layout.flows) {
    if (flow.waypoints.length < 2) continue;
    const pts = flow.waypoints.map((p) => `${r(p.x + ox)},${r(p.y + oy)}`).join(' ');
    parts.push(`<polyline class="bpmn-seq-flow" points="${pts}" marker-end="url(#bpmn-arrow)"/>`);
    if (flow.default) {
      const p0 = flow.waypoints[0];
      const p1 = flow.waypoints[1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len >= 1) {
        const nx = dx / len;
        const ny = dy / len;
        const HALF = 5;
        const OFFSET = 8;
        const cx = p0.x + ox + nx * OFFSET;
        const cy = p0.y + oy + ny * OFFSET;
        // Perpendicular slash: marks the default outflow per BPMN 2.0 §10.3.3
        parts.push(
          `<line class="bpmn-default-mark" x1="${r(cx - ny * HALF)}" y1="${r(cy + nx * HALF)}" x2="${r(cx + ny * HALF)}" y2="${r(cy - nx * HALF)}"/>`,
        );
      }
    }
  }

  for (const assoc of layout.associations) {
    if (assoc.waypoints.length < 2) continue;
    const pts = assoc.waypoints.map((p) => `${r(p.x + ox)},${r(p.y + oy)}`).join(' ');
    parts.push(`<polyline class="bpmn-assoc" points="${pts}"/>`);
  }

  return parts.join('\n');
}

/**
 * Self-contained SVG for the BPMN process notation.
 *
 * Embeds the shared Transitrix theme CSS plus BPMN-specific rules so the
 * output can be dropped into a static webview panel or saved as an `.svg`
 * file. VS Code's dynamic preview (which supplies CSS separately via a
 * webview stylesheet) should call `renderProcessBody` directly and wrap it
 * with its own HTML shell.
 */
export function renderProcessLayoutSvg(
  layout: ProcessDiagramLayout,
  options: RenderProcessOptions = {},
): string {
  const { title = '', topInset = title ? 32 : 0 } = options;
  const pb = layout.poolBounds;
  const PAD = 16;

  const svgW = r(pb.x + pb.width + PAD);
  const svgH = r(pb.y + pb.height + PAD + topInset);

  const embedCss = generateSvgEmbedCss('transitrix') + BPMN_PROCESS_CSS;
  const body = renderProcessBody(layout, 0, topInset);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n` +
    `<style>${embedCss}</style>\n` +
    (title ? `${title}\n` : '') +
    `${body}\n` +
    `</svg>`
  );
}
