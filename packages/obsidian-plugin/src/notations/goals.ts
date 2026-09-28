import type { BlockRenderResult } from '../block-types.js';
import {
  DEFAULT_SVG_DISPLAY_SETTINGS,
  type SvgDisplaySettings,
} from '../goals-display-settings.js';
import { renderSelfContainedGoalsBlock } from '../render-goals-block.js';
import type { SvgBlockViewOptions } from '../svg-block-view.js';
import { SvgBlockView } from '../svg-block-view.js';
import type { NotationHandler } from './types.js';

export const GOALS_NOTATION_ID = 'goals' as const;
export const GOALS_CODE_BLOCK_LANGUAGE = 'transitrix-goals';
export const GOALS_CSS_BLOCK_CLASS = 'transitrix-goals-block';

export function createGoalsBlockViewOptions(): SvgBlockViewOptions<SvgDisplaySettings> {
  return {
    cssBlockClass: GOALS_CSS_BLOCK_CLASS,
    imageAlt: 'Transitrix Goals diagram',
    defaultDisplay: DEFAULT_SVG_DISPLAY_SETTINGS,
    render: (source, display): BlockRenderResult => renderSelfContainedGoalsBlock(source, display),
  };
}

export function createGoalsBlockView(containerEl: HTMLElement): SvgBlockView<SvgDisplaySettings> {
  return new SvgBlockView(containerEl, createGoalsBlockViewOptions());
}

export const goalsNotationHandler: NotationHandler<SvgDisplaySettings> = {
  id: GOALS_NOTATION_ID,
  language: GOALS_CODE_BLOCK_LANGUAGE,
  usesDisplaySettings: true,
  createView: createGoalsBlockView,
  getDisplay: (plugin) => plugin.settings,
};
