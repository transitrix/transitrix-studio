import type { SvgDisplaySettings } from './goals-display-settings.js';
import { createGoalsBlockView } from './notations/goals.js';
import type { SvgBlockView } from './svg-block-view.js';

/**
 * Goals Reading-view block host. Thin wrapper over {@link SvgBlockView} so
 * existing tests and call sites keep a stable type name.
 */
export class GoalsBlockView {
  private readonly inner: SvgBlockView<SvgDisplaySettings>;

  constructor(containerEl: HTMLElement) {
    this.inner = createGoalsBlockView(containerEl);
  }

  async update(source: string, display?: SvgDisplaySettings): Promise<void> {
    if (display === undefined) await this.inner.update(source);
    else await this.inner.update(source, display);
  }

  async applyDisplay(display: SvgDisplaySettings): Promise<void> {
    await this.inner.applyDisplay(display);
  }

  destroy(): void {
    this.inner.destroy();
  }
}
