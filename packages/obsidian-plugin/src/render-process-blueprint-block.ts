import { validateProcessBlueprint } from '@transitrix/diagrams/process-blueprint/index.js';
import type { ProcessBlueprintFile } from '@transitrix/diagrams/process-blueprint/index.js';
import { renderProcessBlueprintSvg } from '@transitrix/diagrams/webview/render-process-blueprint.js';

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

const BLUEPRINT_SOURCE_CODES: ParseBlockSourceCodes = {
  invalidSource: 'BLUEPRINT-BLOCK-001',
  oversize: 'BLUEPRINT-BLOCK-001',
  empty: 'BLUEPRINT-BLOCK-001',
  projection: 'BLUEPRINT-BLOCK-002',
  projectionMessage:
    'Repository-derived Process Blueprint views are unsupported; supply a self-contained process_blueprint document in the code block.',
};

/** Parse, validate and render a self-contained Process Blueprint YAML document. */
export function renderSelfContainedProcessBlueprintBlock(
  source: string,
  display: SvgDisplaySettings = DEFAULT_SVG_DISPLAY_SETTINGS,
  isDarkHost: boolean = isObsidianDarkHost(),
): BlockRenderResult {
  const loaded = parseSelfContainedBlockSource(source, { codes: BLUEPRINT_SOURCE_CODES });
  if (!loaded.ok) return parseFailureAsRenderResult(loaded);

  const doc = loaded.doc;
  const checked = validateProcessBlueprint(doc);
  if (!checked.valid) {
    return { ok: false, errors: checked.errors, warnings: checked.warnings };
  }

  const normalized = normalizeSvgDisplaySettings(display);
  const bp = isRecord(doc) ? doc['process_blueprint'] : undefined;
  const title = isRecord(bp) && typeof bp['name'] === 'string' ? bp['name'] : '';
  const svg = renderProcessBlueprintSvg(doc as ProcessBlueprintFile, {
    title,
    nodeSizePreset: normalized.nodeSize,
    embedCssTheme: resolveEmbedTheme(normalized.theme, isDarkHost),
  });
  return { ok: true, svg, warnings: checked.warnings };
}
