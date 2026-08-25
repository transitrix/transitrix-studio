// Type contract for the vendored parse-recipe.mjs — Studio's own, not part
// of what vendor-methodology-document-renderer.mjs fetches from methodology
// (that script only writes the eight .mjs files; this file is untouched by
// it). Kept intentionally narrow: only the shape src/impact.ts actually
// reads. The source of truth for the full contract is parse-recipe.mjs's
// own JSDoc and methodology/notations/views/documents/DIRECTIVE_LANGUAGE.md.

export interface RecipeReferenceNode {
  type: 'reference';
  id: string;
  fields: string[];
}

/** `each` / `trace` / the `.field` row reference — constructs the language
 *  defines that this pass declines to resolve. `construct` names which one. */
export interface RecipeUnimplementedNode {
  type: 'unimplemented';
  construct: string;
}

/** `{{# instruct <slot-id> }} … {{/ instruct }}` — `inputs` is the slot's own
 *  `inputs:` field, already comma-split and trimmed by the parser; each entry
 *  names a model-object id the slot reads. */
export interface RecipeInstructNode {
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
export interface RecipeOtherNode {
  type: string;
  [key: string]: unknown;
}

export type RecipeNode =
  | RecipeReferenceNode
  | RecipeUnimplementedNode
  | RecipeInstructNode
  | RecipeOtherNode;

export interface RecipeHeader {
  document: string;
  kind: string;
  recipe_id: string;
  recipe_version: string;
  canon: string | null;
}

export interface RecipeParseError {
  code: string;
  message: string;
}

export interface ParseRecipeResult {
  header: RecipeHeader | null;
  ast: RecipeNode[];
  errors: RecipeParseError[];
}

export function parseRecipe(text: string): ParseRecipeResult;
