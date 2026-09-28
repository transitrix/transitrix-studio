import { PluginSettingTab, Setting, type App } from 'obsidian';
import type TransitrixStudioPlugin from './main.js';
import {
  DEFAULT_SVG_DISPLAY_SETTINGS,
  type SvgDisplaySettings,
  type SvgThemeSetting,
} from './goals-display-settings.js';
import type { EdgeStyle } from '@transitrix/diagrams/edge-path.js';
import type { NodeSizePreset } from '@transitrix/diagrams/node-size-presets.js';

/** Reading-view fences that use the shared SVG display knobs (not Theme). */
const SVG_DISPLAY_NOTATIONS =
  'Goals, DGCA, DGA, Action (network), Nested Blocks / grid, Process Blueprint. Action Card uses Theme only.';

export class TransitrixSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: TransitrixStudioPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Transitrix Studio' });

    const settings = this.plugin.settings;

    containerEl.createEl('h3', { text: 'General' });
    containerEl.createEl('p', {
      text: 'Applies to every Reading-view diagram fence that embeds Studio theme CSS.',
    });

    new Setting(containerEl)
      .setName('Theme')
      .setDesc('Goals, DGCA/DGA, Action, Action Card, Nested Blocks, Process Blueprint.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('transitrix', 'Transitrix light')
          .addOption('transitrix-dark', 'Transitrix dark')
          .addOption('obsidian', 'Follow Obsidian')
          .setValue(settings.theme)
          .onChange(async (value) => {
            await this.plugin.updateDisplaySettings({ theme: value as SvgThemeSetting });
          });
      });

    containerEl.createEl('h3', { text: 'SVG display' });
    containerEl.createEl('p', {
      text: `Layout knobs for SVG Reading-view fences: ${SVG_DISPLAY_NOTATIONS}`,
    });

    new Setting(containerEl)
      .setName('Node size')
      .setDesc('Goals, DGCA/DGA, Action, Nested Blocks, Process Blueprint.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('compact', 'Compact')
          .addOption('normal', 'Normal')
          .addOption('wide', 'Wide')
          .setValue(settings.nodeSize)
          .onChange(async (value) => {
            await this.plugin.updateDisplaySettings({ nodeSize: value as NodeSizePreset });
          });
      });

    new Setting(containerEl)
      .setName('Edge style')
      .setDesc('Goals, DGCA, DGA. Action uses its own default path style.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('straight', 'Straight')
          .addOption('bezier', 'Bezier')
          .addOption('polyline', 'Polyline')
          .setValue(settings.edgeStyle)
          .onChange(async (value) => {
            await this.plugin.updateDisplaySettings({ edgeStyle: value as EdgeStyle });
          });
      });

    new Setting(containerEl)
      .setName('Edge curvature')
      .setDesc('Goals, DGCA/DGA, Action. 0 = straighter, 1 = default, higher = stronger arc.')
      .addSlider((slider) => {
        slider
          .setLimits(0, 3, 0.1)
          .setValue(settings.curvature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.plugin.updateDisplaySettings({ curvature: value });
          });
      })
      .addExtraButton((btn) => {
        btn
          .setIcon('reset')
          .setTooltip('Reset to default')
          .onClick(async () => {
            await this.plugin.updateDisplaySettings({
              curvature: DEFAULT_SVG_DISPLAY_SETTINGS.curvature,
            });
            this.display();
          });
      });
  }
}

export type { SvgDisplaySettings };
