import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(root, 'dist'), { recursive: true });
await build({ entryPoints: [path.join(root, 'server.mjs')], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: path.join(root, 'dist/server.mjs') });
const browser = await build({ entryPoints: [path.join(root, 'viewer.mjs')], bundle: true, platform: 'browser', format: 'iife', target: 'es2022', write: false, minify: true });
const script = browser.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// Sequence diagrams do not use Graphviz; all other PlantUML families are rejected.
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>Transitrix diagram viewer</title><style>
*{box-sizing:border-box}body{margin:0;padding:12px;background:#fff;color:#153d43;font:14px 'IBM Plex Sans',sans-serif}header{display:flex;gap:8px;align-items:center;flex-wrap:wrap}h1{font-size:18px;margin:0 auto 0 0;font-weight:500}button{font:inherit;border:1px solid #607d81;background:#f5faf9;color:#153d43;border-radius:4px;padding:6px 10px;cursor:pointer}button:focus-visible,#viewport:focus-visible{outline:3px solid #3b6cb3}button:disabled{opacity:.5;cursor:default}#viewport{height:400px;overflow:hidden;position:relative;touch-action:none;background:#f5faf9;margin-top:10px;border:1px solid #d5e1df;cursor:grab}#diagram{position:absolute;transform-origin:0 0;max-width:none;user-select:none;pointer-events:none}#source{overflow-wrap:anywhere;font:12px 'IBM Plex Mono',monospace;margin:10px 0}#expansion{display:flex;gap:6px;flex-wrap:wrap;max-height:70px;overflow:auto}#status{margin:8px 0}.error{color:#b3261e}#warnings{white-space:pre-wrap;color:#795000}
</style></head><body><header><h1>Diagram viewer</h1><button id="zoom-out" aria-label="Zoom out">−</button><button id="zoom-in" aria-label="Zoom in">+</button><button id="fit">Fit</button><button id="refresh" disabled>Refresh</button></header>
<p id="source">No source selected</p><div id="expansion" aria-label="Goal expansion"></div><div id="viewport" tabindex="0" role="region" aria-label="Diagram. Arrow keys pan, plus and minus zoom, zero fits."><img id="diagram" alt="Diagram" draggable="false"></div><p id="status" role="status" aria-live="polite">Connecting to host…</p><p id="warnings"></p><script>${script}</script></body></html>`;
await writeFile(path.join(root, 'dist/viewer.html'), html);
await copyFile(path.join(root, '../../node_modules/@plantuml/core/LICENSE'), path.join(root, 'dist/plantuml-license.txt'));
await copyFile(path.join(root, '../../LICENSE'), path.join(root, 'dist/LICENSE'));
await copyFile(path.join(root, '../../node_modules/js-yaml/LICENSE'), path.join(root, 'dist/js-yaml-license.txt'));
console.log('Built packages/viewer/dist/server.mjs and viewer.html');
