#!/usr/bin/env node
/**
 * Old (@resvg/resvg-js, pre-webview-canvas-rasterizer) vs new (webview
 * Chromium canvas) PNG-engine comparison — hold 6's remaining acceptance item.
 *
 * Consumes the SVG + PNG pairs `extension/test-e2e/suite/png-export.test.ts`
 * captures (the exact `transitrix:renderPng` payload and the resulting PNG
 * for goals/blocks/plantuml), rasterizes the same SVG bytes through the old
 * engine, and pixel-diffs the two outputs.
 *
 * "Old engine" here is a rebuild of `extension/src/raster.ts` as it stood at
 * tag v3.1.3 (deleted in PR #526, which moved PNG export to the webview
 * canvas) — `flattenCssVars` and the `Resvg` call are reproduced verbatim
 * below. This is a deviation from comparing against a previously-published
 * binary: no released `.vsix` asset for a pre-#526 version is obtainable —
 * the Marketplace listing was removed and no GitHub release ever attached a
 * `.vsix` file. Recorded as a deviation, not hidden — see
 * docs/internal/hold6-verification.md.
 *
 * Usage:
 *   node scripts/compare-png-engines.mjs [captureDir]
 *   (defaults to .test-out/png-capture, the harness's own TX_E2E_CAPTURE_DIR)
 *
 * Not part of the extension bundle or the VSIX — comparison tooling only,
 * run against the e2e harness's captures. @resvg/resvg-js is a devDependency
 * of the root package for this reason alone; extension/package.json still
 * declares no runtime dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const captureDir = path.resolve(process.argv[2] ?? path.join(root, '.test-out', 'png-capture'));
const reportDir = path.join(root, '.test-out', 'png-engine-comparison');

const CASES = ['goals', 'blocks', 'plantuml'];

// Verbatim from extension/src/raster.ts at tag v3.1.3 — see that file's own
// comment for why this pass exists (resvg's usvg engine does not resolve
// CSS custom properties; our exported SVGs define every colour as a
// `--ts-*` custom property).
function flattenCssVars(svg) {
  const defs = new Map();
  const declRe = /(--[A-Za-z0-9-]+)\s*:\s*([^;}]+)/g;
  let m;
  while ((m = declRe.exec(svg)) !== null) {
    defs.set(m[1], m[2].trim());
  }

  const varRe = /var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*([^)]*))?\)/g;
  const resolve = (name, fallback) => {
    if (defs.has(name)) return defs.get(name);
    return fallback !== undefined ? fallback.trim() : `var(${name})`;
  };

  let out = svg;
  let prev = '';
  let pass = 0;
  while (out !== prev && pass < 10) {
    prev = out;
    pass += 1;
    out = out.replace(varRe, (_whole, name, fb) => resolve(name, fb));
  }
  return out;
}

// Same defaults raster.ts's rasterizeSvgToPng used (scale 2, white background).
function rasterizeOld(svg) {
  const flattened = flattenCssVars(svg);
  const resvg = new Resvg(flattened, {
    background: 'white',
    fitTo: { mode: 'zoom', value: 2 },
    font: { loadSystemFonts: true },
  });
  return Buffer.from(resvg.render().asPng());
}

function readPng(buf) {
  return PNG.sync.read(buf);
}

async function main() {
  fs.mkdirSync(reportDir, { recursive: true });
  const results = [];

  for (const name of CASES) {
    const svgPath = path.join(captureDir, `${name}.svg`);
    const newPngPath = path.join(captureDir, `${name}.png`);

    if (!fs.existsSync(svgPath) || !fs.existsSync(newPngPath)) {
      results.push({ name, status: 'missing-capture', detail: `expected ${svgPath} and ${newPngPath} from the e2e harness run` });
      continue;
    }

    const svg = fs.readFileSync(svgPath, 'utf-8');
    const oldPngBuf = rasterizeOld(svg);
    const oldPngPath = path.join(reportDir, `${name}.old.png`);
    fs.writeFileSync(oldPngPath, oldPngBuf);

    const oldPng = readPng(oldPngBuf);
    const newPng = readPng(fs.readFileSync(newPngPath));

    if (oldPng.width !== newPng.width || oldPng.height !== newPng.height) {
      results.push({
        name,
        status: 'dimension-mismatch',
        detail: `old ${oldPng.width}x${oldPng.height} vs new ${newPng.width}x${newPng.height}`,
      });
      continue;
    }

    const { width, height } = oldPng;
    const diff = new PNG({ width, height });
    const diffPixels = pixelmatch(oldPng.data, newPng.data, diff.data, width, height, { threshold: 0.1 });
    const diffPath = path.join(reportDir, `${name}.diff.png`);
    fs.writeFileSync(diffPath, PNG.sync.write(diff));

    const totalPixels = width * height;
    const diffRatio = diffPixels / totalPixels;
    results.push({
      name,
      status: 'compared',
      width,
      height,
      diffPixels,
      totalPixels,
      diffRatio,
    });
  }

  const summary = results
    .map((r) => {
      if (r.status === 'compared') {
        return `- **${r.name}**: ${r.diffPixels}/${r.totalPixels} px differ (${(r.diffRatio * 100).toFixed(3)}%), ${r.width}x${r.height}`;
      }
      return `- **${r.name}**: ${r.status} — ${r.detail}`;
    })
    .join('\n');

  const report = `# PNG engine comparison (hold 6)

Old engine: rebuild of \`extension/src/raster.ts\` at tag v3.1.3 (@resvg/resvg-js
2.6.2 + \`flattenCssVars\`), not a previously-published binary — see this
script's header comment for why. New engine: the current webview Chromium
canvas rasterizer (\`webview-png-rasterizer.ts\`), captured by
\`extension/test-e2e/suite/png-export.test.ts\`.

${summary}

Diff images (old, and a pixelmatch visual diff where dimensions matched) are
in this same directory alongside this report.
`;

  fs.writeFileSync(path.join(reportDir, 'report.md'), report);
  fs.writeFileSync(path.join(reportDir, 'report.json'), JSON.stringify(results, null, 2));

  console.log(report);

  const failed = results.some((r) => r.status !== 'compared');
  if (failed) {
    console.error('compare-png-engines: one or more cases did not produce a pixel comparison — see report above.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
