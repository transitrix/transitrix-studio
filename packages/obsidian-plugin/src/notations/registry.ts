import { actionNotationHandler } from './action.js';
import { actionCardNotationHandler } from './action-card.js';
import { blocksNotationHandler } from './blocks.js';
import { dgcaNotationHandler } from './dgca.js';
import { dgaNotationHandler } from './dga.js';
import { goalsNotationHandler } from './goals.js';
import { processBlueprintNotationHandler } from './process-blueprint.js';
import type { NotationHandler } from './types.js';

/**
 * Registered SVG notations for Reading-view code blocks (layer A).
 */
export const NOTATION_HANDLERS: readonly NotationHandler[] = [
  goalsNotationHandler as NotationHandler,
  dgcaNotationHandler as NotationHandler,
  dgaNotationHandler as NotationHandler,
  actionNotationHandler as NotationHandler,
  actionCardNotationHandler as NotationHandler,
  blocksNotationHandler as NotationHandler,
  processBlueprintNotationHandler as NotationHandler,
];
