import * as vscode from 'vscode';
import * as path from 'node:path';
import { buildComplianceIndex, RequirementChainSnapshot, selectRequirementChain, CHAIN_STAGES, chainDate,
  type ChainScope, type ChainSet } from '@transitrix/diagrams/compliance';
import { scanRequirementChainCatalogue } from './compliance-scan.js';
import { escXml } from './compliance-render.js';

/** Both panels and their exports are rendered from this single immutable snapshot. */
export class RequirementChainPreview implements vscode.Disposable {
  private readonly snapshot = new RequirementChainSnapshot();
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private scope?: ChainScope;
  private asAt = new Date().toISOString().slice(0, 10);
  private focus?: string;
  private direction: 'both' | 'upstream' | 'downstream' = 'both';
  private pair: number | undefined;
  private reason = '';
  private subscriptions: vscode.Disposable[];
  private watcher?: vscode.FileSystemWatcher;
  constructor() {
    const refresh = () => { if (this.panels.size) void this.refresh(); };
    this.subscriptions = [vscode.workspace.onDidSaveTextDocument(refresh),
      vscode.workspace.onDidCreateFiles(refresh), vscode.workspace.onDidDeleteFiles(refresh),
      vscode.workspace.onDidRenameFiles(refresh)];
  }
  dispose() { this.watcher?.dispose(); this.subscriptions.forEach(s => s.dispose()); this.panels.forEach(p => p.dispose()); }
  async show(kind: 'matrix' | 'release'): Promise<void> {
    if (!this.scope && !await this.selectScope()) return;
    if (!this.panels.has(kind)) {
      const p = vscode.window.createWebviewPanel(`requirementChain-${kind}`,
        kind === 'matrix' ? 'Traceability Matrix' : 'Requirements by Release', vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true });
      this.panels.set(kind, p);
      p.onDidDispose(() => this.panels.delete(kind));
      p.webview.onDidReceiveMessage(async (m: { action?: string; value?: string }) => {
        if (m.action === 'scope') { if (await this.selectScope()) await this.refresh(); }
        else if (m.action === 'refresh') await this.refresh();
        else if (m.action === 'export') await this.export();
        else if (m.action === 'focus') {
          const value = await vscode.window.showInputBox({ prompt: 'Exact node ID or name (empty clears focus)', value: this.focus });
          if (value !== undefined) {
            const matches = this.snapshot.current?.nodes.filter(n => n.id === value || n.name === value) ?? [];
            if (!value) this.focus = undefined;
            else if (matches.length === 1) this.focus = matches[0].id;
            else { void vscode.window.showWarningMessage('Choose an exact, unambiguous node ID or name.'); return; }
            this.render();
          }
        } else if (m.action === 'direction' && ['both', 'upstream', 'downstream'].includes(m.value ?? '')) {
          this.direction = m.value as typeof this.direction; this.render();
        } else if (m.action === 'pair') { this.pair = this.pair === undefined ? 0 : undefined; this.render(); }
        else if (m.action === 'left' || m.action === 'right') {
          this.pair = Math.max(0, Math.min(CHAIN_STAGES.length - 2, (this.pair ?? 0) + (m.action === 'left' ? -1 : 1))); this.render();
        } else if (m.action === 'reset') { this.focus = undefined; this.reason = ''; this.direction = 'both'; this.pair = undefined; this.render(); }
        else if (m.action === 'drill' && this.snapshot.current?.nodes.some(n => n.id === m.value)) {
          this.focus = m.value; this.reason = 'Metric contributor'; await this.show('matrix');
        } else if (m.action === 'open') {
          const node = this.snapshot.current?.nodes.find(n => n.id === m.value);
          if (node?.sourcePath) await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(node.sourcePath));
        }
      });
    }
    this.panels.get(kind)!.reveal();
    if (!this.snapshot.current) await this.refresh(); else this.render();
  }
  private async selectScope(): Promise<boolean> {
    const folders = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false,
      canSelectMany: false, title: 'Select the catalogue containing transitrix.yaml' });
    if (!folders?.length) return false;
    const root = folders[0].fsPath;
    let scan;
    try { scan = await scanRequirementChainCatalogue(root); }
    catch { void vscode.window.showErrorMessage('Cannot read transitrix.yaml in this catalogue.'); return false; }
    const pick = async (type: string, prompt: string, optional = false) => {
      const options = scan.canon.records.filter(r => r.type === type && (type !== 'ACTION' || r.raw.type === 'Project'))
        .map(r => ({ label: String(r.raw.name ?? r.id), description: r.id, id: r.id }));
      if (optional) options.unshift({ label: 'Project: unselected', description: '', id: '' });
      return (await vscode.window.showQuickPick(options, { title: prompt }))?.id;
    };
    const product = await pick('PRODUCT', 'Product'); if (!product) return false;
    const release = await pick('RELEASE', 'Release'); if (!release) return false;
    const project = await pick('ACTION', 'Project (optional)', true); if (project === undefined) return false;
    const asAt = await vscode.window.showInputBox({ title: 'As-at date', value: this.asAt,
      validateInput: v => chainDate(v) ? undefined : 'Use a valid YYYY-MM-DD date' });
    if (!asAt) return false;
    this.watcher?.dispose();
    this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*.{yaml,yml}'));
    const refresh = () => { if (this.panels.size) void this.refresh(); };
    this.watcher.onDidChange(refresh); this.watcher.onDidCreate(refresh); this.watcher.onDidDelete(refresh);
    this.scope = { catalogue: root, product, release, project: project || undefined }; this.asAt = asAt;
    return true;
  }
  async refresh(): Promise<void> {
    if (!this.scope) return;
    const scope = { ...this.scope }, asAt = this.asAt;
    await this.snapshot.refresh(async () => {
      const { canon, snapshotId, sourceRevision } = await scanRequirementChainCatalogue(scope.catalogue);
      return { index: buildComplianceIndex(canon), scope, asAt, snapshotId, sourceRevision, complete: !canon.findings.length };
    });
    this.render();
  }
  private async export(): Promise<void> {
    if (!this.snapshot.current) return;
    const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file('requirement-chain.json'), filters: { JSON: ['json'] } });
    if (uri) await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify({ stale: this.snapshot.stale, projection: this.snapshot.current }, null, 2)));
  }
  private render(): void {
    const p = this.snapshot.current;
    const button = (action: string, label: string, value = '', disabled = false) =>
      `<button data-action="${action}" data-value="${escXml(value)}" ${disabled ? 'disabled' : ''}>${escXml(label)}</button>`;
    const count = (s: ChainSet) => s.total === null ? `Unknown (${s.ids.length} known; incomplete)` : String(s.total);
    for (const [kind, panel] of this.panels) {
      if (!p) { panel.webview.html = '<p>Catalogue unavailable. Use the command again to retry.</p>'; continue; }
      const view = selectRequirementChain(p, this.focus, this.direction);
      const visible = view.nodes.filter(n => this.pair === undefined || n.stage === this.pair || n.stage === this.pair + 1);
      const labels: Record<string, string> = { broken: 'Broken references', noSource: 'No accepted source path', noDefinition: 'No valid verification definition', noResult: 'Verification without applicable executed result', failed: 'Applicable failed verification', unassigned: 'No effective assignment (whole product)' };
      const metrics = Object.entries(p.metrics).map(([name, s]) => `<tr><th>${escXml(labels[name])}</th><td>${count(s)}</td><td>${s.ids.map(id => button('drill', id, id)).join(' ')}</td></tr>`).join('');
      const columns = CHAIN_STAGES.map((stage, i) => this.pair !== undefined && i !== this.pair && i !== this.pair + 1 ? '' :
        `<section><h2>${stage}</h2>${visible.filter(n => n.stage === i).map(n => `<article><b>${escXml(n.name)}</b><p>${escXml(n.id)}</p><p>${escXml(n.context.join(', '))}</p>${button('open', 'Open record', n.id)}<details><summary>Record</summary><pre>${escXml(JSON.stringify(n.raw, null, 2))}</pre></details></article>`).join('') || '<p>Empty stage</p>'}</section>`).join('');
      const edges = view.edges.map(e => `<li>${escXml(e.from)} → ${escXml(e.to)} (${escXml(e.kind)}) ${!e.valid ? '— invalid reference' : ''}
        ${this.pair !== undefined && (!visible.some(n => n.id === e.from) || !visible.some(n => n.id === e.to)) ? '— continues across hidden stages' : ''}
        <small>${escXml(e.identities.join(', '))}</small></li>`).join('');
      const names = (id?: string) => id ? `${p.nodes.find(n => n.id === id)?.name ?? id} (${id})` : 'unselected';
      const body = kind === 'release' ? `<table><tbody>${metrics}</tbody></table><h2>Requirement stages</h2><ul>${p.stages.slice(3, 7).map((s, i) => `<li>${CHAIN_STAGES[i + 3]}: ${count(s)} — ${escXml(s.ids.join(', '))}</li>`).join('')}</ul>` :
        `<p>${view.nodes.length} nodes · ${view.edges.length} edges · ${escXml(this.reason)}</p>
        ${button('focus', 'Focus / search')}${button('direction', 'Upstream', 'upstream')}${button('direction', 'Downstream', 'downstream')}${button('direction', 'Both', 'both')}
        ${button('pair', this.pair === undefined ? 'Adjacent pair' : 'Full matrix')}${button('left', '←', '', this.pair === undefined || this.pair === 0)}${button('right', '→', '', this.pair === undefined || this.pair === CHAIN_STAGES.length - 2)}${button('reset', 'Reset')}
        <p>Focus: ${escXml(this.focus ?? 'selected population')} · ${this.direction}</p><div class="columns">${columns}</div><h2>Trace edges</h2><ul>${edges}</ul>`;
      const nonce = Math.random().toString(36).slice(2);
      panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'">
        <style>body{font:14px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px}button{margin:4px;padding:6px;cursor:pointer}table{border-collapse:collapse}td,th{padding:10px;border:1px solid var(--vscode-panel-border)}.columns{display:flex;overflow:auto;gap:16px}.columns section{min-width:260px;max-width:340px}article{border:1px solid var(--vscode-panel-border);padding:12px;margin:8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{display:block}li{margin:8px}</style></head><body>
        <h1>${kind === 'matrix' ? 'Traceability Matrix' : 'Requirements by Release'}</h1>
        <p>${escXml(path.basename(p.scope.catalogue))} · Product: ${escXml(names(p.scope.product))} · Release: ${escXml(names(p.scope.release))} · Project: ${escXml(names(p.scope.project))}</p>
        <p>As at ${p.asAt} · ${escXml(p.snapshotId)} · Base revision: ${escXml(p.sourceRevision ?? 'unavailable')} · ${p.completeness}${this.snapshot.stale ? ' — STALE: refresh failed' : ''}</p>
        <p>Selected requirements: ${count(p.populations.selected)} · Product requirements: ${count(p.populations.product)}</p>
        ${button('scope', 'Select scope')}${button('refresh', 'Refresh')}${button('export', 'Export shared projection')}
        <p>${escXml(p.scopeFindings.join('; '))}</p>${body}
        <h2>Assignment provenance</h2><pre>${escXml(JSON.stringify(p.assignments, null, 2))}</pre>
        <h2>Reference findings</h2><p>Selected defective references: ${count(p.selectedReferences)} · Known inventory: ${count(p.defectiveReferences)} · Unattributable findings: ${count(p.unattributableFindings)}</p>
        <details><summary>All findings and affected requirements</summary><pre>${escXml(JSON.stringify({ findings: p.findings, affected: p.affectedRequirements }, null, 2))}</pre></details>
        <script nonce="${nonce}">const api=acquireVsCodeApi();const state=api.getState();if(state){window.scrollTo(state.x,state.y);const c=document.querySelector('.columns');if(c)c.scrollLeft=state.columns;}const save=()=>api.setState({x:scrollX,y:scrollY,columns:document.querySelector('.columns')?.scrollLeft??0});document.addEventListener('scroll',save,true);window.addEventListener('click',e=>{const b=e.target.closest('button');if(b)api.postMessage({action:b.dataset.action,value:b.dataset.value});});</script></body></html>`;
    }
  }
}
