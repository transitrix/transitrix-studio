import 'obsidian';

import { formatBlockDiagnostics, type BlockDiagnostic, type BlockRenderResult } from './block-types.js';

function svgToImageDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Goals/Blocks empty layouts emit a zero-size SVG placeholder rather than "". */
function isEmptySvg(svg: string): boolean {
  const trimmed = svg.trim();
  if (!trimmed) return true;
  return /\bwidth="0"/.test(trimmed) && /\bheight="0"/.test(trimmed);
}

export interface PaintSvgBlockOptions {
  /** Root BEM block class, e.g. `transitrix-goals-block`. */
  cssBlockClass: string;
  imageAlt: string;
}

/**
 * Replace the host contents with an error panel or an &lt;img&gt; whose src is a
 * data-URI SVG. Never assigns untrusted markup to innerHTML.
 */
export function paintSvgBlockResult(
  containerEl: HTMLElement,
  result: BlockRenderResult,
  options: PaintSvgBlockOptions,
): void {
  const { cssBlockClass, imageAlt } = options;
  containerEl.empty();
  containerEl.addClass(cssBlockClass);

  if (!result.ok) {
    buildMessagePanel(containerEl, cssBlockClass, 'error', 'Could not render diagram', result.errors);
    return;
  }

  if (result.warnings.length > 0) {
    buildMessagePanel(
      containerEl,
      cssBlockClass,
      'warnings',
      'Diagram rendered with warnings',
      result.warnings,
    );
  }

  if (isEmptySvg(result.svg)) {
    buildMessagePanel(containerEl, cssBlockClass, 'empty', 'Diagram is empty', [
      { code: 'EMPTY', message: 'The document produced no drawable content.' },
    ]);
    return;
  }

  const frame = containerEl.createDiv({ cls: `${cssBlockClass}__frame` });
  const img = frame.createEl('img', {
    cls: `${cssBlockClass}__image`,
    attr: { alt: imageAlt },
  });
  img.src = svgToImageDataUri(result.svg);
}

export function clearSvgBlockHost(containerEl: HTMLElement, cssBlockClass: string): void {
  containerEl.empty();
  containerEl.removeClass(cssBlockClass);
}

function buildMessagePanel(
  parent: HTMLElement,
  cssBlockClass: string,
  kind: 'error' | 'warnings' | 'empty',
  title: string,
  items: BlockDiagnostic[],
): void {
  const panel = parent.createDiv({ cls: `${cssBlockClass}__${kind}` });
  if (kind === 'error' || kind === 'empty') {
    panel.setAttribute('role', 'alert');
  }

  panel.createDiv({
    cls: `${cssBlockClass}__${kind}-title`,
    text: title,
  });

  const detail = panel.createEl('pre', { cls: `${cssBlockClass}__${kind}-detail` });
  detail.textContent = formatBlockDiagnostics(items);
}
