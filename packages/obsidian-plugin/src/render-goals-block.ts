import { DEFAULT_EDGE_CURVATURE } from '@transitrix/diagrams/edge-path.js';
import { layoutGoalTree } from '@transitrix/diagrams/goals/layout.js';
import { parseCanonicalGoals } from '@transitrix/diagrams/goals/parse-canonical.js';
import type { GoalTree } from '@transitrix/diagrams/goals/types.js';
import { validateGoalTree } from '@transitrix/diagrams/goals/validate.js';
import {
  parseNodeSizePreset,
  resolveGoalsNodeSize,
} from '@transitrix/diagrams/node-size-presets.js';
import type { ThemeId } from '@transitrix/diagrams/theme/index.js';
import { renderGoalsLayoutSvg } from '@transitrix/diagrams/webview/render-goals.js';
import { escXml } from '@transitrix/diagrams/webview/render-util.js';

import {
  formatBlockDiagnostics,
  isRecord,
  type BlockDiagnostic,
  type BlockRenderResult,
} from './block-types.js';
import {
  DEFAULT_SVG_DISPLAY_SETTINGS,
  isObsidianDarkHost,
  normalizeSvgDisplaySettings,
  resolveEmbedTheme,
  type SvgDisplaySettings,
} from './goals-display-settings.js';

import {
  MAX_BLOCK_BYTES,
  parseFailureAsRenderResult,
  parseSelfContainedBlockSource,
  type ParseBlockSourceCodes,
} from './parse-block-source.js';

/** @deprecated Prefer {@link MAX_BLOCK_BYTES}; kept for existing Goals tests. */
export const MAX_GOALS_BLOCK_BYTES = MAX_BLOCK_BYTES;

const GOALS_SOURCE_CODES: ParseBlockSourceCodes = {
  invalidSource: 'GOALS-BLOCK-001',
  oversize: 'GOALS-BLOCK-001',
  empty: 'GOALS-BLOCK-001',
  projection: 'GOALS-BLOCK-002',
  projectionMessage:
    'Repository-derived views are unsupported; supply a self-contained Goals document in the code block.',
};

/** Same defaults as the shared host-neutral Goals SVG helper (private constants there). */
const RANK_SEP = 100;
const NODE_SEP = 24;
const PAD = 24;

export type GoalsBlockDiagnostic = BlockDiagnostic;
export type GoalsBlockResult = BlockRenderResult;

export interface GoalsBlockRenderOptions {
  nodeSize: SvgDisplaySettings['nodeSize'];
  edgeStyle: SvgDisplaySettings['edgeStyle'];
  curvature: number;
  theme: ThemeId;
}

export function formatGoalsBlockDiagnostics(items: GoalsBlockDiagnostic[]): string {
  return formatBlockDiagnostics(items);
}

/**
 * Compose layout + SVG via existing public diagrams APIs so display options
 * (including theme) apply without changing `@transitrix/diagrams`.
 */
function renderGoalsWithDisplay(
  tree: GoalTree,
  treeName: string,
  options: GoalsBlockRenderOptions,
): string {
  const nodeSize = resolveGoalsNodeSize(parseNodeSizePreset(options.nodeSize));
  const layout = layoutGoalTree(tree, {
    nodeWidth: nodeSize.width,
    nodeHeight: nodeSize.height,
    rankSep: RANK_SEP,
    nodeSep: NODE_SEP,
  });

  if (layout.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const title = treeName
    ? `<text class="text-header" x="${PAD}" y="${PAD - 6}">${escXml(`Goal tree — ${treeName}`)}</text>`
    : '';

  return renderGoalsLayoutSvg(layout, {
    curvature: options.curvature ?? DEFAULT_EDGE_CURVATURE,
    edgeStyle: options.edgeStyle,
    title,
    topInset: title ? PAD : 0,
    embedCssTheme: options.theme,
  });
}

export function displaySettingsToRenderOptions(
  settings: SvgDisplaySettings,
  isDarkHost: boolean = isObsidianDarkHost(),
): GoalsBlockRenderOptions {
  const normalized = normalizeSvgDisplaySettings(settings);
  return {
    nodeSize: normalized.nodeSize,
    edgeStyle: normalized.edgeStyle,
    curvature: normalized.curvature,
    theme: resolveEmbedTheme(normalized.theme, isDarkHost),
  };
}

/**
 * Parse, validate and render a self-contained Goals YAML document from a
 * Markdown code block. Rejects repository projection docs (`view_config` /
 * `sources`) instead of walking the vault. Uses the shared Studio parser,
 * validator and SVG renderer — no host-specific Goals semantics.
 */
export function renderSelfContainedGoalsBlock(
  source: string,
  display: SvgDisplaySettings = DEFAULT_SVG_DISPLAY_SETTINGS,
  isDarkHost: boolean = isObsidianDarkHost(),
): GoalsBlockResult {
  const loaded = parseSelfContainedBlockSource(source, GOALS_SOURCE_CODES);
  if (!loaded.ok) return parseFailureAsRenderResult(loaded);

  const doc = loaded.doc;
  const parsed = parseCanonicalGoals(doc);
  if (!parsed.valid || !parsed.parsed) {
    return { ok: false, errors: parsed.errors, warnings: parsed.warnings };
  }

  const checked = validateGoalTree(parsed.parsed);
  const warnings = [...parsed.warnings, ...checked.warnings];
  if (!checked.valid) {
    return { ok: false, errors: checked.errors, warnings };
  }

  const meta = isRecord(doc) && typeof doc['name'] === 'string' ? doc['name'] : '';
  const svg = renderGoalsWithDisplay(
    parsed.parsed,
    meta,
    displaySettingsToRenderOptions(display, isDarkHost),
  );
  return { ok: true, svg, warnings };
}
