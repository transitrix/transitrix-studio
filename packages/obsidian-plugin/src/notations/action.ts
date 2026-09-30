import type { BlockRenderResult } from '../block-types.js';
import {
  DEFAULT_SVG_DISPLAY_SETTINGS,
  type SvgDisplaySettings,
} from '../goals-display-settings.js';
import { renderSelfContainedActionBlock } from '../render-action-block.js';
import type { SvgBlockViewOptions } from '../svg-block-view.js';
import { SvgBlockView } from '../svg-block-view.js';
import type { NotationHandler } from './types.js';

export const ACTION_CODE_BLOCK_LANGUAGE = 'transitrix-action';

export function createActionBlockView(containerEl: HTMLElement): SvgBlockView<SvgDisplaySettings> {
  const options: SvgBlockViewOptions<SvgDisplaySettings> = {
    cssBlockClass: 'transitrix-svg-block',
    imageAlt: 'Transitrix Action diagram',
    defaultDisplay: DEFAULT_SVG_DISPLAY_SETTINGS,
    render: (source, display): BlockRenderResult => renderSelfContainedActionBlock(source, display),
  };
  return new SvgBlockView(containerEl, options);
}

export const actionNotationHandler: NotationHandler<SvgDisplaySettings> = {
  id: 'action',
  language: ACTION_CODE_BLOCK_LANGUAGE,
  usesDisplaySettings: true,
  createView: createActionBlockView,
  getDisplay: (plugin) => plugin.settings,
};
