import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import { StaticSvgPreview } from './static-preview.js';
import {
  validateNestedBlocks,
  layoutNestedBlocks,
  iterateBlocks,
  type BlocksFile,
  type BlocksLayout,
} from '@transitrix/diagrams/blocks';
import { coerceDatesToIsoStrings } from '@transitrix/diagrams/yaml-normalize.js';
import { renderBlocksLayoutSvg } from '@transitrix/diagrams/webview/render-blocks.js';


// Pad reserved around the diagram; mirrors `PAD` in the shared emitter
// (`render-blocks.ts`) so the VS Code title block lines up with the body.
const PAD = 24;

/**
 * VS Code wrapper around the shared {@link renderBlocksLayoutSvg} emitter. Adds
 * the rich title block (reserving `topInset` for it) and leaves the body — node
 * rects, headers, level classes — to the single source of truth in
 * `@transitrix/diagrams`. No embedded CSS: the webview supplies it live and the
 * export path embeds it via `prepareSvgForExport`.
 */
function layoutToSvg(
  layout: BlocksLayout,
  filename?: string,
  date?: string,
  version?: string,
): string {
  const showTitle = filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;
  const titleSvg = showTitle ? titleBlockSvg('Nested Blocks', filename!, date!, PAD, PAD, version) : '';
  return renderBlocksLayoutSvg(layout, { topInset: titleH, title: titleSvg });
}

export class BlocksPreview extends StaticSvgPreview {
  readonly panelTitle = 'Blocks Preview';
  protected readonly viewType = 'blocksPreview';
  protected readonly enableCommandUris = [
    'transitrixStudio.saveBlocksAsSvg',
    'transitrixStudio.saveBlocksAsPng',
    'transitrixStudio.copyBlocksAsPng',
    'transitrixStudio.changeTheme',
  ];
  protected readonly stripExt = /\.blocks\.transitrix\.yaml$/;
  protected readonly emptyMessage = 'No diagram rendered yet. Open a *.blocks.transitrix.yaml file first.';

  protected renderHtml(yamlText: string, filename: string): string {
    let svgContent = '';
    let errorMsg = '';
    let warnings: string[] = [];

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      const v = validateNestedBlocks(parsed);
      warnings = v.warnings.map((w) => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map((e) => `${e.code}: ${e.message}`).join('\n');
      } else {
        const file = parsed as BlocksFile;
        const raw = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
        const nb =
          (file as unknown as { nested_blocks?: { version?: unknown; date?: unknown } })
            .nested_blocks ?? {};
        const docVersion = typeof nb.version === 'string' ? nb.version : undefined;
        const docDate = (typeof raw['generated_at'] === 'string' ? raw['generated_at'] : undefined)
          ?? (typeof nb.date === 'string' ? nb.date : undefined)
          ?? todayIso();
        const layout = layoutNestedBlocks(file);
        svgContent = layoutToSvg(layout, filename, docDate, docVersion);

        // BL-008 / BL-009 may still be present even when the document is
        // valid; surface them through the diagram-frame warnings channel.
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    this.lastSvg = svgContent;

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({
      filename,
      notation: 'Nested Blocks',
      svgContent,
      errorMsg,
      warnings,
      themeId,
      saveSvgCommand: 'transitrixStudio.saveBlocksAsSvg',
      savePngCommand: 'transitrixStudio.saveBlocksAsPng',
      copyPngCommand: 'transitrixStudio.copyBlocksAsPng',
      themeCommand: OPEN_THEME_COMMAND,
    });
  }

}

// `iterateBlocks` is re-exported by the diagrams package and used internally
// by the SVG emitter via tree walks; keep it imported here so the test that
// asserts pre-order iteration can run against the same source-of-truth.
void iterateBlocks;
