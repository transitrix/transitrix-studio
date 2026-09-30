import { validateActivities } from '@transitrix/diagrams/activities/index.js';
import type { ActivityDoc } from '@transitrix/diagrams/activities/index.js';
import { isActionViewDoc } from '@transitrix/diagrams/activities/index.js';
import { renderActivitiesSvg } from '@transitrix/diagrams/webview/render-activities.js';

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

const ACTION_SOURCE_CODES: ParseBlockSourceCodes = {
  invalidSource: 'ACTION-BLOCK-001',
  oversize: 'ACTION-BLOCK-001',
  empty: 'ACTION-BLOCK-001',
  projection: 'ACTION-BLOCK-002',
  projectionMessage:
    'Repository-derived Action views are unsupported; supply a self-contained Action document with inline actions[] in the code block.',
};

function isActionProjection(doc: Record<string, unknown>): boolean {
  if ('sources' in doc) return true;
  return isActionViewDoc(doc);
}

/** Parse, validate and render a self-contained Action (network) YAML document. */
export function renderSelfContainedActionBlock(
  source: string,
  display: SvgDisplaySettings = DEFAULT_SVG_DISPLAY_SETTINGS,
  isDarkHost: boolean = isObsidianDarkHost(),
): BlockRenderResult {
  const loaded = parseSelfContainedBlockSource(source, {
    codes: ACTION_SOURCE_CODES,
    isProjection: isActionProjection,
  });
  if (!loaded.ok) return parseFailureAsRenderResult(loaded);

  const doc = loaded.doc;
  const checked = validateActivities(doc);
  if (!checked.valid) {
    return { ok: false, errors: checked.errors, warnings: checked.warnings };
  }

  // Obsidian only paints the network (PSND) view — drop Gantt/CPM-only advisories
  // so demos without project dates are not flagged (ACT-009 / ACT-011).
  const warnings = checked.warnings.filter(
    (w) => w.code !== 'ACT-009' && w.code !== 'ACT-011',
  );

  const normalized = normalizeSvgDisplaySettings(display);
  const meta = isRecord(doc) && typeof doc['title'] === 'string'
    ? doc['title']
    : (isRecord(doc) && typeof doc['name'] === 'string' ? doc['name'] : '');
  const svg = renderActivitiesSvg(doc as ActivityDoc, {
    title: meta,
    nodeSizePreset: normalized.nodeSize,
    curvature: normalized.curvature,
    embedCssTheme: resolveEmbedTheme(normalized.theme, isDarkHost),
  });
  return { ok: true, svg, warnings };
}
