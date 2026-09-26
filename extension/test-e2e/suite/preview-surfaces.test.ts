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
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  captureWebviewPanels,
  captureNotifications,
  openFixture,
  closeAllEditors,
  ensureExtensionActivated,
  withSaveDialogTarget,
  withRequirementChainScope,
  reportDom, withReportInput, type ReportDom,
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
    // The canonical fixture for unit tests is at action-card/views/ (root-level
    // views/ layout, transitrix-hq#331). For e2e testing, a parallel copy is
    // maintained inside canon/views/ to exercise the real ActivityCardPreview ->
    // findCanonRoot(doc.uri) ancestor walk, which needs the file inside the
    // canon/ tree to validate the walk works correctly (see fixture header and
    // canon-loader.test.ts "returns undefined when no ancestor is named canon/").
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

  it('renders: requirement–verification matrix (repo-wide, command-triggered)', async () => {
    const { panels } = await captureWebviewPanels(async () => {
      await vscode.commands.executeCommand('transitrixStudio.previewRequirementVerificationMatrix');
    });
    assert.ok(panels.length >= 1, 'expected the requirement–verification matrix panel to open');
    const html = await waitForStableHtml(panels[panels.length - 1]);
    assert.ok(html.length > SHELL_LENGTH_FLOOR, `requirement–verification matrix: webview HTML (${html.length} chars) looks unrendered`);
    assert.match(html, /REQUIREMENT-MATRIX-PASS-1/, 'passing requirement from the worked fixture');
    assert.match(html, /REQUIREMENT-MATRIX-NONE-1/, 'no-verification requirement from the worked fixture');
    assert.match(html, /REQ-VERIF-COVERAGE-001/, 'explicit no-result gap');
    assert.match(html, /REQ-VERIF-COVERAGE-002/, 'unresolved-verification gap');
    assert.match(html, /REQUIREMENT-MATRIX-BROKENPARENT-1/, 'broken parent remains visible');
    assert.match(html, /REQUIREMENT-MATRIX-DOES-NOT-EXIST-1/, 'dangling parent id shown as a finding');
    assert.match(html, /VERIFICATION-MATRIX-DANGLING-1/, 'dangling verifies remains visible as a finding');
    assert.match(html, /REQUIREMENT-MATRIX-MULTI-1/, 'requirement with multiple verifications');
    assert.match(html, /REQUIREMENT-MATRIX-CHILD-1/, 'child with resolvable parent');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-rvm-'));
    const a = path.join(dir, 'a.csv');
    const b = path.join(dir, 'b.csv');
    await withSaveDialogTarget(a, async () => {
      await vscode.commands.executeCommand('transitrixStudio.exportRequirementVerificationMatrixCsv');
    });
    await withSaveDialogTarget(b, async () => {
      await vscode.commands.executeCommand('transitrixStudio.exportRequirementVerificationMatrixCsv');
    });
    const bytesA = fs.readFileSync(a);
    const bytesB = fs.readFileSync(b);
    assert.deepStrictEqual(bytesA, bytesB, 'two exports from unchanged state must be byte-identical');
    const text = bytesA.toString('utf8');
    assert.match(text, /REQ-VERIF-COVERAGE-001/);
    assert.match(text, /REQ-VERIF-COVERAGE-002/);
    assert.match(text, /REQUIREMENT-MATRIX-PASS-1/);
    assert.doesNotMatch(text, /VERIFICATION-MATRIX-DANGLING-1/);
  });
});

