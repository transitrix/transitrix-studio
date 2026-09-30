import { formatBlockDiagnostics, type BlockRenderResult } from './block-types.js';

function svgToImageDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
  containerEl.replaceChildren();
  containerEl.classList.add(cssBlockClass);

  if (!result.ok) {
    const errorEl = document.createElement('pre');
    errorEl.className = `${cssBlockClass}__error`;
    errorEl.textContent = formatBlockDiagnostics(result.errors);
    containerEl.appendChild(errorEl);
    return;
  }

  if (result.warnings.length > 0) {
    const warnEl = document.createElement('pre');
    warnEl.className = `${cssBlockClass}__warnings`;
    warnEl.textContent = formatBlockDiagnostics(result.warnings);
    containerEl.appendChild(warnEl);
  }

  const frame = document.createElement('div');
  frame.className = `${cssBlockClass}__frame`;
  const img = document.createElement('img');
  img.className = `${cssBlockClass}__image`;
  img.alt = imageAlt;
  img.src = svgToImageDataUri(result.svg);
  frame.appendChild(img);
  containerEl.appendChild(frame);
}

export function clearSvgBlockHost(containerEl: HTMLElement, cssBlockClass: string): void {
  containerEl.replaceChildren();
  containerEl.classList.remove(cssBlockClass);
}
