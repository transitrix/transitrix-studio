import { parseCanonicalFGCA, parseCanonicalFGA } from '@transitrix/diagrams/fgca/parse-canonical.js';
import { isFGCAViewDoc } from '@transitrix/diagrams/fgca/resolver.js';
import { renderFgcaSvg } from '@transitrix/diagrams/webview/render-fgca.js';

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

export type FgcaBlockVariant = 'dgca' | 'dga';

const FGCA_SOURCE_CODES: ParseBlockSourceCodes = {
  invalidSource: 'FGCA-BLOCK-001',
  oversize: 'FGCA-BLOCK-001',
  empty: 'FGCA-BLOCK-001',
  projection: 'FGCA-BLOCK-002',
  projectionMessage:
    'Repository-derived FGCA views are unsupported; supply a self-contained DGCA/DGA document in the code block.',
};

/** Reject vault projections (`sources` or view_config-only). Inline + layers view_config is allowed. */
function isFgcaProjection(doc: Record<string, unknown>): boolean {
  if ('sources' in doc) return true;
  return isFGCAViewDoc(doc);
}

/**
 * Parse, validate and render a self-contained DGCA or DGA YAML document.
 * Consumes nodeSize / edgeStyle / curvature / theme from display settings.
 */
export function renderSelfContainedFgcaBlock(
  source: string,
  variant: FgcaBlockVariant,
  display: SvgDisplaySettings = DEFAULT_SVG_DISPLAY_SETTINGS,
  isDarkHost: boolean = isObsidianDarkHost(),
): BlockRenderResult {
  const loaded = parseSelfContainedBlockSource(source, {
    codes: FGCA_SOURCE_CODES,
    isProjection: isFgcaProjection,
  });
  if (!loaded.ok) return parseFailureAsRenderResult(loaded);

  const doc = loaded.doc;
  const parsed = variant === 'dga' ? parseCanonicalFGA(doc) : parseCanonicalFGCA(doc);
  if (!parsed.valid || !parsed.parsed) {
    return { ok: false, errors: parsed.errors, warnings: parsed.warnings };
  }

  const normalized = normalizeSvgDisplaySettings(display);
  const meta = isRecord(doc) && typeof doc['name'] === 'string' ? doc['name'] : '';
  const title = meta
    ? (variant === 'dga' ? `DGA — ${meta}` : `DGCA — ${meta}`)
    : '';
  const svg = renderFgcaSvg(parsed.parsed, {
    variant,
    title,
    scopeCaption: parsed.scopeCaption,
    nodeSizePreset: normalized.nodeSize,
    edgeStyle: normalized.edgeStyle,
    curvature: normalized.curvature,
    embedCssTheme: resolveEmbedTheme(normalized.theme, isDarkHost),
  });
  return { ok: true, svg, warnings: parsed.warnings };
}
