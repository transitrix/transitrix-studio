import * as vscode from 'vscode';
import * as path from 'node:path';
import { buildComplianceIndex, requirementReleaseCounts, RequirementChainSnapshot, selectRequirementChain, CHAIN_STAGES, chainDate,
  type ChainScope, type ChainSet } from '@transitrix/diagrams/compliance';
import { scanRequirementChainCatalogue } from './compliance-scan.js';
import { escXml, outcomeBadge } from './compliance-render.js';

type Viewport = { x: number; y: number; columns: number; columnY: number };
type ViewState = {
  list?: string; focus?: string; direction: 'both' | 'upstream' | 'downstream'; pair?: number;
  reason: string; pages: Record<string, number>; viewport: Partial<Record<'matrix' | 'release', Viewport>>;
};
type SavedState = { scope?: ChainScope; asAt: string; contexts: Record<string, ViewState> };
const STATE_KEY = 'requirementChain.views.v1';
const PAGE_SIZE = 40;
const emptyView = (): ViewState => ({ direction: 'both', reason: '', pages: {}, viewport: {} });

/** Both panels and their exports are rendered from this single immutable snapshot. */
export class RequirementChainPreview implements vscode.Disposable {
  private readonly snapshot = new RequirementChainSnapshot();
  private readonly panels = new Map<'matrix' | 'release', vscode.WebviewPanel>();
  private scope?: ChainScope;
  private asAt = new Date().toISOString().slice(0, 10);
  private view = emptyView();
  private contexts: Record<string, ViewState> = {};
  private revealContributors = false;
  private pageLimits = new Map<string, number>();
  private subscriptions: vscode.Disposable[];
  private watcher?: vscode.FileSystemWatcher;
  constructor(private readonly storage?: vscode.Memento) {
    const saved = storage?.get<SavedState>(STATE_KEY);
    if (saved?.scope && chainDate(saved.asAt)) {
      this.scope = saved.scope; this.asAt = saved.asAt; this.contexts = saved.contexts ?? {};
      this.view = this.contexts[this.contextKey()] ?? emptyView();
      this.watchScope();
    }
    const refresh = () => { if (this.panels.size) void this.refresh(); };
    this.subscriptions = [vscode.workspace.onDidSaveTextDocument(refresh),
      vscode.workspace.onDidCreateFiles(refresh), vscode.workspace.onDidDeleteFiles(refresh),
      vscode.workspace.onDidRenameFiles(refresh)];
  }
  dispose() { this.watcher?.dispose(); this.subscriptions.forEach(s => s.dispose()); this.panels.forEach(p => p.dispose()); }
  async show(kind: 'matrix' | 'release'): Promise<void> {
    if (!this.scope && !await this.selectScope()) return;
    const reopening = this.panels.size === 0;
    if (!this.panels.has(kind)) {
      const p = vscode.window.createWebviewPanel(`requirementChain-${kind}`,
        kind === 'matrix' ? 'Traceability Matrix' : 'Requirements by Release', vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true });
      this.panels.set(kind, p);
      p.onDidDispose(() => this.panels.delete(kind));
      p.webview.onDidReceiveMessage(async (m: { action?: string; value?: string; context?: string; snapshot?: string; viewport?: Viewport }) => {
        if (!m || (m.context !== undefined && m.context !== this.contextKey()) || (m.snapshot !== undefined && m.snapshot !== this.snapshot.current?.snapshotId)) return;
        if (m.action === 'viewport' && m.viewport) {
          if (['x', 'y', 'columns', 'columnY'].every(key => { const v = m.viewport![key as keyof Viewport]; return typeof v === 'number' && Number.isFinite(v) && v >= 0; })) {
            this.view.viewport[kind] = m.viewport; await this.saveState();
          }
          return;
        }
        if (m.action === 'scope') { if (await this.selectScope()) await this.refresh(); }
        else if (m.action === 'refresh') await this.refresh();
        else if (m.action === 'export') await this.export();
        else if (m.action === 'focus') {
          const value = await vscode.window.showInputBox({ prompt: 'Exact node ID or name (empty clears focus)', value: this.view.focus });
          if (value !== undefined) {
            const matches = this.snapshot.current?.nodes.filter(n => n.id === value || n.recordId === value || n.name === value) ?? [];
            if (!value) this.view.focus = undefined;
            else if (matches.length === 1) this.view.focus = matches[0].id;
            else if (matches.length > 1) {
              const selected = await vscode.window.showQuickPick(matches.map(n => ({ label: n.name, description: `${CHAIN_STAGES[n.stage]} · ${n.id}`, id: n.id })), { title: 'Choose a node to focus' });
              if (!selected) return;
              this.view.focus = selected.id;
            } else { void vscode.window.showWarningMessage('No node matches that exact ID or name.'); return; }
            this.view.reason = ''; this.view.pages = {}; this.render();
          }
        } else if (m.action === 'direction' && ['both', 'upstream', 'downstream'].includes(m.value ?? '')) {
          this.view.direction = m.value as typeof this.view.direction; this.view.pages = {}; this.render();
        } else if (m.action === 'pair') { this.view.pair = this.view.pair === undefined ? 0 : undefined; this.render(); }
        else if (m.action === 'left' || m.action === 'right') {
          if (this.view.pair === undefined) return;
          this.view.pair = Math.max(0, Math.min(CHAIN_STAGES.length - 2, (this.view.pair ?? 0) + (m.action === 'left' ? -1 : 1))); this.render();
        } else if (m.action === 'page' && typeof m.value === 'string') {
          const [key, step] = m.value.split(':');
          const limit = this.pageLimits.get(key);
          if (limit === undefined || !['-1', '1'].includes(step)) return;
          this.view.pages[key] = Math.max(0, Math.min(limit, (this.view.pages[key] ?? 0) + Number(step))); this.render();
        } else if (m.action === 'reset') { this.view = emptyView(); this.render(); }
        else if (m.action === 'count' && this.snapshot.current && typeof m.value === 'string') {
          if (!Object.hasOwn(requirementReleaseCounts(this.snapshot.current), m.value)) return;
          this.view.list = m.value; this.view.pages.contributors = 0; this.revealContributors = true; this.render();
        } else if (m.action === 'drill' && this.snapshot.current && this.view.list) {
          const item = requirementReleaseCounts(this.snapshot.current)[this.view.list];
          if (!item || !m.value || !item.set.ids.includes(m.value) || !this.snapshot.current.nodes.some(n => n.id === m.value)) return;
          this.view.focus = m.value; this.view.pages = {}; this.view.direction = 'both'; this.view.pair = undefined;
          this.view.reason = item.label + ' · ' + m.value; await this.show('matrix');
        } else if (m.action === 'open') {
          const node = this.snapshot.current?.nodes.find(n => n.id === m.value) ?? this.snapshot.current?.records.find(r => r.id === m.value);
          if (node?.sourcePath) await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(node.sourcePath));
        }
        await this.saveState();
      });
    }
    this.panels.get(kind)!.reveal();
    if (reopening || !this.snapshot.current) await this.refresh(); else this.render();
  }
  private async selectScope(): Promise<boolean> {
    const folders = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false,
      canSelectMany: false, title: 'Select the catalogue containing transitrix.yaml' });
    if (!folders?.length) return false;
    const root = folders[0].fsPath;
    let scan;
    try { scan = await scanRequirementChainCatalogue(root); }
    catch { void vscode.window.showErrorMessage('Cannot read transitrix.yaml in this catalogue.'); return false; }
    const pick = async (type: string, prompt: string, product?: string) => {
      const options = scan.canon.records.filter(r => r.type === type && (type !== 'RELEASE' || r.raw.of === product) && (type !== 'ACTION' || r.raw.type === 'Project'))
        .map(r => ({ label: String(r.raw.name ?? r.id), description: r.id, id: r.id }));
      options.sort((a, b) => a.id.localeCompare(b.id));
      options.unshift({ label: `${prompt}: unselected`, description: '', id: '' });
      return (await vscode.window.showQuickPick(options, { title: prompt }))?.id;
    };
    const product = await pick('PRODUCT', 'Product'); if (product === undefined) return false;
    const release = await pick('RELEASE', 'Release', product); if (release === undefined) return false;
    const project = await pick('ACTION', 'Project (optional)'); if (project === undefined) return false;
    const asAt = await vscode.window.showInputBox({ title: 'As-at date', value: this.asAt,
      validateInput: v => chainDate(v) ? undefined : 'Use a valid YYYY-MM-DD date' });
    if (!asAt) return false;
    await this.saveState();
    this.scope = { catalogue: root, product: product || undefined, release: release || undefined, project: project || undefined }; this.asAt = asAt;
    this.view = this.contexts[this.contextKey()] ?? emptyView();
    this.watchScope(); await this.saveState();
    return true;
  }
  private contextKey(): string {
    return JSON.stringify([this.scope?.catalogue, this.scope?.project, this.scope?.product, this.scope?.release, this.asAt]);
  }
  private async saveState(): Promise<void> {
    if (!this.scope) return;
    this.contexts[this.contextKey()] = this.view;
    await this.storage?.update(STATE_KEY, { scope: this.scope, asAt: this.asAt, contexts: this.contexts });
  }
  private watchScope(): void {
    this.watcher?.dispose();
    if (!this.scope) return;
    this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.scope.catalogue, '**/*.{yaml,yml}'));
    const refresh = () => { if (this.panels.size) void this.refresh(); };
    this.watcher.onDidChange(refresh); this.watcher.onDidCreate(refresh); this.watcher.onDidDelete(refresh);
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
    const page = <T,>(items: readonly T[], key: string, render: (item: T) => string): string => {
      const last = Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1);
      this.pageLimits.set(key, last);
      const current = Math.min(last, this.view.pages[key] ?? 0);
      this.view.pages[key] = current;
      const start = current * PAGE_SIZE, end = Math.min(start + PAGE_SIZE, items.length);
      return `<div class="page"><p>${items.length ? start + 1 : 0}–${end} of ${items.length} · Page ${current + 1} of ${last + 1}
        ${button('page', 'Previous page', key + ':-1', current === 0)}${button('page', 'Next page', key + ':1', current === last)}</p>
        ${items.slice(start, end).map(render).join('')}</div>`;
    };
    const count = (s: ChainSet) => s.total === null ? `Unknown (${s.ids.length} known; incomplete)` : String(s.total);
    for (const [kind, panel] of this.panels) {
      if (!p) {
        const nonce = Math.random().toString(36).slice(2);
        panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'"></head><body>
          <p>Catalogue unavailable. Retry loading or select another scope.</p>${button('scope', 'Select scope')}${button('refresh', 'Refresh')}
          <script nonce="${nonce}">const api=acquireVsCodeApi();window.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&!b.disabled)api.postMessage({action:b.dataset.action});});</script></body></html>`;
        continue;
      }
      const view = selectRequirementChain(p, this.view.focus, this.view.direction);
      const visible = view.nodes.filter(n => this.view.pair === undefined || n.stage === this.view.pair || n.stage === this.view.pair + 1);
      const counts = requirementReleaseCounts(p);
      const countButton = (key: string) => button('count', count(counts[key].set), key);
      const countRow = (key: string) => `<tr data-count="${key}"><th>${escXml(counts[key].label)}</th><td>${countButton(key)} ${counts[key].unit}</td></tr>`;
      const table = (keys: string[]) => `<table><tbody>${keys.map(countRow).join('')}</tbody></table>`;
      const selectedList = this.view.list && Object.hasOwn(counts, this.view.list) ? counts[this.view.list] : undefined;
      const contributors = !selectedList ? '' : `<section id="contributors"><h2>${escXml(selectedList.label)} — contributing ${selectedList.unit}</h2>
        <p>${count(selectedList.set)} ${selectedList.unit} · As at ${p.asAt} · ${escXml(p.snapshotId)}</p>
        ${page(selectedList.set.ids, 'contributors', id => {
          const node = p.nodes.find(n => n.id === id);
          const findings = p.findings.filter(f => f.id === id || p.affectedRequirements[f.id]?.includes(id));
          return `<article data-contributor="${escXml(id)}"><b>${escXml(node?.name ?? id)}</b><p>${escXml(id)}</p>
            ${node ? button('drill', 'Open in matrix', id) : ''}
            ${findings.map(f => `<p>${escXml(f.id)} · ${escXml(f.code)} · ${escXml(f.message)} · Affected requirements: ${escXml((p.affectedRequirements[f.id] ?? []).join(', ') || 'unattributable')}</p>${button('open', 'Open finding record', f.owner, !p.records.some(r => r.id === f.owner))}`).join('')}</article>`;
        })}</section>`;
      const recordDetails = (n: typeof p.nodes[number]) => {
        if (n.stage < 7) return '';
        const raw = n.raw;
        const verdict = typeof raw.outcome === 'string' && ['pass', 'fail', 'inconclusive', 'not_yet_run'].includes(raw.outcome)
          ? outcomeBadge(raw.outcome as 'pass' | 'fail' | 'inconclusive' | 'not_yet_run')
          : `Outcome: ${raw.outcome === undefined ? 'absent' : 'malformed — ' + escXml(JSON.stringify(raw.outcome))}`;
        const evidence = raw.evidence === undefined ? 'Evidence: absent' : !Array.isArray(raw.evidence) ? 'Evidence: malformed' : `Evidence: ${raw.evidence.length} entries`;
        const findings = p.findings.filter(f => f.owner === n.recordId).map(f => `${f.field}: ${f.message}`).join('; ');
        const references = Array.isArray(raw.evidence) ? raw.evidence.filter(e => e && e.kind === 'canonical_ref' && typeof e.ref === 'string').map(e => button('open', e.ref, e.ref, !p.records.some(r => r.id === e.ref))).join('') : '';
        return `<p>${verdict}</p><p>${evidence} · Execution date: ${escXml(String(raw.performed_at ?? 'absent'))} · Result narrative: ${raw.result === undefined ? 'absent' : typeof raw.result === 'string' ? escXml(raw.result) : 'malformed'}</p>
          <p>Protocol: ${raw.protocol === undefined ? 'absent' : typeof raw.protocol === 'string' ? escXml(raw.protocol) : 'malformed'}</p><p>${escXml(findings)}</p>${references}`;
      };
      const columns = CHAIN_STAGES.map((stage, i) => this.view.pair !== undefined && i !== this.view.pair && i !== this.view.pair + 1 ? '' :
        `<section data-stage="${i}"><h2>${stage}</h2>${page(visible.filter(n => n.stage === i), `stage-${i}`, n => `<article data-node="${escXml(n.id)}"><b>${escXml(n.name)}</b><p>${escXml(n.id)}</p><p>${escXml(n.context.join(', '))}</p>${recordDetails(n)}${button('open', 'Open record', n.id)}<details><summary>Record</summary><pre>${escXml(JSON.stringify(n.raw, null, 2))}</pre></details></article>`)}${visible.some(n => n.stage === i) ? '' : '<p>Empty stage</p>'}</section>`).join('');
      const edges = page(view.edges, 'edges', e => `<div class="edge" data-edge="${escXml(e.id)}">${escXml(e.from)} → ${escXml(e.to)} (${escXml(e.kind)}) ${!e.valid ? '— invalid reference' : ''}
        ${this.view.pair !== undefined && (!visible.some(n => n.id === e.from) || !visible.some(n => n.id === e.to)) ? '— continues across hidden stages' : ''}
        <small>Stored: ${escXml(e.storedFrom)} → ${escXml(e.storedTo)} · ${escXml(e.identities.join(', '))}</small>
        ${e.identities.map(id => { const record = p.records.find(r => id === r.id || id.startsWith(r.id + '.')); return button('open', id, record?.id ?? '', !record); }).join('')}</div>`);
      const names = (id?: string) => id ? `${p.records.find(n => n.id === id)?.raw.name ?? id} (${id})` : 'unselected';
      const body = kind === 'release' ? `<h2>Quality metrics</h2>
        <p>The first five metrics use the selected release population, intersected with a project only when selected. The sixth uses the whole product. Categories overlap; never sum them into a defect total.</p>
        ${table(Object.keys(counts).filter(key => key.startsWith('metric-')))}
        <h2>Requirement stages</h2><p>Distinct requirements, not completion or coverage percentages. Optional skipped stages do not imply missing requirements.</p>${table([3,4,5,6].map(i => 'stage-' + i))}
        <h2>No effective release assignment — whole product</h2><p>At the same as-at date, no effective attachment to any modelled release of this product. Independent of the selected project. Invalid assignments and unresolved membership are separate.</p>${table([3,4,5,6].map(i => 'unassigned-' + i))}
        <h2>Assignment and scope populations</h2>${table(['selected','product','here','other','invalid','unresolved'])}
        <h2>Context units</h2><p>Source documents, drivers, needs, definition parts and result parts in the equivalent unfocused matrix; these nodes are never summed as requirements.</p>${table([0,1,2,7,8].map(i => 'context-' + i))}
        <h2>Diagnostic units</h2><p>Distinct reference slots and finding records, separate from affected requirements.</p>${table(['selected-references','all-references','unattributable'])}${contributors}` :
        `<p>${view.nodes.length} nodes · ${view.edges.length} edges · ${escXml(this.view.reason)}${this.view.reason && this.view.focus && selectedList && !selectedList.set.ids.includes(this.view.focus) ? ' · No longer a contributor at this snapshot' : ''}</p>
        ${button('focus', 'Focus / search')}${button('direction', 'Upstream', 'upstream')}${button('direction', 'Downstream', 'downstream')}${button('direction', 'Both', 'both')}
        ${button('pair', this.view.pair === undefined ? 'Adjacent pair' : 'Full matrix')}${button('left', '←', '', this.view.pair === undefined || this.view.pair === 0)}${button('right', '→', '', this.view.pair === undefined || this.view.pair === CHAIN_STAGES.length - 2)}${button('reset', 'Reset')}
        <p>${this.view.focus && !p.nodes.some(n => n.id === this.view.focus) ? 'Focused node is no longer in this snapshot; reset or search again.' : ''}</p><p>Focus: ${escXml(this.view.focus ?? 'selected population')} · ${this.view.direction}${this.view.focus && !p.populations.selected.ids.includes(this.view.focus) ? ' · Context focus; selected counts unchanged' : ''}</p><p>${this.view.pair === undefined ? 'Full matrix · 9 stages' : `Pair ${this.view.pair + 1} of ${CHAIN_STAGES.length - 1} · ${CHAIN_STAGES[this.view.pair]} → ${CHAIN_STAGES[this.view.pair + 1]}`}</p><div class="columns">${columns}</div><h2>Trace edges</h2>${edges}`;
      const nonce = Math.random().toString(36).slice(2);
      panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'">
        <style>body{font:14px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px}button{margin:4px;padding:6px;cursor:pointer}table{border-collapse:collapse}td,th{padding:10px;border:1px solid var(--vscode-panel-border)}.columns{display:flex;overflow:auto;max-height:65vh;gap:16px}.columns section{min-width:260px;max-width:340px}article{border:1px solid var(--vscode-panel-border);padding:12px;margin:8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{display:block}.edge{margin:10px 0}.cmp-badge{font-weight:bold;border:1px solid currentColor;border-radius:8px;padding:2px 8px}.cmp-outcome-pass{color:var(--vscode-testing-iconPassed)}.cmp-outcome-fail{color:var(--vscode-testing-iconFailed)}.cmp-outcome-inconclusive{color:var(--vscode-editorWarning-foreground)}li{margin:8px}</style></head><body>
        <h1>${kind === 'matrix' ? 'Traceability Matrix' : 'Requirements by Release'}</h1>
        <p>${escXml(path.basename(p.scope.catalogue))} · Product: ${escXml(names(p.scope.product))} · Release: ${escXml(names(p.scope.release))} · Project: ${escXml(names(p.scope.project))}</p>
        <p>As at ${p.asAt} · ${escXml(p.snapshotId)} · Base revision: ${escXml(p.sourceRevision ?? 'unavailable')} · ${p.completeness}${this.snapshot.stale ? ' — STALE: refresh failed' : ''}</p>
        <p>Selected requirements: ${count(p.populations.selected)} · Product requirements: ${count(p.populations.product)}</p>
        ${button('scope', 'Select scope')}${button('refresh', 'Refresh')}${button('export', 'Export shared projection')}
        <p>${escXml(p.scopeFindings.join('; '))}</p>${body}
        <h2>Assignment provenance</h2><p>Direct obligations attach at depth 0; inherited obligations come from a same-product predecessor. The nearest active attachment is shown with all contributing relation IDs. Verification is never inherited from a parent requirement or predecessor release.</p><p>Here: ${count(p.assignments.here)} · Other release only: ${count(p.assignments.otherReleaseOnly)} · Unassigned: ${count(p.assignments.unassigned)} · Invalid: ${count(p.assignments.invalid)}</p>${page(p.assignments.provenance, 'assignments', a => `<pre>${escXml(JSON.stringify(a, null, 2))}</pre>`)}
        <h2>Reference findings</h2><p>Selected defective references: ${count(p.selectedReferences)} · Known inventory: ${count(p.defectiveReferences)} · Unattributable findings: ${count(p.unattributableFindings)}</p>
        <details><summary>All findings and affected requirements</summary>${page(p.findings, 'findings', f => `<p>${escXml(f.id)} · ${escXml(f.message)} · ${escXml((p.affectedRequirements[f.id] ?? []).join(', '))}</p>`)}</details>
        <script nonce="${nonce}">const api=acquireVsCodeApi();const key=${JSON.stringify(this.contextKey()).replace(/</g, '\\u003c')};
        const snapshot=${JSON.stringify(p.snapshotId).replace(/</g, '\\u003c')};const prior=api.getState();const fallback=${JSON.stringify(this.view.viewport[kind] ?? { x: 0, y: 0, columns: 0, columnY: 0 })};
        const state=prior?.key===key?prior:fallback;const c=document.querySelector('.columns');
        requestAnimationFrame(()=>{window.scrollTo(state.x,state.y);if(c){c.scrollLeft=state.columns;c.scrollTop=state.columnY;}if(${kind === 'release' && this.revealContributors})document.querySelector('#contributors')?.scrollIntoView?.();});
        const save=()=>{const viewport={x:scrollX,y:scrollY,columns:c?.scrollLeft??0,columnY:c?.scrollTop??0};api.setState({key,...viewport});return viewport;};
        let queued=false;document.addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;api.postMessage({action:'viewport',context:key,viewport:save()});});}},true);
        window.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&!b.disabled){api.postMessage({action:'viewport',context:key,viewport:save()});if(b.dataset.action==='reset')api.setState(undefined);api.postMessage({action:b.dataset.action,value:b.dataset.value,context:key,snapshot});}});</script></body></html>`;
    }
    this.revealContributors = false;
  }
}
