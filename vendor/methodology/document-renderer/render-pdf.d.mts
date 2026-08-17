// Type contract for the vendored render-pdf.mjs — Studio's own, not part of
// what vendor-methodology-document-renderer.mjs fetches from methodology.
// Source of truth for the full contract is render-pdf.mjs's own module header
// (A4, Helvetica, figures reduced to a text placeholder — no rasterisation).

export function renderMarkdownToPdf(markdown: string): Buffer;