describe('Release requirement report generation', function () {
  this.timeout(60000);
  it('both packaged report commands share provenance and refresh after a source save', async () => {
    await ensureExtensionActivated();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'requirement-reports-'));
    const write = (id: string, fields: Record<string, unknown>) => {
      const record = { id, notation: id.startsWith('REL-') ? 'relation' : id.split('-')[0].toLowerCase(), name: id, description: 'Example', zone: 'canon',
        admitted_at: '2026-01-01', admitted_by: 'example', gate_checks: { uniqueness: 'pass' },
        valid_from: '2026-01-01', valid_to: null, ...fields };
      const file = path.join(root, 'canon', `${id}.yaml`); fs.writeFileSync(file, JSON.stringify(record)); return file;
    };
    for (const zone of ['canon', 'codex', 'field']) fs.mkdirSync(path.join(root, zone));
    fs.writeFileSync(path.join(root, 'transitrix.yaml'), 'methodology_version: 3.1.0\n');
    write('PRODUCT-REPORT-1', {}); write('RELEASE-REPORT-1', { of: 'PRODUCT-REPORT-1' }); write('ACTION-REPORT-1', { type: 'Project' });
    const req = write('REQUIREMENT-REPORT-1', { level: 'system' });
    write('REL-REPORT-1', { type: 'product_scope', from: 'REQUIREMENT-REPORT-1', to: 'PRODUCT-REPORT-1' });
    write('REL-REPORT-2', { type: 'project_scope', from: 'REQUIREMENT-REPORT-1', to: 'ACTION-REPORT-1' });
    write('REL-REPORT-3', { type: 'project_product', from: 'ACTION-REPORT-1', to: 'PRODUCT-REPORT-1' });
    write('REL-REPORT-4', { type: 'required_for', from: 'REQUIREMENT-REPORT-1', to: 'RELEASE-REPORT-1' });
    const panels: vscode.WebviewPanel[] = [];
    try {
      const capture = await withRequirementChainScope(root, 'PRODUCT-REPORT-1', 'RELEASE-REPORT-1', 'ACTION-REPORT-1', '2026-09-24', () => captureWebviewPanels(async () => {
        await vscode.commands.executeCommand('transitrixStudio.previewRequirementChain');
        await vscode.commands.executeCommand('transitrixStudio.previewRequirementsByRelease');
      }));
      panels.push(...capture.panels);
      assert.strictEqual(panels.length, 2);
      const initial = panels.map(p => p.webview.html);
      const digest = (html: string) => html.match(/sha256:[a-f0-9]{64}/)?.[0];
      assert.ok(digest(initial[0])); assert.strictEqual(digest(initial[0]), digest(initial[1]));
      for (const html of initial) {
        assert.ok(html.includes('Selected requirements: 1')); assert.ok(html.includes('2026-09-24'));
        assert.ok(html.includes('REQUIREMENT-REPORT-1'));
      }
      assert.ok(initial[0].includes('Adjacent pair')); assert.ok(initial[1].includes('No valid verification definition'));
      const doc = await vscode.workspace.openTextDocument(req);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), doc.getText().replace('"level":"system"', '"level":"software"'));
      await vscode.workspace.applyEdit(edit); await doc.save();
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && digest(panels[0].webview.html) === digest(initial[0])) await new Promise(r => setTimeout(r, 100));
      const refreshed = panels.map(p => p.webview.html);
      assert.notStrictEqual(digest(refreshed[0]), digest(initial[0])); assert.strictEqual(digest(refreshed[0]), digest(refreshed[1]));
      assert.match(refreshed[1], /data-count="stage-5"[^]*?data-action="count" data-value="stage-5"[^>]*>1<\/button>/);
      assert.match(refreshed[1], /data-count="stage-4"[^]*?data-action="count" data-value="stage-4"[^>]*>0<\/button>/);
    } finally {
      panels.forEach(p => p.dispose()); await closeAllEditors(); fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// Shared worked-example records, matching the projection conformance suite.
const R = (n: number) => `REQUIREMENT-CHAIN-${n}`;
const V = (n: number) => `VERIFICATION-CHAIN-${n}`;
const A = (n: number) => `RELEASE-ALPHA-${n}`;
const B = (n: number) => `RELEASE-BETA-${n}`;
const PA = 'PRODUCT-ALPHA-1', PB = 'PRODUCT-BETA-1', JA = 'ACTION-ALPHA-1', JB = 'ACTION-BETA-1';
const N = (n: number) => `NEED-CHAIN-${n}`;
const DI = 'DRIVER-INTERNAL-1', DE = 'DRIVER-EXTERNAL-1', M = 'OBSERVATION-MARKET-1';
type Raw = Record<string, unknown>;
function chainExample(): Raw[] {
  const docs: Raw[] = [];
  const put = (id: string, fields: Raw = {}) => {
    const d = { id, notation: id.split('-')[0].toLowerCase(), name: id, description: 'Example', zone: 'canon',
      admitted_at: '2026-01-01', admitted_by: 'example', gate_checks: { uniqueness: 'pass' },
      valid_from: '2026-01-01', valid_to: null, ...fields }; docs.push(d); return d;
  };
  let serial = 0;
  const rel = (type: string, from: string, to: string, fields: Raw = {}) => put(`REL-CHAIN-${++serial}`, { notation: 'relation', type, from, to, ...fields });
  put(PA); put(PB); put(JA, { type: 'Project' }); put(JB, { type: 'Project' });
  rel('project_product', JA, PA); rel('project_product', JB, PA); rel('project_product', JB, PB);
  put(A(1), { of: PA }); put(A(2), { of: PA, predecessor: A(1) }); put(A(3), { of: PA });
  put(B(1), { of: PB }); put(B(2), { of: PB, predecessor: B(1) });
  put(M, { notation: 'observation', zone: 'field', source_document: { title: 'Market Research', uri: 'https://example.org/research/market', revision: 'research-revision-1' } });
  put(DI, { type: 'internal' }); put(DE, { type: 'external' }); put('STAKEHOLDER-CHAIN-1'); put('STAKEHOLDER-CHAIN-2');
  put(N(1),{stakeholder:'STAKEHOLDER-CHAIN-1'}); put(N(2),{stakeholder:'STAKEHOLDER-CHAIN-2'});
  rel('source_trace', DI, M); rel('source_trace', DE, M); rel('source_trace', N(1), DI); rel('source_trace', N(1), M); rel('source_trace', N(2), DE);
  const levels = ['stakeholder','system','software','system','system','stakeholder','software',undefined,'system','software','system','stakeholder','system','system','system','system','software','system'];
  for (const n of [...Array.from({ length: 18 }, (_, i) => i + 1), 20]) {
    const lifecycle: Raw = n === 16 ? { valid_to: '2026-08-31' } : n === 17 ? { valid_from: '2026-10-01' } : {};
    put(R(n), { level: n === 20 ? 'software' : levels[n - 1], ...lifecycle });
    rel('product_scope', R(n), n === 12 ? PB : PA, lifecycle);
    rel('project_scope', R(n), n === 12 || n === 13 ? JB : JA, lifecycle);
    if (n !== 9) rel('required_for', R(n), n === 1 ? A(1) : n === 10 ? A(3) : n === 11 ? 'RELEASE-MISSING-1' : n === 12 ? B(1) : A(2), lifecycle);
  }
  const get = (id: string) => docs.find(d => d.id === id)!;
  for (const n of [1,7,9,10,11,13,16,17,18,20]) get(R(n)).serves = N(1);
  get(R(4)).serves = N(2); get(R(12)).serves = N(2);
  for (const [child, parent] of [[2,1],[3,2],[14,15],[15,14]]) get(R(child)).parent = R(parent);
  get(R(7)).parent = 'REQUIREMENT-MISSING-1'; rel('requirement_parent', R(3), R(4));
  rel('source_trace', R(6), DI); rel('required_for', R(18), A(1)); rel('depends_on', R(2), R(5));
  const verification = (n: number, req: number, release: string | undefined, outcome: string, extra: Raw = {}) => put(V(n), {
    verifies: R(req), verified_on: release, method: 'test', protocol: 'Test protocol', outcome,
    performed_at: '2026-09-20', result: 'Recorded result', evidence: [{ kind: 'note', text: 'Recorded evidence' }], ...extra,
  });
  verification(2,2,A(2),'not_yet_run',{ performed_at: undefined, result: undefined, evidence: undefined });
  verification(31,3,A(2),'pass'); verification(32,3,A(2),'fail',{ performed_at: '2026-09-21' });
  verification(4,4,A(2),'inconclusive'); verification(51,5,A(1),'pass'); verification(52,5,undefined,'pass');
  verification(6,6,A(2),'pass',{ evidence: undefined }); verification(7,7,A(2),'not_yet_run',{ protocol: null, performed_at: undefined, result: undefined, evidence: undefined });
  verification(12,12,B(2),'pass'); verification(181,18,A(2),'fail',{ performed_at: '2026-09-01', valid_to: '2026-09-23' }); verification(182,18,A(2),'pass');
  verification(20,20,A(2),'pass',{ evidence: [{ kind: 'canonical_ref', ref: 'REQUIREMENT-MISSING-2' }] });
  verification(99,99,A(2),'fail',{ verifies: 'REQUIREMENT-MISSING-3' });
  return docs;
}

// These assertions run against the unpacked VSIX in an actual VS Code webview.
// The probe adds only observation/click transport; dialogs are deterministic.
describe('Packaged requirement reports: shared example and live controls', function () {
  this.timeout(180000);
  let root: string, matrix: vscode.WebviewPanel, release: vscode.WebviewPanel;
  let panels: vscode.WebviewPanel[] = [];
  const sorted = (a: string[]) => [...a].sort();
  const ids = (...ns: number[]) => sorted(ns.map(R));
  const metrics: Record<string, string[]> = {
    broken: ids(7,14,15,20), noSource: ids(5,8,14,15), noDefinition: ids(1,7,8,14,15),
    noResult: ids(2,5,20), failed: ids(3), unassigned: ids(9),
  };
  const file = (id: string) => path.join(root, id === M ? 'field' : 'canon', `${id}.yaml`);
  const digest = (d: ReportDom) => d.text.match(/sha256:[a-f0-9]{64}/)?.[0];
  async function observe(panel: vscode.WebviewPanel, predicate: (d: ReportDom) => boolean): Promise<ReportDom> {
    const deadline = Date.now() + 20000;
    let d: ReportDom;
    do {
      d = await reportDom(panel);
      if (predicate(d)) return d;
      await new Promise(r => setTimeout(r, 100));
    } while (Date.now() < deadline);
    throw new Error(`Report did not reach expected state: ${d.text.slice(0, 1200)}`);
  }
  async function click(panel: vscode.WebviewPanel, action: string, value?: string) {
    const before = await reportDom(panel);
    await reportDom(panel, 'click', `button[data-action="${action}"]${value === undefined ? '' : `[data-value="${value}"]`}`);
    if (action !== 'open') await observe(panel, d => d.render !== before.render);
  }
  async function scope(product = PA, rel = A(2), project = JA) {
    await withRequirementChainScope(root, product, rel, project, '2026-09-24', async () => {
      await click(matrix, 'scope');
      await observe(matrix, d => d.text.includes(`Product: ${product || 'unselected'}`) && d.text.includes(`Release: ${rel || 'unselected'}`) && d.text.includes(`Project: ${project || 'unselected'}`));
    });
  }
  async function focus(id: string, direction: string, expected: string[]) {
    await withReportInput(id, async () => {
      await click(matrix, 'focus');
      await observe(matrix, d => d.text.includes(`Focus: ${id}`));
    });
    await click(matrix, 'direction', direction);
    const d = await observe(matrix, d => d.text.includes(`Focus: ${id} · ${direction}`));
    assert.deepStrictEqual(sorted(d.nodes), sorted(expected));
  }
  async function list(key: string, expected: string[]) {
    await click(release, 'count', key);
    const d = await observe(release, d => JSON.stringify(sorted(d.contributors)) === JSON.stringify(sorted(expected)));
    assert.strictEqual(d.counts[key], String(expected.length));
    assert.strictEqual(new Set(d.contributors).size, d.contributors.length);
    return d;
  }
  async function mutate(id: string, fields: Raw) {
    const doc = await vscode.workspace.openTextDocument(file(id));
    const raw = { ...JSON.parse(doc.getText()), ...fields };
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), JSON.stringify(raw));
    const prior = digest(await reportDom(matrix));
    assert.ok(await vscode.workspace.applyEdit(edit)); assert.ok(await doc.save());
    await synchronized(prior);
  }
  async function synchronized(prior?: string) {
    const m = await observe(matrix, d => !!digest(d) && digest(d) !== prior);
    const r = await observe(release, d => digest(d) === digest(m));
    assert.ok(m.text.includes('2026-09-24')); assert.ok(r.text.includes('2026-09-24'));
  }
  before(async () => {
    await ensureExtensionActivated();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'requirement-example-'));
    for (const zone of ['canon', 'codex', 'field']) fs.mkdirSync(path.join(root, zone));
    fs.writeFileSync(path.join(root, 'transitrix.yaml'), 'methodology_version: 3.1.0\n');
    for (const d of chainExample()) fs.writeFileSync(file(String(d.id)), JSON.stringify(d));
    const captured = await captureWebviewPanels(async () => {
      await vscode.commands.executeCommand('transitrixStudio.previewRequirementChain');
      await vscode.commands.executeCommand('transitrixStudio.previewRequirementsByRelease');
    }, { reportDom: true });
    panels = captured.panels;
    matrix = panels.find(p => p.viewType === 'requirementChain-matrix')!;
    release = panels.find(p => p.viewType === 'requirementChain-release')!;
    assert.ok(matrix); assert.ok(release);
    await scope(); await synchronized();
    console.log(`Packaged reports: VS Code ${vscode.version}; extension ${vscode.extensions.getExtension('transitrix.transitrix-studio')?.packageJSON.version ?? 'see activated package manifest'}`);
  });
  after(async () => {
    panels.forEach(p => p.dispose()); await closeAllEditors();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });
  afterEach(async () => {
    await click(matrix, 'reset');
    await observe(matrix, d => d.text.includes('Focus: selected population'));
  });

  it('shows explicit context, all evidence distinctions and exact directional sets without sibling expansion', async () => {
    const initial = await reportDom(matrix);
    assert.strictEqual(initial.nodes.length, 37);
    assert.ok(initial.text.includes('Selected requirements: 12 · Product requirements: 16'));
    for (const text of [PA, A(2), JA, 'Evidence: absent', 'other release', 'unqualified', 'invalid definition', 'malformed or future execution', 'Not yet run', 'Inconclusive', 'Pass', 'Fail']) assert.ok(initial.text.includes(text), text);
    assert.ok(!initial.nodes.includes(V(2) + '.result'));
    const down = [R(2),R(3),V(2)+'.definition',V(31)+'.definition',V(31)+'.result',V(32)+'.definition',V(32)+'.result'];
    const up = [R(2),R(1),N(1),DI,M];
    await focus(R(2),'downstream',down); await focus(R(2),'upstream',up);
    await focus(R(2),'both',[...new Set([...up,...down])]);
    await focus(V(32)+'.result','upstream',[V(32)+'.result',V(32)+'.definition',R(3),R(2),R(4),R(1),N(1),N(2),DI,DE,M]);
    await focus(R(14),'both',[R(14),R(15)]);
    await click(matrix,'open',R(14));
    await new Promise(r => setTimeout(r, 200));
    assert.ok(vscode.window.visibleTextEditors.some(e => e.document.uri.fsPath === file(R(14))), 'source navigation opens the actual record');
  });

  it('moves exactly one column, retains empty stages, focus, boundaries and horizontal viewport', async () => {
    await focus(R(6),'downstream',[R(6),V(6)+'.definition',V(6)+'.result']);
    await click(matrix,'pair');
    for (let i = 0; i < 8; i++) {
      const d = await observe(matrix, d => d.text.includes(`Pair ${i+1} of 8`));
      assert.deepStrictEqual(d.stages,[i,i+1]);
      assert.ok(d.text.includes(`Focus: ${R(6)} · downstream`));
      if (i === 0) assert.ok(d.disabled.includes('left'));
      if (i === 4) { assert.deepStrictEqual(d.nodes,[]); assert.ok(d.text.includes('Empty stage')); }
      if (i < 7) await click(matrix,'right'); else assert.ok(d.disabled.includes('right'));
    }
    for (let i = 7; i > 0; i--) { await click(matrix,'left'); await observe(matrix,d=>d.text.includes(`Pair ${i} of 8`)); }
    await click(matrix,'pair'); await observe(matrix,d=>d.stages.length===9);
    await reportDom(matrix,'scroll',undefined,300);
    await observe(matrix,d=>d.scroll>0);
    await click(matrix,'refresh');
    await observe(matrix,d=>d.scroll>0 && d.text.includes(`Focus: ${R(6)} · downstream`));
  });

  it('reconciles all six clickable metrics, stages, assignment classes and matrix drill-downs', async () => {
    for (const [key, expected] of Object.entries(metrics)) {
      await list('metric-'+key,expected);
      for (const id of expected) {
        await click(release,'drill',id);
        const d = await observe(matrix,d=>d.text.includes(`Focus: ${id} · both`));
        assert.ok(d.nodes.includes(id)); assert.strictEqual(d.stages.length,9);
        assert.ok(d.text.includes('Selected requirements: 12'));
      }
    }
    for (const [key, expected] of Object.entries({
      'stage-3':ids(1,6),'stage-4':ids(2,4,5,14,15,18),'stage-5':ids(3,7,20),'stage-6':ids(8),
      'unassigned-3':[], 'unassigned-4':ids(9), 'unassigned-5':[], 'unassigned-6':[], other:ids(10), invalid:ids(11),
      'selected-references':[R(7)+'.parent',R(14)+'.parent',R(15)+'.parent',V(20)+'.evidence[0].ref'],
    })) await list(key,expected);
    // R3 remains failed despite its pass; R4 inconclusive is executed; R6's
    // optional skipped stages/absent evidence add no false defect. R1 never
    // inherits its child's verification. The exact lists above are controls.
    await scope(PA,A(2),'');
    await list('metric-noDefinition',ids(1,7,8,13,14,15));
    await click(release,'drill',R(13));
    const d = await observe(matrix,d=>d.text.includes(`Focus: ${R(13)} · both`));
    assert.ok(d.text.includes('Project: unselected')); assert.ok(d.text.includes('Selected requirements: 13'));
    await scope(PB,B(2),JB);
    for (const key of Object.keys(metrics)) await list('metric-'+key,[]);
    await scope(PB,B(2),JA);
    assert.ok((await reportDom(matrix)).text.includes('Unknown'));
    await scope(PA,B(2),JA);
    assert.ok((await reportDom(matrix)).text.includes('Unknown'));
    await scope('','','');
    assert.ok((await reportDom(matrix)).text.includes('Unknown'));
    await scope();
  });

  it('refreshes edited, created and deleted source records in both views without stale contributor lists', async () => {
    await list('metric-noSource',metrics.noSource);
    await mutate(R(8),{serves:N(1)});
    await list('metric-noSource',ids(5,14,15));
    await mutate(R(8),{serves:undefined});
    await list('metric-noSource',metrics.noSource);
    // Malformed evidence cannot masquerade as absent optional evidence.
    await mutate(V(6),{evidence:'malformed'});
    await list('metric-noResult',ids(2,5,6,20));
    await focus(R(6),'downstream',[R(6),V(6)+'.definition',V(6)+'.result']);
    assert.ok((await reportDom(matrix)).text.includes('Evidence: malformed'));
    await mutate(V(6),{evidence:undefined}); await list('metric-noResult',metrics.noResult);
    const relation = { ...chainExample().find(d=>d.type==='source_trace')!, id:'REL-EXTRA-1', from:R(5), to:M };
    const prior = digest(await reportDom(matrix));
    const edit = new vscode.WorkspaceEdit(); const uri = vscode.Uri.file(file('REL-EXTRA-1'));
    edit.createFile(uri); edit.insert(uri,new vscode.Position(0,0),JSON.stringify(relation));
    assert.ok(await vscode.workspace.applyEdit(edit));
    await (await vscode.workspace.openTextDocument(uri)).save(); await synchronized(prior);
    await list('metric-noSource',ids(8,14,15));
    const previous = digest(await reportDom(matrix));
    const remove = new vscode.WorkspaceEdit(); remove.deleteFile(uri);
    assert.ok(await vscode.workspace.applyEdit(remove)); await synchronized(previous);
    await list('metric-noSource',metrics.noSource);
  });
  it('paginates a larger explicit catalogue without dropping or duplicating requirement IDs', async () => {
    const docs = chainExample(), added: string[] = [];
    try {
      for (let n = 100; n < 145; n++) {
        const id = R(n);
        const records = [
          { ...docs.find(d=>d.id===R(2))!, id },
          ...docs.filter(d=>d.from===R(2) && ['product_scope','project_scope','required_for'].includes(String(d.type)))
            .map((d,i)=>({...d,id:`REL-SCALE-${n}-${i+1}`,from:id})),
        ];
        for (const record of records) { const target=file(String(record.id)); fs.writeFileSync(target,JSON.stringify(record)); added.push(target); }
      }
      await click(matrix,'refresh');
      await observe(matrix,d=>d.text.includes('Selected requirements: 57'));
      const expected=ids(2,4,5,14,15,18,...Array.from({length:45},(_,i)=>i+100));
      await click(release,'count','stage-4');
      const first=await observe(release,d=>d.counts['stage-4']==='51' && d.contributors.length===40);
      await click(release,'page','contributors:1');
      const last=await observe(release,d=>d.contributors.length===11);
      assert.deepStrictEqual(sorted([...first.contributors,...last.contributors]),expected);
      const firstMatrix=await reportDom(matrix);
      const visible=firstMatrix.nodes.filter(id=>expected.includes(id));
      assert.strictEqual(visible.length,40);
      await click(matrix,'page','stage-4:1');
      const lastMatrix=await observe(matrix,d=>d.nodes.filter(id=>expected.includes(id)).length===11);
      assert.deepStrictEqual(sorted([...visible,...lastMatrix.nodes.filter(id=>expected.includes(id))]),expected);
      await click(matrix,'pair'); await observe(matrix,d=>d.stages.length===2);
      await click(matrix,'pair');
      assert.strictEqual((await observe(matrix,d=>d.stages.length===9)).nodes.filter(id=>expected.includes(id)).length,11);
    } finally {
      for (const target of added) fs.rmSync(target,{force:true});
      await click(matrix,'refresh'); await observe(matrix,d=>d.text.includes('Selected requirements: 12'));
    }
  });

});
