import { Resvg } from '@resvg/resvg-js';

/**
 * Rasterize a BPMN SVG to PNG. Lives outside `compiler.ts` so the extension
 * compiler bundle does not pull in the native `@resvg/resvg-js` binary.
 */

function flattenCssVars(svg: string): string {
  const defs = new Map<string, string>();
  const declRe = /(--[A-Za-z0-9-]+)\s*:\s*([^;}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(svg)) !== null) {
    defs.set(m[1], m[2].trim());
  }

  const varRe = /var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*([^)]*))?\)/g;
  const resolve = (name: string, fallback: string | undefined): string => {
    if (defs.has(name)) return defs.get(name)!;
    return fallback !== undefined ? fallback.trim() : `var(${name})`;
  };

  let out = svg;
  let prev = '';
  let pass = 0;
  while (out !== prev && pass < 10) {
    prev = out;
    pass += 1;
    out = out.replace(varRe, (_whole, name: string, fb: string | undefined) => resolve(name, fb));
  }
  return out;
}

/** PNG at 1× CSS pixels (presentation frame checks use this, not retina). */
export function rasterizeBpmnSvgToPng(svg: string): Buffer {
  const flattened = flattenCssVars(svg);
  const resvg = new Resvg(flattened, {
    background: 'white',
    fitTo: { mode: 'original' },
    font: { loadSystemFonts: true },
  });
  return Buffer.from(resvg.render().asPng());
}
