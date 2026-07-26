import type { GridRule } from '../validate.js';
import { RACI_GRID_RULES } from './raci.js';

/**
 * Closed registry of built-in grid templates (§6a): each entry is a template
 * name (as passed to `--template <name>`) mapped to its `GridRule`s. Adding a
 * new template means adding one rule module + one entry here — the same
 * shape as adding a new notation validator, not a plugin/config-loading
 * mechanism (deliberately out of scope — see the design note on `RACI-001`).
 */
export const GRID_TEMPLATE_RULES: Record<string, GridRule[]> = {
  raci: RACI_GRID_RULES,
};
