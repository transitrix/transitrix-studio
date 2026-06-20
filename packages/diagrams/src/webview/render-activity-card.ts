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
 * (Drivers → Assessments → Goals → Changes) and child activities are pulled BY
 * REFERENCE from the canonical element + relation store (`canon/elements/**`,
 * `canon/relations/**`; see `../activity-card/resolver.ts`). That resolution
 * requires reading those files from disk, which is NOT available inside the
 * JCEF host. We therefore resolve from the single in-memory card document
 * ONLY: we synthesise a minimal `ResolvedActivityCard` whose project carries
 * just the referenced project id (no resolved name/dates), whose milestones
 * come straight from the card's own `milestones[]`, and whose chain sections
 * and child activities are empty. The SVG layout is shared with the VS Code
 * path via `layoutActivityCard`, so a single-document card still renders its
 * title, dates band and milestone section.
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
    motivation: { drivers: [], goals: [], changes: [] },
    assessments: [],
    childActivities: [],
    notes: card?.notes,
  };
}

function buildBody(layout: ActivityCardLayout, ox: number, oy: number): string {
  const parts: string[] = [];

  // Outer card.
  parts.push(
    `<rect class="diagram-node level-0" x="${ox}" y="${oy}" width="${layout.bounds.width}" height="${layout.bounds.height}" rx="8"/>`,
  );

  // Title row.
  parts.push(
    `<text class="text-header" x="${layout.titleRow.x + ox}" y="${layout.titleRow.y + oy}" style="dominant-baseline:central" font-size="18">${escXml(truncate(layout.titleRow.name, 60))}</text>`,
  );

  // Activity type badge.
  if (layout.activityTypeBadge) {
    const b = layout.activityTypeBadge;
    parts.push(`<rect class="diagram-node level-2" x="${b.x + ox}" y="${b.y + oy}" width="${b.width}" height="${b.height}" rx="4"/>`);
    parts.push(`<text class="text-secondary" style="dominant-baseline:central;text-anchor:middle" x="${b.x + ox + b.width / 2}" y="${b.y + oy + b.height / 2}">${escXml(b.label)}</text>`);
  }

  // Status badge.
  if (layout.statusBadge) {
    const b = layout.statusBadge;
    parts.push(`<rect class="diagram-node level-3" x="${b.x + ox}" y="${b.y + oy}" width="${b.width}" height="${b.height}" rx="4"/>`);
    parts.push(`<text class="text-secondary" style="dominant-baseline:central;text-anchor:middle" x="${b.x + ox + b.width / 2}" y="${b.y + oy + b.height / 2}">${escXml(b.label)}</text>`);
  }

  // Date fields.
  for (const d of layout.dateFields) {
    parts.push(`<rect class="diagram-node level-2" x="${d.x + ox}" y="${d.y + oy}" width="${d.width}" height="${d.height}" rx="6"/>`);
    parts.push(`<text class="text-secondary" x="${d.x + ox + 12}" y="${d.y + oy + 18}" style="dominant-baseline:central">${escXml(d.label)}</text>`);
    parts.push(`<text class="text-primary" x="${d.x + ox + 12}" y="${d.y + oy + 40}" style="dominant-baseline:central">${escXml(d.value)}</text>`);
  }

  // Stakeholder role slots (2-column grid).
  for (const s of layout.stakeholderRoleSlots) {
    parts.push(`<rect class="diagram-node level-2" x="${s.x + ox}" y="${s.y + oy}" width="${s.width}" height="${s.height}" rx="6"/>`);
    parts.push(`<text class="text-secondary" x="${s.x + ox + 10}" y="${s.y + oy + 16}" style="dominant-baseline:central">${escXml(s.role)}</text>`);
    parts.push(`<text class="text-primary" x="${s.x + ox + 10}" y="${s.y + oy + 36}" style="dominant-baseline:central">${escXml(truncate(s.name, 40))}</text>`);
  }

  // Description row.
  if (layout.descriptionRow) {
    const r = layout.descriptionRow;
    parts.push(`<rect class="diagram-node level-2" x="${r.x + ox}" y="${r.y + oy}" width="${r.width}" height="${r.height}" rx="6"/>`);
    parts.push(`<text class="text-secondary" x="${r.x + ox + 12}" y="${r.y + oy + 22}" style="dominant-baseline:central">${escXml(r.label)}</text>`);
    r.valueLines.forEach((line, i) => {
      parts.push(`<text class="text-primary" x="${r.x + ox + 12}" y="${r.y + oy + 44 + i * 18}" style="dominant-baseline:central">${escXml(line)}</text>`);
    });
  }

  // Chain sections (Drivers → Assessments → Goals → Changes).
  const SECTION_LEVEL: Record<string, number> = {
    drivers: 4,
    assessments: 5,
    goals: 5,
    changes: 6,
  };
  for (let si = 0; si < layout.chainSections.length; si++) {
    const section = layout.chainSections[si];
    const level = SECTION_LEVEL[section.type] ?? 5;

    // Section outer box.
    parts.push(
      `<rect class="diagram-node level-1" x="${section.x + ox}" y="${section.y + oy}" width="${section.width}" height="${section.height}" rx="6"/>`,
    );
    // Section header label + subtitle.
    parts.push(
      `<text class="text-header" x="${section.x + ox + 12}" y="${section.y + oy + 14}" style="dominant-baseline:central">${escXml(section.label)}<tspan class="text-secondary" font-size="11"> (${escXml(section.subtitle)})</tspan></text>`,
    );

    if (section.isEmpty) {
      // Gap indicator.
      parts.push(
        `<text class="text-secondary" x="${section.x + ox + 12}" y="${section.y + oy + 24 + 8 + 16}" style="dominant-baseline:central">— not on file</text>`,
      );
    } else {
      for (const n of section.nodes) {
        parts.push(
          `<rect class="diagram-node level-${level}" x="${n.x + ox}" y="${n.y + oy}" width="${n.width}" height="${n.height}" rx="4"/>`,
        );
        parts.push(
          `<text class="text-primary" x="${n.x + ox + 10}" y="${n.y + oy + (n.meta ? 16 : n.height / 2)}" style="dominant-baseline:central">${escXml(truncate(n.name, 80))}</text>`,
        );
        if (n.meta) {
          parts.push(
            `<text class="text-secondary" x="${n.x + ox + 10}" y="${n.y + oy + 30}" style="dominant-baseline:central">${escXml(n.meta)}</text>`,
          );
        }
      }
    }

    // Connector arrow to next section.
    if (si < layout.chainSections.length - 1) {
      const nextSection = layout.chainSections[si + 1];
      const arrowX = section.x + ox + section.width / 2;
      const arrowTopY = section.y + oy + section.height;
      const arrowBotY = nextSection.y + oy;
      const midY = (arrowTopY + arrowBotY) / 2;
      parts.push(
        `<path class="diagram-edge" d="M${arrowX},${arrowTopY} L${arrowX},${arrowBotY}" fill="none" marker-end="url(#ac-arrow)"/>`,
      );
      void midY; // midpoint available for future label placement
    }
  }

  // Milestones.
  for (const m of layout.milestones) {
    parts.push(
      `<rect class="diagram-node level-3" x="${m.x + ox}" y="${m.y + oy}" width="${m.width}" height="${m.height}" rx="6"/>`,
    );
    parts.push(
      `<text class="text-secondary" x="${m.x + ox + 10}" y="${m.y + oy + 16}" style="dominant-baseline:central">${escXml(m.date)}</text>`,
    );
    parts.push(
      `<text class="text-primary" x="${m.x + ox + 10}" y="${m.y + oy + 36}" style="dominant-baseline:central">${escXml(truncate(m.name, 22))}</text>`,
    );
    parts.push(
      `<text class="text-secondary" x="${m.x + ox + 10}" y="${m.y + oy + 52}" style="dominant-baseline:central">(${escXml(m.archimateClass)})</text>`,
    );
  }

  // Child activities.
  for (const a of layout.childActivities) {
    parts.push(
      `<rect class="diagram-node level-1" x="${a.x + ox}" y="${a.y + oy}" width="${a.width}" height="${a.height}" rx="6"/>`,
    );
    parts.push(
      `<text class="text-primary" x="${a.x + ox + 12}" y="${a.y + oy + a.height / 2}" style="dominant-baseline:central">${escXml(truncate(a.name, 48))} <tspan class="text-secondary">(${escXml(a.archimateClass)})</tspan></text>`,
    );
    if (a.meta) {
      parts.push(
        `<text class="text-secondary" x="${a.x + a.width + ox - 12}" y="${a.y + oy + a.height / 2}" style="dominant-baseline:central;text-anchor:end">${escXml(truncate(a.meta, 40))}</text>`,
      );
    }
  }

  // Footer — notes.
  if (layout.footerRow) {
    const r = layout.footerRow;
    parts.push(`<rect class="diagram-node level-2" x="${r.x + ox}" y="${r.y + oy}" width="${r.width}" height="${r.height}" rx="6"/>`);
    parts.push(`<text class="text-secondary" x="${r.x + ox + 12}" y="${r.y + oy + 22}" style="dominant-baseline:central">${escXml(r.label)}</text>`);
    r.valueLines.forEach((line, i) => {
      parts.push(`<text class="text-primary" x="${r.x + ox + 12}" y="${r.y + oy + 44 + i * 18}" style="dominant-baseline:central">${escXml(line)}</text>`);
    });
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

  if (layout.bounds.width <= 0 || layout.bounds.height <= 0) return EMPTY_SVG;

  const titleH = title ? 28 : 0;
  const w = layout.bounds.width + PAD * 2;
  const h = layout.bounds.height + PAD * 2 + titleH;
  const ox = PAD;
  const oy = PAD + titleH;

  const body = buildBody(layout, ox, oy);

  const titleSvg = title
    ? `<text class="text-header" x="${PAD}" y="${PAD + 14}">${escXml(`Activity Card — ${title}`)}</text>`
    : '';

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
