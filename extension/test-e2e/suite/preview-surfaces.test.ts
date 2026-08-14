/**
 * Surface-coverage suite (transitrix-hq#143, hold 6): opens the real fixture
 * for every notation/document surface the extension previews, through the
 * same auto-open-on-active-editor path a human triggers by clicking a file,
 * and asserts the resulting webview actually rendered non-trivial content —
 * not just "the command didn't throw".
 *
 * "Rendered" is checked two ways, since previews differ in how they build
 * their webview HTML:
 *  - synchronous previews (goals, dgca, dga, blocks, …) set `webview.html`
 *    with the final SVG in the same call that opens the panel — checked via
 *    content-stabilization + a minimum length past the loading shell.
 *  - the legacy BPMN preview and PlantUML render inside the webview itself
 *    (bpmn-js / @plantuml/core) and post a message back — checked via the
 *    same stabilization approach, which also tolerates that path since it
 *    just waits for `webview.html`/message traffic to go quiet.
 */
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import {
  captureWebviewPanels,
  captureNotifications,
  openFixture,
  closeAllEditors,
  ensureExtensionActivated,
} from '../helpers';

const SHELL_LENGTH_FLOOR = 800;

/** Waits for `panel.webview.html` to stop changing (no update for `quietMs`), then returns it. */
async function waitForStableHtml(panel: vscode.WebviewPanel, opts: { quietMs?: number; timeoutMs?: number } = {}): Promise<string> {
  const { quietMs = 700, timeoutMs = 20000 } = opts;
  let last = panel.webview.html;
  let lastChange = Date.now();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await new Promise((r) => setTimeout(r, 150));
    const current = panel.webview.html;
    if (current !== last) {
      last = current;
      lastChange = Date.now();
    }
    if (Date.now() - lastChange >= quietMs) return current;
    if (Date.now() > deadline) return current; // best effort — assertions below still catch an empty/short shell
  }
}

interface Surface {
  name: string;
  fixture: string;
  /** If true, the panel content is expected to be a raw <svg>. */
  expectSvg?: boolean;
  /** Config to set before opening (e.g. switching bpmnRenderer). */
  configure?: () => Promise<void> | Thenable<void> | void;
  /** Warnings are tolerated (not asserted absent) for this surface. */
  allowWarnings?: boolean;
}

const SURFACES: Surface[] = [
  { name: 'goals', fixture: 'goals/strategy-2026.goals.transitrix.yaml', expectSvg: true },
  { name: 'dgca', fixture: 'dgca/strategy-2026.dgca.transitrix.yaml', expectSvg: true },
  { name: 'dgca (constraint-driven)', fixture: 'dgca/constraint-driven.dgca.transitrix.yaml', expectSvg: true },
  { name: 'dga', fixture: 'dga/strategy-2026.dga.transitrix.yaml', expectSvg: true },
  { name: 'action', fixture: 'action/platform-launch.action.transitrix.yaml', expectSvg: true },
  {
    name: 'action-card',
    // Not the sibling-to-canon copy at action-card/eu-programme.…yaml — that
    // layout only works for the package-level unit tests, which load
    // canon/elements + canon/relations directly. This surface goes through
    // the real ActivityCardPreview -> findCanonRoot(doc.uri) ancestor walk,
    // which needs the view file nested inside canon/ (see the fixture's own
    // header comment and canon-loader.test.ts's findCanonRootPath cases).
    fixture: 'action-card/canon/views/eu-programme.action-card.transitrix.yaml',
    expectSvg: true,
  },
  { name: 'blocks', fixture: 'blocks/architecture.blocks.transitrix.yaml', expectSvg: true },
  // Catalogue/table notations: rendered as an HTML table via buildDiagramFrame
  // (see e.g. applications-preview.ts's buildApplicationsTable), never an
  // <svg> — unlike the spatial-layout diagram notations above.
  { name: 'applications', fixture: 'applications/portfolio-2026.applications.transitrix.yaml' },
  { name: 'products', fixture: 'products/portfolio-2026.products.transitrix.yaml' },
  { name: 'process-map', fixture: 'process-map/enterprise.process-map.transitrix.yaml' },
  { name: 'scenarios', fixture: 'scenarios/omnichannel-2028.scenarios.transitrix.yaml' },
  { name: 'capability-map', fixture: 'capability-map/business.capability-map.transitrix.yaml' },
  { name: 'process-blueprint', fixture: 'process-blueprint/order-fulfilment.process-blueprint.transitrix.yaml', expectSvg: true },
  { name: 'coverage-metric', fixture: 'coverage-metric/eu-coverage.coverage-metric.transitrix.yaml' },
  { name: 'compliance-impact', fixture: 'compliance-impact/gdpr-nis2.compliance-impact.view.yaml' },
  { name: 'single-law', fixture: 'codex/external/EU/LAW-GDPR-1.yaml' },
  { name: 'single-product', fixture: 'product/PRODUCT-ECOMM-1.yaml' },
  { name: 'requirement-trace', fixture: 'requirement/REQUIREMENT-AUDIT-LOG-RETENTION-1.yaml' },
  {
    name: 'bpmn (custom process renderer, default)',
    fixture: 'bpmn/simple-linear.bpmn.transitrix.yaml',
    expectSvg: true,
    configure: () => vscode.workspace.getConfiguration('transitrix').update('bpmnRenderer', 'custom', vscode.ConfigurationTarget.Global),
  },
  {
    name: 'bpmn (legacy bpmn-io renderer)',
    fixture: 'bpmn/simple-linear.bpmn.transitrix.yaml',
    configure: () => vscode.workspace.getConfiguration('transitrix').update('bpmnRenderer', 'bpmn-io', vscode.ConfigurationTarget.Global),
  },
  { name: 'plantuml', fixture: 'plantuml/sample.puml' },
  { name: 'ttrs (document)', fixture: 'documents/product.mrd.ttrs' },
  { name: 'ttrs (kind-mismatch — expected warning)', fixture: 'documents/kind-mismatch.mrd.ttrs', allowWarnings: true },
];

