import { MarkdownRenderChild, type MarkdownPostProcessorContext, Plugin } from 'obsidian';

import {
  DEFAULT_SVG_DISPLAY_SETTINGS,
  normalizeSvgDisplaySettings,
  type SvgDisplaySettings,
} from './goals-display-settings.js';
import { GOALS_CODE_BLOCK_LANGUAGE } from './notations/goals.js';
import { NOTATION_HANDLERS } from './notations/registry.js';
import type { NotationHandler } from './notations/types.js';
import { TransitrixSettingTab } from './settings-tab.js';
import type { SvgBlockView } from './svg-block-view.js';

export { GOALS_CODE_BLOCK_LANGUAGE };

class TransitrixSvgChild extends MarkdownRenderChild {
  private readonly view: SvgBlockView<unknown>;

  constructor(
    containerEl: HTMLElement,
    private readonly source: string,
    private readonly plugin: TransitrixStudioPlugin,
    private readonly handler: NotationHandler,
  ) {
    super(containerEl);
    this.view = handler.createView(containerEl);
  }

  override onload(): void {
    if (this.handler.usesDisplaySettings) {
      this.plugin.registerSvgView(this.view);
    }
    void this.view.update(this.source, this.handler.getDisplay(this.plugin));
  }

  override onunload(): void {
    if (this.handler.usesDisplaySettings) {
      this.plugin.unregisterSvgView(this.view);
    }
    this.view.destroy();
  }
}

export default class TransitrixStudioPlugin extends Plugin {
  settings: SvgDisplaySettings = { ...DEFAULT_SVG_DISPLAY_SETTINGS };
  private readonly svgViews = new Set<SvgBlockView<unknown>>();

  override async onload(): Promise<void> {
    this.settings = normalizeSvgDisplaySettings(await this.loadData());
    this.addSettingTab(new TransitrixSettingTab(this.app, this));

    // Follow Obsidian: re-embed when the host light/dark class flips.
    this.registerEvent(
      this.app.workspace.on('css-change', () => {
        if (this.settings.theme !== 'obsidian') return;
        void this.refreshSvgViews();
      }),
    );

    for (const handler of NOTATION_HANDLERS) {
      this.registerMarkdownCodeBlockProcessor(
        handler.language,
        (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
          ctx.addChild(new TransitrixSvgChild(el, source, this, handler));
        },
      );
    }
  }

  override onunload(): void {
    this.svgViews.clear();
  }

  registerSvgView(view: SvgBlockView<unknown>): void {
    this.svgViews.add(view);
  }

  unregisterSvgView(view: SvgBlockView<unknown>): void {
    this.svgViews.delete(view);
  }

  async updateDisplaySettings(patch: Partial<SvgDisplaySettings>): Promise<void> {
    this.settings = normalizeSvgDisplaySettings({ ...this.settings, ...patch });
    await this.saveData(this.settings);
    await this.refreshSvgViews();
  }

  private async refreshSvgViews(): Promise<void> {
    const views = [...this.svgViews];
    await Promise.all(views.map((view) => view.applyDisplay(this.settings as never)));
  }
}
