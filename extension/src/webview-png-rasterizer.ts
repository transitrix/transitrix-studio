import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';

/**
 * Webview-side PNG rasterizer (epic transitrix-hq#138 hold 3, transitrix-hq#141).
 * Replaces the old Node-side `@resvg/resvg-js` rasterizer (raster.ts, removed):
 * the webview's own Chromium canvas draws the SVG and encodes the PNG, so no
 * native binary ships in the VSIX.
 *
 * Unlike resvg's usvg engine, Chromium resolves `var(--x)` CSS custom
 * properties declared in an SVG's own embedded `<style>` (the same element
 * `prepareSvgForExport` injects) when that SVG is drawn to a canvas via an
 * `<img>` — the workaround `flattenCssVars` existed for in raster.ts is not
 * needed here.
 */

export interface RasterizeOptions {
  /** Output scale. 2 ≈ retina-quality; the default for crisp paste/embed. */
  scale?: number;
  /** Background fill. Defaults to white — clipboard bitmaps drop alpha. */
  background?: string;
}

const REQUEST_TIMEOUT_MS = 15000;

/**
 * Extracts pixel width/height from an SVG's root element — explicit
 * width/height attributes first, falling back to viewBox. Computed
 * host-side rather than left to the webview's `<img>` intrinsic-size
 * inference, which is unreliable for a `data:` URI SVG without explicit
 * dimensions.
 */
export function extractSvgDimensions(svg: string): { width: number; height: number } {
  const openTag = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const w = /\bwidth="([\d.]+)"/.exec(openTag);
  const h = /\bheight="([\d.]+)"/.exec(openTag);
  if (w && h) return { width: parseFloat(w[1]), height: parseFloat(h[1]) };
  const vb = /\bviewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/.exec(openTag);
  if (vb) return { width: parseFloat(vb[1]), height: parseFloat(vb[2]) };
  return { width: 800, height: 600 };
}

/**
 * Asks the webview to rasterize `svg` into a PNG on its own canvas and
 * resolves with the resulting bytes. Requires the panel's HTML to have been
 * built by `buildDiagramFrame({ savePngCommand / copyPngCommand, ... })`,
 * which injects the matching listener script (see `buildPngRasterizerScript`
 * below).
 */
export function requestPngFromWebview(
  webview: vscode.Webview,
  svg: string,
  opts: RasterizeOptions = {},
): Promise<Buffer> {
  const { scale = 2, background = 'white' } = opts;
  const { width, height } = extractSvgDimensions(svg);
  const requestId = randomBytes(8).toString('hex');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sub.dispose();
      reject(new Error('PNG rasterization timed out — the preview webview did not respond.'));
    }, REQUEST_TIMEOUT_MS);

    const sub = webview.onDidReceiveMessage((msg: unknown) => {
      const m = msg as { type?: string; requestId?: string; dataUrl?: string; message?: string } | undefined;
      if (!m || m.requestId !== requestId) return;
      if (m.type === 'transitrix:pngResult' && typeof m.dataUrl === 'string') {
        clearTimeout(timer);
        sub.dispose();
        const base64 = m.dataUrl.slice(m.dataUrl.indexOf(',') + 1);
        resolve(Buffer.from(base64, 'base64'));
      } else if (m.type === 'transitrix:pngError') {
        clearTimeout(timer);
        sub.dispose();
        reject(new Error(m.message ?? 'PNG rasterization failed in the webview.'));
      }
    });

    void webview.postMessage({
      type: 'transitrix:renderPng',
      requestId, svg, scale, background, width, height,
    });
  });
}

/**
 * Builds the nonce'd `<script>` that listens for `transitrix:renderPng`
 * requests and answers with `transitrix:pngResult` / `transitrix:pngError`.
 *
 * `acquireVsCodeApi()` may only be called once per webview — some previews
 * (PlantUML, the legacy BPMN viewer) already call it in their own script.
 * The `window.__txVscodeApi` guard makes acquisition idempotent regardless
 * of which script runs first.
 */
export function buildPngRasterizerScript(nonce: string): string {
  return `<script nonce="${nonce}">
(function () {
  var vscode = window.__txVscodeApi || (window.__txVscodeApi = acquireVsCodeApi());
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.type !== 'transitrix:renderPng') return;
    var img = new Image();
    img.onload = function () {
      try {
        var w = Math.max(1, Math.round(msg.width * msg.scale));
        var h = Math.max(1, Math.round(msg.height * msg.scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = msg.background || 'white';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/png');
        vscode.postMessage({ type: 'transitrix:pngResult', requestId: msg.requestId, dataUrl: dataUrl });
      } catch (e) {
        vscode.postMessage({ type: 'transitrix:pngError', requestId: msg.requestId, message: String(e && e.message ? e.message : e) });
      }
    };
    img.onerror = function () {
      vscode.postMessage({ type: 'transitrix:pngError', requestId: msg.requestId, message: 'Failed to load the SVG for rasterization.' });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(msg.svg);
  });
}());
</script>`;
}
