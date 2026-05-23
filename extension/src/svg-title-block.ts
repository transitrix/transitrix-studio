// Shared SVG title block for static diagram previews.
//
// Every vector preview embeds a 3-line caption at the top of its SVG:
//   line 1 — diagram heading (e.g. "Goal tree", "FGCA", "Block diagram")
//   line 2 — source filename
//   line 3 — today's date
//
// The block is class="diagram-title-block" so the Title toggle in #toolbar
// (see TITLE_TOGGLE_CSS in diagram-frame.ts) can hide it via CSS. Renderers
// reserve TITLE_BLOCK_H pixels at the top of their viewBox; when the toggle
// hides the text, the empty space stays — acceptable trade-off for an
// interactive preview, and the right behaviour for exported SVG files
// (the title travels with the diagram outside VS Code).

export const TITLE_BLOCK_H = 60;

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Build the title <g> for embedding at (x, top) inside an SVG. */
export function titleBlockSvg(
  heading: string,
  filename: string,
  date: string,
  x: number,
  top: number,
): string {
  return `<g class="diagram-title-block">
  <text class="text-header" x="${x}" y="${top + 14}">${escXml(heading)}</text>
  <text class="text-secondary" x="${x}" y="${top + 30}">${escXml(filename)}</text>
  <text class="text-secondary" x="${x}" y="${top + 46}">${escXml(date)}</text>
</g>`;
}

/** Today's date in YYYY-MM-DD. Used as the third title-block line. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
