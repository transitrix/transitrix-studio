import type { BlockRenderResult } from '../block-types.js';
import {
  DEFAULT_SVG_DISPLAY_SETTINGS,
  type SvgDisplaySettings,
} from '../goals-display-settings.js';
import { renderSelfContainedActionCardBlock } from '../render-action-card-block.js';
import type { SvgBlockViewOptions } from '../svg-block-view.js';
import { SvgBlockView } from '../svg-block-view.js';
import type { NotationHandler } from './types.js';

export const ACTION_CARD_CODE_BLOCK_LANGUAGE = 'transitrix-action-card';

export function createActionCardBlockView(containerEl: HTMLElement): SvgBlockView<SvgDisplaySettings> {
  const options: SvgBlockViewOptions<SvgDisplaySettings> = {
    cssBlockClass: 'transitrix-svg-block',
    imageAlt: 'Transitrix Action Card diagram',
    defaultDisplay: DEFAULT_SVG_DISPLAY_SETTINGS,
    render: (source, display): BlockRenderResult => renderSelfContainedActionCardBlock(source, display),
  };
  return new SvgBlockView(containerEl, options);
}

export const actionCardNotationHandler: NotationHandler<SvgDisplaySettings> = {
  id: 'action-card',
  language: ACTION_CARD_CODE_BLOCK_LANGUAGE,
  usesDisplaySettings: true,
  createView: createActionCardBlockView,
  getDisplay: (plugin) => plugin.settings,
};
