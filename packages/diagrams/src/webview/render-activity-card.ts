/**
 * Host-neutral SVG renderer for the Activity Card notation.
 *
 * Step 4 of the IntelliJ epic (ADR 0001): the webview bundle must turn a
 * validated Activity Card document into renderable SVG so JCEF can drop it into
 * the preview panel. The VS Code path lives in
 * `extension/src/activity-card-preview.ts` and pulls in VS Code-specific
 * concerns (themes, title block, save dialogs, sibling-document discovery on
 * the filesystem); this module is the host-neutral subset — pure layout → SVG
 * with no VS Code APIs, no `node:fs`, no `node:path`.
 *
 * CROSS-DOCUMENT RESOLUTION CAVEAT
 * The Activity Card is the only MULTI-DOCUMENT Studio notation: the card YAML
 * names a project Activity, and the project's name, dates, motivation chain
 * (Factors → Goals → Changes) and child activities are pulled BY REFERENCE from
 * the canonical element + relation store (`canon/elements/**`,
 * `canon/relations/**`; see `../activity-card/resolver.ts`). That resolution
 * requires reading those files from disk, which is NOT available inside the
 * JCEF host. We therefore resolve from the single in-memory card document
 * ONLY: we synthesise
 * a minimal `ResolvedActivityCard` whose project carries just the referenced
 * project id (no resolved name/dates), whose milestones come straight from the
 * card's own `milestones[]`, and whose motivation chain + child activities are
 * empty (those cannot resolve without the siblings). The SVG layout is shared
 * with the VS Code path via `layoutActivityCard`, so a single-document card
 * still renders its title, dates band and milestone timeline.
 */
import { layoutActivityCard, ARCHIMATE_CLASS } from '../activity-card/layout.js';
import type {
  ActivityCardDoc,
  ActivityCardLayout,
  ResolvedActivityCard,
  ResolvedMilestone,
} from '../activity-card/types.js';
import { generateSvgEmbedCss } from '../theme/index.js';
import { escXml } from './render-util.js';

const PAD = 24;

const EMPTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;

