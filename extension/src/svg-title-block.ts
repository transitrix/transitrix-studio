// Shared SVG title block for static diagram previews.
//
// Every vector preview embeds a 3-line caption at the top of its SVG:
//   line 1 — diagram heading (e.g. "Goal tree", "FGCA", "Block diagram")
//   line 2 — source filename
//   line 3 — `v{version} · {date}` when a document `version` is present,
//            otherwise just the date. Format matches `frame-meta` in the
//            catalogue HTML previews (`v` prefix, ` · ` separator).
//
// The block is class="diagram-title-block" so the Title toggle in #toolbar
// (see TITLE_TOGGLE_CSS in diagram-frame.ts) can hide it via CSS. Renderers
// reserve TITLE_BLOCK_H pixels at the top of their viewBox; when the toggle
// hides the text, the empty space stays — acceptable trade-off for an
// interactive preview, and the right behaviour for exported SVG files
// (the title travels with the diagram outside VS Code).

import { escXml } from '@transitrix/diagrams/webview/render-util.js';

export const TITLE_BLOCK_H = 60;

/**
 * Build the title <g> for embedding at (x, top) inside an SVG.
 *
 * `version` is the document's `version` field (front-matter). When set, line 3
 * renders as `v{version} · {date}`; otherwise just `{date}`. `spec_version`
 * (the notation/methodology version) deliberately does NOT appear — it stays
 * front-matter metadata, never painted on the diagram.
 */
export function titleBlockSvg(
  heading: string,
  filename: string,
  date: string,
  x: number,
  top: number,
  version?: string,
): string {
  const dateLine = `Generated: ${date}`;
  return `<g class="diagram-title-block">
  <text class="text-header" x="${x}" y="${top + 14}">${escXml(heading)}</text>
  <text class="text-secondary" x="${x}" y="${top + 30}">${escXml(filename)}</text>
  <text class="text-secondary" x="${x}" y="${top + 46}">${escXml(dateLine)}</text>
</g>`;
}

/** Today's date in YYYY-MM-DD. Used as the third title-block line's fallback
 *  when the source document has no `date` field. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
