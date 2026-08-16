// Type contract for the vendored pass2.mjs — Studio's own, not part of what
// vendor-methodology-document-renderer.mjs fetches from methodology (that
// script only writes the .mjs files; this file is untouched by it).
// Kept intentionally narrow: only the shape src/render-document.ts actually
// reads. The source of truth for the full contract is pass2.mjs's own JSDoc
// and the 2026-08-12 instruction-slot ADR it implements.

export interface Pass2SlotInput {
  slotId: string;
  question: string;
  inputs: string[];
  sufficient: string;
}

export interface Pass2FillOutcome {
  status: 'sufficient' | 'insufficient';
  text?: string;
  attributions?: string[];
}

export interface Pass2SlotResult {
  slotId: string;
  question: string;
  inputs: string[];
  sufficient: string;
  verdict: 'sufficient' | 'insufficient' | 'not-attempted';
  reason: string | null;
  text: string | null;
  attributions?: string[];
}

export interface RunPass2Options {
  markdown: string;
  instructionSlots: Pass2SlotInput[];
  fill?: (slot: Pass2SlotInput) => Promise<Pass2FillOutcome>;
}

export interface Pass2Result {
  markdown: string;
  slotResults: Pass2SlotResult[];
}

export function runPass2(options: RunPass2Options): Promise<Pass2Result>;