export interface RenderActivityCardOptions {
  title?: string;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

/**
 * Build a single-document resolution of the card: everything that can be read
 * straight off the card YAML, with the cross-document fields left empty. This
 * mirrors what `resolveActivityCard` produces, minus the parts that need the
 * canon element + relation store (project name/dates, motivation chain, child
 * activities).
 */
function resolveSingleDoc(doc: ActivityCardDoc): ResolvedActivityCard {
  const card = doc.activity_card;
  const rawMilestones = Array.isArray(card?.milestones) ? card.milestones : [];

  const milestones: ResolvedMilestone[] = rawMilestones
    .filter((m): m is NonNullable<typeof m> => !!m && typeof m === 'object')
    .map((m) => ({
      id: m.id,
      name: m.name,
      date: m.date,
      description: m.description,
      deliversChanges: Array.isArray(m.delivers_changes) ? m.delivers_changes : [],
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    cardId: card?.id ?? '',
    cardDescription: card?.description,
    // No sibling docs in the host-neutral path: the project resolves to its id
    // only. The layout falls back to '—' for the unknown date fields.
    project: { id: card?.project ?? '', name: card?.project ?? '' },
    milestones,
    motivation: { factors: [], goals: [], changes: [] },
    childActivities: [],
  };
}

function buildBody(layout: ActivityCardLayout, ox: number, oy: number): string {
  const parts: string[] = [];

  // Outer card.
  parts.push(
    `<rect class="diagram-node level-0" x="${ox}" y="${oy}" width="${layout.bounds.width}" height="${layout.bounds.height}" rx="8"/>`,
  );

  // Title (project name / id).
  parts.push(
    `<text class="text-header" x="${layout.title.x + ox}" y="${layout.title.y + oy}" dominant-baseline="central" font-size="18">${escXml(truncate(layout.title.name, 70))}</text>`,
  );

  // Dates band.
  for (const d of layout.dateFields) {
    parts.push(
      `<rect class="diagram-node level-2" x="${d.x + ox}" y="${d.y + oy}" width="${d.width}" height="${d.height}" rx="6"/>`,
    );
    parts.push(
      `<text class="text-secondary" x="${d.x + ox + 12}" y="${d.y + oy + 18}" dominant-baseline="central">${escXml(d.label)}</text>`,
    );
    parts.push(
      `<text class="text-primary" x="${d.x + ox + 12}" y="${d.y + oy + 40}" dominant-baseline="central">${escXml(d.value)}</text>`,
    );
  }

  // Section headers.
  for (const s of layout.sectionHeaders) {
    parts.push(
      `<text class="text-header" x="${s.x + ox}" y="${s.y + oy + s.height / 2}" dominant-baseline="central">${escXml(s.label)}</text>`,
    );
  }

  // Milestones.
  for (const m of layout.milestones) {
    parts.push(
      `<rect class="diagram-node level-3" x="${m.x + ox}" y="${m.y + oy}" width="${m.width}" height="${m.height}" rx="6"/>`,
    );
    parts.push(
      `<text class="text-secondary" x="${m.x + ox + 10}" y="${m.y + oy + 16}" dominant-baseline="central">${escXml(m.date)}</text>`,
    );
    parts.push(
      `<text class="text-primary" x="${m.x + ox + 10}" y="${m.y + oy + 36}" dominant-baseline="central">${escXml(truncate(m.name, 22))}</text>`,
    );
    parts.push(
      `<text class="text-secondary" x="${m.x + ox + 10}" y="${m.y + oy + 52}" dominant-baseline="central" font-style="italic">(${escXml(m.archimateClass)})</text>`,
    );
  }

  // Motivation chain — edges first (under nodes).
  const nodeById = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const col of [
    layout.chainColumns.factors,
    layout.chainColumns.goals,
    layout.chainColumns.changes,
  ]) {
    for (const n of col) nodeById.set(n.id, n);
  }
  for (const e of layout.chainEdges) {
    const s = nodeById.get(e.sourceId);
    const t = nodeById.get(e.targetId);
    if (!s || !t) continue;
    const x1 = s.x + s.width + ox;
    const y1 = s.y + s.height / 2 + oy;
    const x2 = t.x + ox;
    const y2 = t.y + t.height / 2 + oy;
    const mx = (x1 + x2) / 2;
    parts.push(
      `<path class="diagram-edge" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" marker-end="url(#ac-arrow)"/>`,
    );
  }
  const chainLevels: Array<[typeof layout.chainColumns.factors, number]> = [
    [layout.chainColumns.factors, 4],
    [layout.chainColumns.goals, 5],
    [layout.chainColumns.changes, 6],
  ];
  for (const [col, level] of chainLevels) {
    for (const n of col) {
      parts.push(
        `<rect class="diagram-node level-${level}" x="${n.x + ox}" y="${n.y + oy}" width="${n.width}" height="${n.height}" rx="6"/>`,
      );
      parts.push(
        `<text class="text-pill" x="${n.x + ox + n.width / 2}" y="${n.y + oy + n.height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncate(n.name, Math.floor(n.width / 7)))}</text>`,
      );
    }
  }

  // Child activities.
  for (const a of layout.childActivities) {
    parts.push(
      `<rect class="diagram-node level-1" x="${a.x + ox}" y="${a.y + oy}" width="${a.width}" height="${a.height}" rx="6"/>`,
    );
    parts.push(
      `<text class="text-primary" x="${a.x + ox + 12}" y="${a.y + oy + a.height / 2}" dominant-baseline="central">${escXml(truncate(a.name, 48))} <tspan class="text-secondary" font-style="italic">(${escXml(a.archimateClass)})</tspan></text>`,
    );
    if (a.meta) {
      parts.push(
        `<text class="text-secondary" x="${a.x + a.width + ox - 12}" y="${a.y + oy + a.height / 2}" text-anchor="end" dominant-baseline="central">${escXml(truncate(a.meta, 40))}</text>`,
      );
    }
  }

  return parts.join('\n');
}

export function renderActivityCardSvg(
  doc: ActivityCardDoc,
  options: RenderActivityCardOptions = {},
): string {
  // `ARCHIMATE_CLASS` is referenced so the host-neutral module pins the same
  // §5.1 class convention the layout applies; keeps the import meaningful.
  void ARCHIMATE_CLASS;

  const { title = '' } = options;

  const resolved = resolveSingleDoc(doc);
  const layout = layoutActivityCard(resolved);

  if (layout.bounds.width <= 0 || layout.bounds.height <= 0) {
    return EMPTY_SVG;
  }

  const titleH = title ? 28 : 0;
  const w = layout.bounds.width + PAD * 2;
  const h = layout.bounds.height + PAD * 2 + titleH;
  const ox = PAD;
  const oy = PAD + titleH;

  const body = buildBody(layout, ox, oy);

  const titleSvg = title
    ? `<text class="text-header" x="${PAD}" y="${PAD + 14}">${escXml(`Activity Card — ${title}`)}</text>`
    : '';

  // Embed the shared theme CSS inside the SVG so the rendered output is
  // self-contained — the JCEF host page only needs to drop the SVG into the
  // DOM and styling resolves without any cooperation from the host stylesheet.
  const embedCss = generateSvgEmbedCss('transitrix');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<style>${embedCss}</style>
<defs>
  <marker id="ac-arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
</defs>
${titleSvg}
${body}
</svg>`;
}
