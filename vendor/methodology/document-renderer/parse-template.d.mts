// Type contract for the vendored parse-template.mjs — Studio's own, not part
// of what vendor-methodology-document-renderer.mjs fetches from methodology
// (that script only writes the five .mjs files; this file is untouched by
// it). Kept intentionally narrow: only the shape src/impact.ts actually
// reads. The source of truth for the full contract is parse-template.mjs's
// own JSDoc and methodology/notations/views/documents/DIRECTIVE_LANGUAGE.md.

export interface TemplateReferenceNode {
  type: 'reference';
  id: string;
  fields: string[];
}

/** `each` / `trace` / the `.field` row reference — constructs the language
 *  defines that this pass declines to resolve. `construct` names which one. */
export interface TemplateUnimplementedNode {
  type: 'unimplemented';
  construct: string;
}

/** `{{# instruct <slot-id> }} … {{/ instruct }}` — `inputs` is the slot's own
 *  `inputs:` field, already comma-split and trimmed by the parser; each entry
 *  names a model-object id the slot reads. */
export interface TemplateInstructNode {
  type: 'instruct';
  slotId: string | undefined;
  question: string | undefined;
  inputs: string[];
  sufficient: string | undefined;
  raw: string;
}

/** Every other node shape this pass produces (`text`, `view`, `figure`,
 *  `figref`, `error`) — untyped here because src/impact.ts reads none of
 *  their fields, only whether a node is a reference, an instruct slot, or
 *  unimplemented. */
export interface TemplateOtherNode {
  type: string;
  [key: string]: unknown;
}

export type TemplateNode =
  | TemplateReferenceNode
  | TemplateUnimplementedNode
  | TemplateInstructNode
  | TemplateOtherNode;

export interface TemplateHeader {
  document: string;
  kind: string;
  template_id: string;
  template_version: string;
  canon: string | null;
}

export interface TemplateParseError {
  code: string;
  message: string;
}

export interface ParseTemplateResult {
  header: TemplateHeader | null;
  ast: TemplateNode[];
  errors: TemplateParseError[];
}

export function parseTemplate(text: string): ParseTemplateResult;
