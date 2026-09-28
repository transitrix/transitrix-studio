import type { BlockRenderResult } from '../block-types.js';
import {
  DEFAULT_SVG_DISPLAY_SETTINGS,
  type SvgDisplaySettings,
} from '../goals-display-settings.js';
import { renderSelfContainedProcessBlueprintBlock } from '../render-process-blueprint-block.js';
import type { SvgBlockViewOptions } from '../svg-block-view.js';
import { SvgBlockView } from '../svg-block-view.js';
import type { NotationHandler } from './types.js';

export const PROCESS_BLUEPRINT_CODE_BLOCK_LANGUAGE = 'transitrix-process-blueprint';

export function createProcessBlueprintBlockView(containerEl: HTMLElement): SvgBlockView<SvgDisplaySettings> {
  const options: SvgBlockViewOptions<SvgDisplaySettings> = {
    cssBlockClass: 'transitrix-svg-block',
    imageAlt: 'Transitrix Process Blueprint diagram',
    defaultDisplay: DEFAULT_SVG_DISPLAY_SETTINGS,
    render: (source, display): BlockRenderResult =>
      renderSelfContainedProcessBlueprintBlock(source, display),
  };
  return new SvgBlockView(containerEl, options);
}

export const processBlueprintNotationHandler: NotationHandler<SvgDisplaySettings> = {
  id: 'process-blueprint',
  language: PROCESS_BLUEPRINT_CODE_BLOCK_LANGUAGE,
  usesDisplaySettings: true,
  createView: createProcessBlueprintBlockView,
  getDisplay: (plugin) => plugin.settings,
};
