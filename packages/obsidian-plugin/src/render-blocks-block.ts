import { layoutGrid, layoutNestedBlocks, validateBlocks } from '@transitrix/diagrams/blocks/index.js';
import type { BlocksFile, GridFile } from '@transitrix/diagrams/blocks/index.js';
import {
  parseNodeSizePreset,
  resolveBlocksLeafSize,
} from '@transitrix/diagrams/node-size-presets.js';
import {
  renderBlocksLayoutSvg,
  renderGridLayoutSvg,
} from '@transitrix/diagrams/webview/render-blocks.js';
import { escXml } from '@transitrix/diagrams/webview/render-util.js';

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

const BLOCKS_SOURCE_CODES: ParseBlockSourceCodes = {
  invalidSource: 'BLOCKS-BLOCK-001',
  oversize: 'BLOCKS-BLOCK-001',
  empty: 'BLOCKS-BLOCK-001',
  projection: 'BLOCKS-BLOCK-002',
  projectionMessage:
    'Repository-derived Blocks views are unsupported; supply a self-contained nested_blocks or grid document in the code block.',
};

const PAD = 24;

/**
 * Parse, validate and render nested-blocks or grid YAML.
 * Uses layout + *LayoutSvg so nodeSize and theme apply without changing diagrams exports.
 */
export function renderSelfContainedBlocksBlock(
  source: string,
  display: SvgDisplaySettings = DEFAULT_SVG_DISPLAY_SETTINGS,
  isDarkHost: boolean = isObsidianDarkHost(),
): BlockRenderResult {
  const loaded = parseSelfContainedBlockSource(source, { codes: BLOCKS_SOURCE_CODES });
  if (!loaded.ok) return parseFailureAsRenderResult(loaded);

  const doc = loaded.doc;
  const checked = validateBlocks(doc);
  if (!checked.valid) {
    return { ok: false, errors: checked.errors, warnings: checked.warnings };
  }

  const raw = isRecord(doc) ? doc : {};
  const hasGrid = raw['grid'] !== undefined && raw['grid'] !== null;
  const nested = isRecord(raw['nested_blocks']) ? raw['nested_blocks'] : undefined;
  const title = typeof raw['name'] === 'string'
    ? raw['name']
    : (nested && typeof nested['name'] === 'string' ? nested['name'] : '');

  const normalized = normalizeSvgDisplaySettings(display);
  const theme = resolveEmbedTheme(normalized.theme, isDarkHost);
  const titleSvg = title
    ? `<text class="text-header" x="${PAD}" y="${PAD - 6}">${escXml(`Nested Blocks — ${title}`)}</text>`
    : '';

  if (hasGrid) {
    const layout = layoutGrid(doc as GridFile);
    if (layout.columns.length === 0 || layout.rows.length === 0) {
      return { ok: true, svg: emptySvg(), warnings: checked.warnings };
    }
    const svg = renderGridLayoutSvg(layout, { title: titleSvg, embedCssTheme: theme });
    return { ok: true, svg, warnings: checked.warnings };
  }

  const leaf = resolveBlocksLeafSize(parseNodeSizePreset(normalized.nodeSize));
  const layout = layoutNestedBlocks(doc as BlocksFile, {
    leafWidth: leaf.width,
    leafHeight: leaf.height,
  });
  if (layout.blocks.length === 0) {
    return { ok: true, svg: emptySvg(), warnings: checked.warnings };
  }
  const svg = renderBlocksLayoutSvg(layout, { title: titleSvg, embedCssTheme: theme });
  return { ok: true, svg, warnings: checked.warnings };
}

function emptySvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
}