describe('preview surfaces render real content (transitrix-hq#143)', function () {
  this.timeout(60000);

  before(ensureExtensionActivated);

  afterEach(async () => {
    await closeAllEditors();
    // Reset the one config knob a couple of cases flip, so surfaces don't bleed into each other.
    await vscode.workspace.getConfiguration('transitrix').update('bpmnRenderer', undefined, vscode.ConfigurationTarget.Global);
  });

  for (const surface of SURFACES) {
    it(`renders: ${surface.name} (${surface.fixture})`, async () => {
      if (surface.configure) await surface.configure();

      const { result, panels } = await captureWebviewPanels(async () => {
        const { result: doc, errors, warnings } = await captureNotifications(async () => openFixture(surface.fixture));
        return { doc, errors, warnings };
      });

      assert.ok(panels.length >= 1, `expected at least one webview panel to open for ${surface.name}, got ${panels.length}`);
      const panel = panels[panels.length - 1];

      const html = await waitForStableHtml(panel);
      assert.ok(html.length > SHELL_LENGTH_FLOOR, `${surface.name}: webview HTML (${html.length} chars) looks like an empty/loading shell, not rendered content`);

      if (surface.expectSvg) {
        assert.match(html, /<svg[\s>]/i, `${surface.name}: expected an <svg> element in the rendered webview HTML`);
      }

      if (!surface.allowWarnings) {
        assert.deepStrictEqual(result.warnings, [], `${surface.name}: unexpected warning notification(s)`);
      }
      assert.deepStrictEqual(result.errors, [], `${surface.name}: unexpected error notification(s)`);
    });
  }

  it('renders: compliance matrix (repo-wide, command-triggered)', async () => {
    const { panels } = await captureWebviewPanels(async () => {
      await vscode.commands.executeCommand('transitrixStudio.previewComplianceMatrix');
    });
    assert.ok(panels.length >= 1, 'expected the compliance matrix panel to open');
    const html = await waitForStableHtml(panels[panels.length - 1]);
    assert.ok(html.length > SHELL_LENGTH_FLOOR, `compliance matrix: webview HTML (${html.length} chars) looks unrendered`);
  });

  it('renders: gap dashboard (repo-wide, command-triggered)', async () => {
    const { panels } = await captureWebviewPanels(async () => {
      await vscode.commands.executeCommand('transitrixStudio.previewGapDashboard');
    });
    assert.ok(panels.length >= 1, 'expected the gap dashboard panel to open');
    const html = await waitForStableHtml(panels[panels.length - 1]);
    assert.ok(html.length > SHELL_LENGTH_FLOOR, `gap dashboard: webview HTML (${html.length} chars) looks unrendered`);
  });
});
