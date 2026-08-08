// Type contract for the vendored pass1.mjs — Studio's own, not part of what
// vendor-methodology-document-renderer.mjs fetches from methodology (that
// script only writes the five .mjs files; this file is untouched by it).
// Kept intentionally narrow: only the shape extension/src/ttrs-preview.ts and
// tests/document-renderer-vendor.test.ts actually read. The source of truth
// for the full contract is pass1.mjs's own JSDoc and
// methodology/notations/views/documents/DIRECTIVE_LANGUAGE.md.

export interface Pass1Header {
  document: string;
  kind: string;
  template_id: string;
  template_version: string;
  canon: string | null;
}

export interface Pass1InstructionSlot {
  slotId: string;
  question: string;
  inputs: string[];
  sufficient: string;
}

export interface Pass1Figure {
  number: number;
  name: string;
  kind: 'view' | 'figure';
  source: string;
  derived: boolean;
  fit: string | null;
  caption: string | null;
  embedPath: string;
}

export interface Pass1Error {
  code: string;
  message: string;
}

export interface Pass1Finding {
  code: string;
  state: string;
  flag: string | null;
  id: string | null;
  file: string;
}

export interface Pass1Suspicion {
  computed: boolean;
  state: string;
  reason: string;
}

export interface RasteriseInput {
  kind: 'view' | 'figure';
  source: string;
  name: string;
  number: number;
  fit: string | null;
}

export interface RunPass1Options {
  text: string;
  templatePath?: string;
  repositoryRoot?: string | null;
  rasterise?: (input: RasteriseInput) => string;
  profile?: 'strict' | 'review';
  renderDate?: string;
}

export interface Pass1Result {
  ok: boolean;
  markdown: string;
  header: Pass1Header | null;
  instructionSlots: Pass1InstructionSlot[];
  figures: Pass1Figure[];
  errors: Pass1Error[];
  findings: Pass1Finding[];
  states: Record<string, number>;
  suspicion: Pass1Suspicion;
  profile: 'strict' | 'review';
  renderDate: string;
}

export function runPass1(options: RunPass1Options): Promise<Pass1Result>;
