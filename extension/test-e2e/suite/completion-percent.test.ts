import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { captureWebviewPanels, closeAllEditors, ensureExtensionActivated, waitFor } from '../helpers';

/** One on-disk model exercises the normal resolver in the packaged extension. */
describe('completion percent from the model sidecar', function () {
  this.timeout(60000);
  let root: string;
  const actions = [
    { id: 'ACTION-FRESH-1', name: 'Fresh action', link: 'https://example.com/tasks/1' },
    { id: 'ACTION-STALE-1', name: 'Stale action', link: 'https://example.com/tasks/2' },
    { id: 'ACTION-MISSING-1', name: 'Missing row', link: 'https://example.com/tasks/3' },
    { id: 'ACTION-UNLINKED-1', name: 'Unlinked action' },
  ].map(a => ({ ...a, duration: 2, goals: ['GOAL-TEST-1'] }));
  const sidecar = () => path.join(root, 'analytics', 'action-progress.ndjson');
  const writeRows = (rows: unknown[]) => fs.writeFileSync(sidecar(), rows.map(r => JSON.stringify(r)).join('\n'));

  before(async () => {
    await ensureExtensionActivated();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'transitrix-completion-'));
    for (const dir of ['canon/elements', 'canon/relations', 'views', 'analytics']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, 'transitrix.yaml'), 'transitrix: 1\n');
    for (const action of actions) fs.writeFileSync(path.join(root, 'canon/elements', `${action.id}.yaml`), JSON.stringify({ notation: 'action', ...action }));
    fs.writeFileSync(path.join(root, 'canon/elements/GOAL-TEST-1.yaml'), JSON.stringify({ notation: 'goal', id: 'GOAL-TEST-1', name: 'Test goal', factors: ['DRIVER-TEST-1'] }));
    fs.writeFileSync(path.join(root, 'canon/elements/DRIVER-TEST-1.yaml'), JSON.stringify({ notation: 'driver', id: 'DRIVER-TEST-1', name: 'Test driver', type: 'external' }));
    const schedule = { start_date: '2026-01-01' };
    const docs = {
      action: { notation: 'action', id: 'ACTION-VIEW-1', name: 'Completion schedule', view_config: { schedule } },
      dgca: { notation: 'dgca', id: 'DGCA-TEST-1', name: 'Completion chain', view_config: {} },
      dga: { notation: 'dga', id: 'DGA-TEST-1', name: 'Completion chain', factors: [{ id: 'DRIVER-TEST-1', name: 'Test driver', type: 'external' }], goals: [{ id: 'GOAL-TEST-1', name: 'Test goal', factors: ['DRIVER-TEST-1'] }], actions },
      inline: { notation: 'action', id: 'ACTION-VIEW-2', name: 'Inline schedule', project: schedule, actions },
    };
    for (const [key, doc] of Object.entries(docs)) fs.writeFileSync(path.join(root, 'views', `${key}.${doc.notation}.transitrix.yaml`), JSON.stringify(doc));
  });

  afterEach(async () => {
    await closeAllEditors();
    for (const notation of ['action', 'dgca', 'dga']) await vscode.workspace.getConfiguration('transitrix').update(`showCompletionPercent.${notation}`, undefined, vscode.ConfigurationTarget.Global);
  });
  after(() => fs.rmSync(root, { recursive: true, force: true }));

  for (const key of ['action', 'dgca', 'dga', 'inline']) {
    it(`${key}: fresh, stale, absent, invalid and disabled states`, async () => {
      const notation = key === 'inline' ? 'action' : key;
      const config = vscode.workspace.getConfiguration('transitrix');
      const setEnabled = (value: boolean) => config.update(`showCompletionPercent.${notation}`, value, vscode.ConfigurationTarget.Global);
      await setEnabled(true);
      writeRows([
        { id: 'ACTION-FRESH-1', percent: 63, computed_at: new Date().toISOString() },
        { id: 'ACTION-STALE-1', percent: 27, computed_at: '2000-01-01T00:00:00Z' },
        { id: 'ACTION-UNKNOWN-1', percent: 91, computed_at: new Date().toISOString() },
      ]);
      const { panels } = await captureWebviewPanels(async () => {
        const doc = await vscode.workspace.openTextDocument(path.join(root, 'views', `${key}.${notation}.transitrix.yaml`));
        await vscode.window.showTextDocument(doc);
      });
      assert.strictEqual(panels.length, 1);
      const panel = panels[0];
      await waitFor(() => panel.webview.html.includes('>63%</text>'), { label: `${key} fresh sidecar percentage` });
      const html = panel.webview.html;
      assert.match(html, /completion-percent[^>]*opacity="0.5"[^>]*>27%<\/text>/);
      assert.ok(!html.includes('>91%<'));
      assert.match(html, /data-tx-control="completionPercent" checked/);
      // One linked missing row, no placeholder for the unlinked action.
      assert.strictEqual((html.match(/>–%<\/text>/g) ?? []).length, notation === 'action' ? 2 : 1);
      if (notation === 'action') {
        for (const view of ['network', 'gantt', 'tree']) {
          const section = html.split(`<section class="diagram-section" data-view="${view}">`)[1]?.split('</section>')[0];
          assert.ok(section?.includes('>63%<'), `${view} shows completion`);
        }
      }
      await setEnabled(false);
      await waitFor(() => !panel.webview.html.includes('>63%<'), { label: 'live disable' });
      assert.ok(!panel.webview.html.includes('>–%<'));
      assert.ok(!panel.webview.html.includes('>27%<'));
      await setEnabled(true);
      await waitFor(() => panel.webview.html.includes('>63%<'), { label: 'live enable' });
      writeRows([
        { id: 'ACTION-FRESH-1', percent: 20, computed_at: new Date().toISOString() },
        { id: 'ACTION-FRESH-1', percent: 80, computed_at: new Date().toISOString() },
        { id: 'ACTION-STALE-1', percent: 101, computed_at: new Date().toISOString() },
        { id: 'ACTION-MISSING-1', percent: 50, computed_at: 'invalid' },
        null,
      ]);
      fs.appendFileSync(sidecar(), '\nnot json\n');
      await setEnabled(false);
      await waitFor(() => !panel.webview.html.includes('>63%<'));
      await setEnabled(true);
      await waitFor(() => panel.webview.html.includes('>–%<'), { label: 'invalid rows become missing data' });
      assert.doesNotMatch(panel.webview.html, /class="[^"]*completion-percent"[^>]*>\d+%</);
      assert.strictEqual((panel.webview.html.match(/>–%<\/text>/g) ?? []).length, notation === 'action' ? 6 : 3);
      fs.unlinkSync(sidecar());
      await setEnabled(false);
      await waitFor(() => !panel.webview.html.includes('>–%<'));
      await setEnabled(true);
      await waitFor(() => panel.webview.html.includes('>–%<'), { label: 'missing sidecar' });
      assert.doesNotMatch(panel.webview.html, /class="[^"]*completion-percent"[^>]*>\d+%</);
      assert.match(panel.webview.html, /<svg[\s>]/);
    });
  }
});
