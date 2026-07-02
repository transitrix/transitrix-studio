/**
 * Shared visual constants for entity-box (block-style) notation renderers.
 *
 * Goals, Nested Blocks, FGCA/DGCA, and any future notation using the same
 * entity-box visual language import their shared style tokens from here.
 * Centralising them prevents the per-renderer drift that caused the Goals/Blocks
 * style mismatch (border radius diverged to rx=6 in Blocks vs rx=8 everywhere
 * else). Change here and every notation updates together.
 */

/** Border-radius (px) for entity and leaf-block node rectangles. */
export const ENTITY_NODE_RX = 8;
