import type { BlockRenderResult } from '../block-types.js';
import {
  DEFAULT_SVG_DISPLAY_SETTINGS,
  type SvgDisplaySettings,
} from '../goals-display-settings.js';
import { renderSelfContainedFgcaBlock } from '../render-fgca-block.js';
import type { SvgBlockViewOptions } from '../svg-block-view.js';
import { SvgBlockView } from '../svg-block-view.js';
import type { NotationHandler } from './types.js';

export const DGA_NOTATION_ID = 'dga' as const;
export const DGA_CODE_BLOCK_LANGUAGE = 'transitrix-dga';
export const DGA_CSS_BLOCK_CLASS = 'transitrix-svg-block';

export function createDgaBlockView(containerEl: HTMLElement): SvgBlockView<SvgDisplaySettings> {
  const options: SvgBlockViewOptions<SvgDisplaySettings> = {
    cssBlockClass: DGA_CSS_BLOCK_CLASS,
    imageAlt: 'Transitrix DGA diagram',
    defaultDisplay: DEFAULT_SVG_DISPLAY_SETTINGS,
    render: (source, display): BlockRenderResult => renderSelfContainedFgcaBlock(source, 'dga', display),
  };
  return new SvgBlockView(containerEl, options);
}

export const dgaNotationHandler: NotationHandler<SvgDisplaySettings> = {
  id: DGA_NOTATION_ID,
  language: DGA_CODE_BLOCK_LANGUAGE,
  usesDisplaySettings: true,
  createView: createDgaBlockView,
  getDisplay: (plugin) => plugin.settings,
};
