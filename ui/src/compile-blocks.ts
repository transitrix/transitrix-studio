import yaml from 'js-yaml';

import { validateBlocks } from '../../packages/diagrams/src/blocks/index.js';
import type { BlocksFile, GridFile } from '../../packages/diagrams/src/blocks/types.js';
import { renderBlocksSvg, renderGridSvg } from '../../packages/diagrams/src/webview/render-blocks.js';

/** Compile the browser Blocks tab through the shared native YAML implementation. */
export function compileBlocksSvg(source: string): string {
  const parsed: unknown = yaml.load(source);
  const validation = validateBlocks(parsed);
  if (!validation.valid) {
    throw new Error(validation.errors.map(error => `${error.code}: ${error.message}`).join('\n'));
  }
  const raw = parsed as Record<string, unknown>;
  const hasGrid = raw.grid !== undefined && raw.grid !== null;
  return hasGrid ? renderGridSvg(parsed as GridFile) : renderBlocksSvg(parsed as BlocksFile);
}
