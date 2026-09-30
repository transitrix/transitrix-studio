import type { BlockRenderResult } from '../block-types.js';
import {
  DEFAULT_SVG_DISPLAY_SETTINGS,
  type SvgDisplaySettings,
} from '../goals-display-settings.js';
import { renderSelfContainedBlocksBlock } from '../render-blocks-block.js';
import type { SvgBlockViewOptions } from '../svg-block-view.js';
import { SvgBlockView } from '../svg-block-view.js';
import type { NotationHandler } from './types.js';

export const BLOCKS_CODE_BLOCK_LANGUAGE = 'transitrix-blocks';

export function createBlocksBlockView(containerEl: HTMLElement): SvgBlockView<SvgDisplaySettings> {
  const options: SvgBlockViewOptions<SvgDisplaySettings> = {
    cssBlockClass: 'transitrix-svg-block',
    imageAlt: 'Transitrix Blocks diagram',
    defaultDisplay: DEFAULT_SVG_DISPLAY_SETTINGS,
    render: (source, display): BlockRenderResult => renderSelfContainedBlocksBlock(source, display),
  };
  return new SvgBlockView(containerEl, options);
}

export const blocksNotationHandler: NotationHandler<SvgDisplaySettings> = {
  id: 'blocks',
  language: BLOCKS_CODE_BLOCK_LANGUAGE,
  usesDisplaySettings: true,
  createView: createBlocksBlockView,
  getDisplay: (plugin) => plugin.settings,
};
