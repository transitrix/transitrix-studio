/**
 * PNG export suite (transitrix-hq#143, hold 6): exercises the real
 * `Save .png` command per notation family through the same
 * `showSaveDialog` → webview-canvas-rasterizer → `workspace.fs.writeFile`
 * path a human triggers from the toolbar (`png-export.ts`,
 * `webview-png-rasterizer.ts`), and asserts the file written is a real,
 * non-empty, correctly-sized PNG — not just "the command didn't throw".
 *
 * Also the source of the "new path" (webview-canvas rasterizer, hold 3 /
 * transitrix-hq#141) side of the PNG-engine comparison recorded in
 * docs/internal/hold6-verification.md: these captures land in
 * TX_E2E_CAPTURE_DIR and are copied out for that comparison.
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { PNG } from 'pngjs';
import {
  captureWebviewPanels,
  captureNotifications,
  captureMessages,
  captureOutgoing,
  openFixture,
  closeAllEditors,
  withSaveDialogTarget,
  waitFor,
  CAPTURE_DIR,
  ensureCaptureDir,
  ensureExtensionActivated,
} from '../helpers';

interface PngCase {
  name: string;
  fixture: string;
  saveCommand: string;
  outFile: string;
  /**
   * Synchronous SVG-family previews (goals, blocks, …) set their host-held
   * `lastSvg` in the same call that opens the panel. PlantUML (and the
   * legacy BPMN viewer) render inside the webview itself and post the SVG
   * back over `onDidReceiveMessage({ type: 'rendered', ... })` — Save must
   * wait for that message, or it exports against an empty `lastSvg` and
   * just shows a warning instead of writing a file.
   */
  waitForRenderedMessage?: boolean;
}

const CASES: PngCase[] = [
  { name: 'goals', fixture: 'goals/strategy-2026.goals.transitrix.yaml', saveCommand: 'transitrixStudio.saveGoalsAsPng', outFile: 'goals.png' },
  { name: 'blocks', fixture: 'blocks/architecture.blocks.transitrix.yaml', saveCommand: 'transitrixStudio.saveBlocksAsPng', outFile: 'blocks.png' },
  { name: 'plantuml', fixture: 'plantuml/sample.puml', saveCommand: 'transitrixStudio.savePumlAsPng', outFile: 'plantuml.png', waitForRenderedMessage: true },
];

describe('PNG export produces real images (transitrix-hq#143)', function () {
  this.timeout(60000);

  before(ensureExtensionActivated);
  before(() => ensureCaptureDir());

  afterEach(async () => {
    await closeAllEditors();
  });

  for (const c of CASES) {
    it(`exports PNG: ${c.name}`, async () => {
      const { panels } = await captureWebviewPanels(async () => openFixture(c.fixture));
      assert.ok(panels.length >= 1, `expected a webview panel to open for ${c.name}`);
      const panel = panels[panels.length - 1];

      if (c.waitForRenderedMessage) {
        const { messages, dispose } = captureMessages(panel.webview);
        try {
          await waitFor(() => messages.some((m) => m.type === 'rendered'), {
            timeoutMs: 20000,
            label: `${c.name}: webview 'rendered' message`,
          });
        } finally {
          dispose();
        }
      }

      const outPath = path.join(CAPTURE_DIR!, c.outFile);
      fs.rmSync(outPath, { force: true });

      // Records the exact `transitrix:renderPng` payload (the SVG bytes
      // handed to the webview canvas rasterizer) so the old-vs-new PNG
      // engine comparison in docs/internal/hold6-verification.md feeds
      // *identical* SVG source into both engines — isolating the compared
      // variable to the rasterizer itself.
      const { sent, dispose: disposeOutgoing } = captureOutgoing(panel.webview);
      const { errors, warnings } = await captureNotifications(async () => {
        await withSaveDialogTarget(outPath, async () => {
          await vscode.commands.executeCommand(c.saveCommand);
        });
      });
      disposeOutgoing();
      assert.deepStrictEqual(warnings, [], `${c.name}: PNG export reported a warning (likely "no diagram rendered yet")`);
      assert.deepStrictEqual(errors, [], `${c.name}: PNG export reported an error`);

      const renderRequest = sent.find((m) => m.type === 'transitrix:renderPng') as { svg?: string } | undefined;
      assert.ok(renderRequest?.svg, `${c.name}: expected a transitrix:renderPng request carrying the SVG payload`);
      const svgPath = path.join(CAPTURE_DIR!, c.outFile.replace(/\.png$/, '.svg'));
      fs.writeFileSync(svgPath, renderRequest!.svg!, 'utf-8');

      await waitFor(() => fs.existsSync(outPath), { timeoutMs: 15000, label: `${c.name}: PNG file at ${outPath}` });

      const buf = fs.readFileSync(outPath);
      assert.ok(buf.length > 0, `${c.name}: PNG file is empty`);
      assert.strictEqual(buf.toString('ascii', 1, 4), 'PNG', `${c.name}: file at ${outPath} does not have a PNG signature`);

      const png = PNG.sync.read(buf);
      assert.ok(png.width > 0 && png.height > 0, `${c.name}: PNG decoded with invalid dimensions (${png.width}x${png.height})`);
    });
  }
});
