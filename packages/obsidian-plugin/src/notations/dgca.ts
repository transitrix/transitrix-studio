import type { BlockRenderResult } from '../block-types.js';
import {
  DEFAULT_SVG_DISPLAY_SETTINGS,
  type SvgDisplaySettings,
} from '../goals-display-settings.js';
import { renderSelfContainedFgcaBlock } from '../render-fgca-block.js';
import type { SvgBlockViewOptions } from '../svg-block-view.js';
import { SvgBlockView } from '../svg-block-view.js';
import type { NotationHandler } from './types.js';

export const DGCA_NOTATION_ID = 'dgca' as const;
export const DGCA_CODE_BLOCK_LANGUAGE = 'transitrix-dgca';
export const DGCA_CSS_BLOCK_CLASS = 'transitrix-svg-block';

export function createDgcaBlockView(containerEl: HTMLElement): SvgBlockView<SvgDisplaySettings> {
  const options: SvgBlockViewOptions<SvgDisplaySettings> = {
    cssBlockClass: DGCA_CSS_BLOCK_CLASS,
    imageAlt: 'Transitrix DGCA diagram',
    defaultDisplay: DEFAULT_SVG_DISPLAY_SETTINGS,
    render: (source, display): BlockRenderResult => renderSelfContainedFgcaBlock(source, 'dgca', display),
  };
  return new SvgBlockView(containerEl, options);
}

export const dgcaNotationHandler: NotationHandler<SvgDisplaySettings> = {
  id: DGCA_NOTATION_ID,
  language: DGCA_CODE_BLOCK_LANGUAGE,
  usesDisplaySettings: true,
  createView: createDgcaBlockView,
  getDisplay: (plugin) => plugin.settings,
};
