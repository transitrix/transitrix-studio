import { validateActivityCard } from '@transitrix/diagrams/activity-card/validate.js';
import type { ActivityCardDoc } from '@transitrix/diagrams/activity-card/types.js';
import { renderActivityCardSvg } from '@transitrix/diagrams/webview/render-activity-card.js';

import type { BlockRenderResult } from './block-types.js';
import { isRecord } from './block-types.js';
import {
  DEFAULT_SVG_DISPLAY_SETTINGS,
  isObsidianDarkHost,
  normalizeSvgDisplaySettings,
  resolveEmbedTheme,
  type SvgDisplaySettings,
} from './goals-display-settings.js';
import {
  parseFailureAsRenderResult,
  parseSelfContainedBlockSource,
  type ParseBlockSourceCodes,
} from './parse-block-source.js';

const ACTION_CARD_SOURCE_CODES: ParseBlockSourceCodes = {
  invalidSource: 'ACTION-CARD-BLOCK-001',
  oversize: 'ACTION-CARD-BLOCK-001',
  empty: 'ACTION-CARD-BLOCK-001',
  projection: 'ACTION-CARD-BLOCK-002',
  projectionMessage:
    'Repository sources are unsupported; supply a self-contained action-card document in the code block.',
};

function isActionCardProjection(doc: Record<string, unknown>): boolean {
  return 'sources' in doc;
}

/**
 * Parse, validate and render an Action Card YAML document.
 * Without vault/canon, the shared renderer paints the card shell + milestones
 * only (project name falls back to the referenced id; motivation/children empty).
 * Consumes theme from display settings; other knobs do not apply to the card shell.
 */
export function renderSelfContainedActionCardBlock(
  source: string,
  display: SvgDisplaySettings = DEFAULT_SVG_DISPLAY_SETTINGS,
  isDarkHost: boolean = isObsidianDarkHost(),
): BlockRenderResult {
  const loaded = parseSelfContainedBlockSource(source, {
    codes: ACTION_CARD_SOURCE_CODES,
    isProjection: isActionCardProjection,
  });
  if (!loaded.ok) return parseFailureAsRenderResult(loaded);

  const doc = loaded.doc;
  const checked = validateActivityCard(doc);
  if (!checked.valid) {
    return { ok: false, errors: checked.errors, warnings: checked.warnings };
  }

  const normalized = normalizeSvgDisplaySettings(display);
  const card = isRecord(doc)
    ? (doc['action_card'] ?? doc['activity_card'])
    : undefined;
  const title = isRecord(card) && typeof card['id'] === 'string' ? card['id'] : '';
  const svg = renderActivityCardSvg(doc as ActivityCardDoc, {
    title,
    embedCssTheme: resolveEmbedTheme(normalized.theme, isDarkHost),
  });
  return { ok: true, svg, warnings: checked.warnings };
}
