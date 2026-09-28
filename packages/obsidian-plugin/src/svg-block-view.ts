import type { BlockRenderResult } from './block-types.js';
import { clearSvgBlockHost, paintSvgBlockResult } from './paint-result.js';

export interface SvgBlockViewOptions<TDisplay> {
  cssBlockClass: string;
  imageAlt: string;
  render: (source: string, display: TDisplay) => BlockRenderResult;
  defaultDisplay: TDisplay;
}

/**
 * Owns one Markdown code-block host element: generation tokens for overlapping
 * updates, DOM replacement, and teardown. SVG is shown as an image document,
 * never assigned to innerHTML.
 */
export class SvgBlockView<TDisplay> {
  private generation = 0;
  private source = '';
  private display: TDisplay;

  constructor(
    private readonly containerEl: HTMLElement,
    private readonly options: SvgBlockViewOptions<TDisplay>,
  ) {
    this.display = options.defaultDisplay;
  }

  async update(source: string, display: TDisplay = this.display): Promise<void> {
    this.source = source;
    this.display = display;
    const generation = ++this.generation;
    const result = this.options.render(source, display);
    await Promise.resolve();
    if (generation !== this.generation) return;
    paintSvgBlockResult(this.containerEl, result, {
      cssBlockClass: this.options.cssBlockClass,
      imageAlt: this.options.imageAlt,
    });
  }

  /** Re-render the last source with new display settings (settings tab changes). */
  async applyDisplay(display: TDisplay): Promise<void> {
    if (!this.source) {
      this.display = display;
      return;
    }
    await this.update(this.source, display);
  }

  destroy(): void {
    this.generation += 1;
    this.source = '';
    clearSvgBlockHost(this.containerEl, this.options.cssBlockClass);
  }
}
