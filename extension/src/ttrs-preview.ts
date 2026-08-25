import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
import { StaticPreview } from './static-preview.js';
import { renderTtrsResult, TTRS_STYLES, type FigureEmbed } from './ttrs-render.js';
import { coerceDatesToIsoStrings } from '@transitrix/diagrams/yaml-normalize.js';
import {
  validateBlocks,
  layoutNestedBlocks,
  layoutGrid,
  type BlocksFile,
  type GridFile,
} from '@transitrix/diagrams/blocks';
import { renderBlocksLayoutSvg, renderGridLayoutSvg } from '@transitrix/diagrams/webview/render-blocks.js';
import { readBlocksLeafSize } from './node-size-config.js';

// The vendored @transitrix/document-renderer pass-1 resolver
// (vendor/methodology/README.md "document-renderer/"). A real library
// import against the methodology-authored resolver — not a
// reimplementation of its resolution logic. See tests/document-renderer-vendor.test.ts
// for the integrity check that keeps this import target trustworthy.
// Typed by the co-located pass1.d.mts (vendor/methodology/document-renderer/) —
// Studio's own type contract for the vendored JS, not part of what's fetched.
import { runPass1 } from '../../vendor/methodology/document-renderer/pass1.mjs';

/** Detects `.ttrs` document-recipe files (transitrix-hq#56 registered the language). */
export function isTtrsFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.ttrs');
}

/**
 * Rasterises a resolved figure for the preview. Pass 1 leaves this to the
 * output layer by design (its README: "Turning a view source into a raster
 * is the output layer's job, reached through the optional rasterise hook so
 * this module stays free of any renderer dependency") — this is that layer.
 *
 * Must be synchronous: pass 1 calls it without awaiting.
 *
 * Scope, stated rather than silently gapped: an `.svg` asset (a supplied
 * figure, `{{ figure … }}`) is inlined verbatim. A derived figure
 * (`{{ view … }}`) sourced from a `*.blocks.transitrix.yaml` file is
 * rendered through the same `@transitrix/diagrams` blocks emitter the
 * Blocks preview uses. Every other view notation is not yet wired into this
 * preview — it renders as a clearly labelled "not rendered" note naming the
 * source, never a broken image and never silently dropped.
 */
function rasteriseFigure(
  input: { kind: 'view' | 'figure'; source: string; name: string; number: number; fit: string | null },
  figureEmbeds: Map<number, FigureEmbed>,
): string {
  const embedPath = `#ttrs-fig-${input.number}`;
  try {
    if (/\.svg$/i.test(input.source)) {
      figureEmbeds.set(input.number, { svg: readFileSync(input.source, 'utf8') });
      return embedPath;
    }
    if (input.kind === 'view' && /\.blocks\.transitrix\.ya?ml$/i.test(input.source)) {
      const raw = readFileSync(input.source, 'utf8');
      const parsed = coerceDatesToIsoStrings(yaml.load(raw) as unknown);
      const rawObj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
      const hasGrid = rawObj['grid'] !== undefined && rawObj['grid'] !== null;
      const v = validateBlocks(parsed);
      if (!v.valid) {
        figureEmbeds.set(input.number, {
          unavailable: `diagram does not validate — ${v.errors.map((e) => e.code).join(', ')}`,
        });
      } else if (hasGrid) {
        const layout = layoutGrid(parsed as GridFile);
        figureEmbeds.set(input.number, { svg: renderGridLayoutSvg(layout, { topInset: 0, title: '' }) });
      } else {
        const leafSize = readBlocksLeafSize();
        const layout = layoutNestedBlocks(parsed as BlocksFile, { leafWidth: leafSize.width, leafHeight: leafSize.height });
        figureEmbeds.set(input.number, { svg: renderBlocksLayoutSvg(layout, { topInset: 0, title: '' }) });
      }
      return embedPath;
    }
    figureEmbeds.set(input.number, {
      unavailable: `rendering not available in the editor preview for this notation (${path.basename(input.source)})`,
    });
    return embedPath;
  } catch (e) {
    figureEmbeds.set(input.number, { unavailable: (e as Error).message ?? 'figure failed to render' });
    return embedPath;
  }
}

/**
 * Live preview of a `.ttrs` document's pass-1 (deterministic) output
 * (transitrix-hq#57). Wired against the vendored @transitrix/document-renderer
 * as a library call — model-object references, derived figures and the four
 * resolver states are pass 1's own; this class only turns its result into
 * webview HTML (extension/src/ttrs-render.ts) and supplies the rasterise hook
 * above.
 */
export class TtrsPreview extends StaticPreview {
  readonly panelTitle = 'Document Preview';
  protected readonly viewType = 'ttrsPreview';
  protected readonly enableCommandUris = [OPEN_THEME_COMMAND];

  protected override async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const filename = path.basename(doc.fileName);
    const figureEmbeds = new Map<number, FigureEmbed>();
    let bodyContent = '';
    let errorMsg = '';

    try {
      const result = await runPass1({
        text: doc.getText(),
        recipePath: doc.fileName,
        profile: 'review',
        rasterise: (input) => rasteriseFigure(input, figureEmbeds),
      });

      if (result.header === null) {
        // No `---` front matter at all — pass 1 never got as far as an AST.
        errorMsg = result.errors.map((e) => `${e.code}: ${e.message}`).join('\n');
      } else {
        const rendered = renderTtrsResult(result, figureEmbeds);
        bodyContent = rendered.bodyContent;
        errorMsg = rendered.errorMsg;
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Pass 1 failed';
    }

    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    if (!this.panel) return; // panel may have been disposed while awaiting above
    this.panel.webview.html = buildDiagramFrame({
      filename,
      notation: 'Document (.ttrs)',
      bodyContent,
      errorMsg,
      themeId,
      extraStyles: TTRS_STYLES,
      themeCommand: OPEN_THEME_COMMAND,
    });
  }
}
