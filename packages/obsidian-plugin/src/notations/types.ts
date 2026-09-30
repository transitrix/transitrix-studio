import type { SvgDisplaySettings } from '../goals-display-settings.js';
import type { SvgBlockView } from '../svg-block-view.js';

/** Minimal plugin surface notation handlers need (avoids importing main.ts). */
export interface NotationPluginHost {
  settings: SvgDisplaySettings;
}

/**
 * One Reading-view Markdown fence language backed by a shared SVG block view.
 */
export interface NotationHandler<TDisplay = unknown> {
  id: string;
  language: string;
  /** When true, views are refreshed on plugin display-settings changes. */
  usesDisplaySettings: boolean;
  createView(containerEl: HTMLElement): SvgBlockView<TDisplay>;
  getDisplay(plugin: NotationPluginHost): TDisplay;
}
