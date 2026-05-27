/**
 * SVG → PNG rasterization for diagram export.
 *
 * Kept deliberately free of any `vscode` import so it can be unit-tested in
 * plain Node and — per the architectural note on vkgeorgia/strategy#32 —
 * lifted into the shared `@transitrix/diagrams` library later without
 * untangling editor glue. The VS Code wiring (save dialog, clipboard) lives
 * in `png-export.ts`.
 *
 * Rasterizer: `@resvg/resvg-js` (Rust/usvg, prebuilt per-platform binaries).
 * Chosen over a headless browser (tens of MB, heavy startup) and `sharp`
 * (librsvg SVG path is weaker on fonts/CSS, larger binary). Decision recorded
 * on vkgeorgia/strategy#32.
 */

/**
 * resvg's usvg engine does NOT resolve CSS custom properties: a
 * `fill:var(--ts-x)` rule renders as the initial value (black), verified
 * against resvg-js 2.6.2. Our exported SVGs define every colour as a
 * `--ts-*` custom property on `:root` and reference it through `var(...)`
 * (see `generateSvgEmbedCss`), so without this pass every shape and label
 * would rasterize black.
 *
 * `flattenCssVars` collects `--name: value` declarations from the embedded
 * `<style>` and substitutes each `var(--name[, fallback])` with the resolved
 * literal. It iterates so custom properties that reference other custom
 * properties (`--c: var(--base)`) resolve too, and falls back to the
 * `var(..., fallback)` argument when a name is undefined.
 */
export function flattenCssVars(svg: string): string {
  const defs = new Map<string, string>();
  const declRe = /(--[A-Za-z0-9-]+)\s*:\s*([^;}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(svg)) !== null) {
    defs.set(m[1], m[2].trim());
  }

  const varRe = /var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*([^)]*))?\)/g;
  const resolve = (name: string, fallback?: string): string => {
    if (defs.has(name)) return defs.get(name)!;
    return fallback !== undefined ? fallback.trim() : `var(${name})`;
  };

  let out = svg;
  let prev = '';
  let pass = 0;
  // Iterate until stable (handles var → var chains); cap passes to avoid
  // pathological self-referential definitions spinning forever.
  while (out !== prev && pass < 10) {
    prev = out;
    pass += 1;
    out = out.replace(varRe, (_whole, name: string, fb?: string) => resolve(name, fb));
  }
  return out;
}

export interface RasterizeOptions {
  /** Output scale. 2 ≈ retina-quality; the default for crisp paste/embed. */
  scale?: number;
  /** Background fill. Defaults to white — clipboard bitmaps drop alpha. */
  background?: string;
}

type ResvgModule = typeof import('@resvg/resvg-js');
let resvgModule: Promise<ResvgModule> | undefined;

/**
 * Lazily load the native `@resvg/resvg-js` binding. Deferred so opening a
 * preview never pays the native-module load cost — it happens only on the
 * first PNG export. The module is marked `external` in the esbuild bundle so
 * its platform `.node` binary resolves from the shipped `node_modules`.
 */
function loadResvg(): Promise<ResvgModule> {
  if (!resvgModule) resvgModule = import('@resvg/resvg-js');
  return resvgModule;
}

/**
 * Rasterize a standalone SVG string (already self-contained via
 * `prepareSvgForExport`) into a PNG buffer. CSS custom properties are
 * flattened first so resvg renders true colours.
 */
export async function rasterizeSvgToPng(svg: string, opts: RasterizeOptions = {}): Promise<Buffer> {
  const { scale = 2, background = 'white' } = opts;
  const { Resvg } = await loadResvg();
  const flattened = flattenCssVars(svg);
  const resvg = new Resvg(flattened, {
    background,
    fitTo: { mode: 'zoom', value: scale },
    font: { loadSystemFonts: true },
  });
  return Buffer.from(resvg.render().asPng());
}
