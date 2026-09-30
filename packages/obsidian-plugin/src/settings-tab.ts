import { PluginSettingTab, Setting, type App } from 'obsidian';
import type TransitrixStudioPlugin from './main.js';
import {
  DEFAULT_SVG_DISPLAY_SETTINGS,
  type SvgDisplaySettings,
  type SvgThemeSetting,
} from './goals-display-settings.js';
import type { EdgeStyle } from '@transitrix/diagrams/edge-path.js';
import type { NodeSizePreset } from '@transitrix/diagrams/node-size-presets.js';

/** Delay before committing slider changes so dragging does not re-render every tick. */
const CURVATURE_DEBOUNCE_MS = 200;

export class TransitrixSettingTab extends PluginSettingTab {
  private curvatureTimer: number | null = null;
  private pendingCurvature: number | null = null;

  constructor(
    app: App,
    private readonly plugin: TransitrixStudioPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const settings = this.plugin.settings;

    // General settings stay at the top without a section heading (Obsidian guidelines).
    new Setting(containerEl)
      .setName('Theme')
      .setDesc('CSS theme embedded in every diagram fence.')
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

    new Setting(containerEl).setName('SVG display').setHeading();

    new Setting(containerEl)
      .setName('Node size')
      .setDesc('Width of nodes in diagram fences.')
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
      .setDesc('How edges are drawn. Action networks keep their own path style.')
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
      .setDesc('How strongly curved edges bend (0 = straighter, 1 = default).')
      .addSlider((slider) => {
        slider
          .setLimits(0, 3, 0.1)
          .setValue(settings.curvature)
          .setDynamicTooltip()
          .onChange((value) => {
            this.scheduleCurvatureUpdate(value);
          });
      })
      .addExtraButton((btn) => {
        btn
          .setIcon('reset')
          .setTooltip('Reset to default')
          .onClick(async () => {
            this.cancelPendingCurvature();
            await this.plugin.updateDisplaySettings({
              curvature: DEFAULT_SVG_DISPLAY_SETTINGS.curvature,
            });
            this.display();
          });
      });

    new Setting(containerEl)
      .setName('Reset display')
      .setDesc('Restore theme, node size, edge style, and curvature to defaults.')
      .addButton((btn) => {
        btn.setButtonText('Reset').onClick(async () => {
          this.cancelPendingCurvature();
          await this.plugin.updateDisplaySettings({ ...DEFAULT_SVG_DISPLAY_SETTINGS });
          this.display();
        });
      });
  }

  hide(): void {
    void this.flushCurvatureUpdate();
  }

  private scheduleCurvatureUpdate(value: number): void {
    this.pendingCurvature = value;
    this.clearCurvatureTimer();
    this.curvatureTimer = window.setTimeout(() => {
      this.curvatureTimer = null;
      void this.flushCurvatureUpdate();
    }, CURVATURE_DEBOUNCE_MS);
  }

  private async flushCurvatureUpdate(): Promise<void> {
    this.clearCurvatureTimer();
    if (this.pendingCurvature === null) return;
    const value = this.pendingCurvature;
    this.pendingCurvature = null;
    await this.plugin.updateDisplaySettings({ curvature: value });
  }

  private cancelPendingCurvature(): void {
    this.clearCurvatureTimer();
    this.pendingCurvature = null;
  }

  private clearCurvatureTimer(): void {
    if (this.curvatureTimer !== null) {
      window.clearTimeout(this.curvatureTimer);
      this.curvatureTimer = null;
    }
  }
}

export type { SvgDisplaySettings };
