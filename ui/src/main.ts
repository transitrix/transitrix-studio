import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import './style.css';

import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer.js';
import yaml from 'js-yaml';

import initialYaml from '../../examples/bpmn/order-fulfillment.cervin.yaml?raw';
import nestedBlocksAscii from '../../examples/nested-blocks/nested.txt?raw';
import blocksTablesMarkdown from '../../examples/nested-blocks/tables.md?raw';
import initialGoalsYaml from '../../examples/goals/strategy-2026.goals.transitrix.yaml?raw';

import { validateGoalTree, layoutGoalTree } from '../../packages/diagrams/src/goals/index.js';
import type { GoalTree, GoalTreeLayout, LaidOutNode, LaidOutEdge } from '../../packages/diagrams/src/goals/types.js';

/** Single Markdown table sample for the nested-blocks “Markdown table” input mode. */
const SAMPLE_MARKDOWN_SINGLE_TABLE = `
| Service       | Language |
|---------------|----------|
| API Gateway   | Go       |
`.trimStart();
import {
  DEFAULT_LAYOUT_DIAGRAM_OPTIONS,
  type LayoutDiagramOptions,
} from '../../src/layout-options.ts';
import {
  downloadBlob,
  guessExportBasenameFromYaml,
  rasterSvgStringToPngBlob,
} from './export-diagram.ts';

const THEME_STORAGE_KEY = 'cervin-ui-theme';
const LAYOUT_STORAGE_KEY = 'cervin-layout-defaults';
/** Stored value must match backends/blocks compile ``mode``. */
const BLOCKS_MODE_STORAGE_KEY = 'cervin-ui-blocks-mode';
type UiTheme = 'light' | 'dark';

type BlocksCompileUiMode = 'ascii' | 'markdown_table' | 'markdown_tables';
type StudioTab = 'bpmn' | 'blocks' | 'goals';

function readStoredTheme(): UiTheme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme: UiTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* noop */
  }
}

applyTheme(readStoredTheme());

function afterLayout(cb: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(cb);
  });
}

type CanvasSvc = {
  resized: () => void;
  zoom: (s: string) => void;
  viewbox: (b?: Record<string, number>) => unknown;
};

function fitDiagram(viewer: InstanceType<typeof NavigatedViewer>): void {
  const pad = 56;
  try {
    const canvas = viewer.get('canvas') as CanvasSvc;
    canvas.resized();
    const vb = canvas.viewbox() as {
      inner: { x?: number; y?: number; width?: number; height?: number };
    };
    const iw = vb.inner?.width ?? 0;
    const ih = vb.inner?.height ?? 0;
    if (!(iw > 0 && ih > 0)) {
      canvas.zoom('fit-viewport');
      return;
    }
    const ix = vb.inner?.x ?? 0;
    const iy = vb.inner?.y ?? 0;
    canvas.viewbox({
      x: ix - pad,
      y: iy - pad,
      width: iw + pad * 2,
      height: ih + pad * 2,
    });
  } catch {
    /* noop */
  }
}

const LAYOUT_FIELD_META: { key: keyof LayoutDiagramOptions; label: string; group?: string }[] = [
  { key: 'laneVerticalGap', label: 'Vertical gap between lanes (px)', group: 'Pool & lanes' },
  { key: 'poolPad', label: 'Pool inner padding (px)', group: 'Pool & lanes' },
  {
    key: 'participantLabelBand',
    label: 'Participant header band height (px)',
    group: 'Pool & lanes',
  },
  { key: 'laneLabelWidth', label: 'Lane label column width (px)', group: 'Pool & lanes' },
  { key: 'laneContentRightPad', label: 'Lane content right padding (px)', group: 'Pool & lanes' },
  { key: 'poolOriginX', label: 'Pool origin X offset on canvas', group: 'Pool & lanes' },
  { key: 'poolOriginY', label: 'Pool origin Y offset on canvas', group: 'Pool & lanes' },
  { key: 'elkNodeSpacing', label: 'Node spacing inside lane (ELK)', group: 'Graph inside lane' },
  { key: 'elkLayerSpacing', label: 'Layer spacing (ELK)', group: 'Graph inside lane' },
  { key: 'elkDiagramPadding', label: 'ELK diagram padding (px)', group: 'Graph inside lane' },
];

function renderLayoutDrawer(): string {
  let currentGroup = '';
  const parts: string[] = [];
  parts.push(`
<details class="layout-drawer">
  <summary class="layout-summary">Diagram layout parameters</summary>
  <div class="layout-drawer-inner" id="layout-fields-root">
    <p class="layout-hint muted">Values recompile automatically after ~0.5 s when inputs or YAML change. Use <strong>Rebuild</strong> for an immediate compile.</p>
    <div class="layout-actions">
      <button type="button" class="btn-text" id="btn-layout-reset">Reset to defaults</button>
      <button type="button" class="btn-text" id="btn-layout-save">Save as defaults</button>
    </div>`);
  for (const { key, label, group } of LAYOUT_FIELD_META) {
    if (group && group !== currentGroup) {
      currentGroup = group;
      parts.push(`<div class="layout-group-title">${group}</div>`);
    }
    parts.push(`<label class="layout-field"><span>${label}</span>
<input type="number" id="layout-${String(key)}" min="0" max="800" step="1" inputmode="numeric" /></label>`);
  }
  parts.push(`</div></details>`);
  return parts.join('\n');
}

function renderShell(root: HTMLElement): void {
  root.innerHTML = `
<div class="shell-header">
  <h1>Transitrix Studio <span class="sub">text-first BPMN</span></h1>
  <div class="actions">
    <input id="pick-file" class="a11y-file" type="file" accept=".yaml,.yml,.cervin.yaml,.bpmn.yaml,.txt,.md,.markdown,text/yaml,text/x-yaml,text/plain" aria-label="Open source file from disk" />
    <button type="button" id="btn-open">Open…</button>
    <button type="button" id="btn-compile">Rebuild</button>
    <button type="button" id="btn-reset">Sample</button>
    <button type="button" id="btn-theme" aria-label="Switch color theme">Dark</button>
    <span class="actions-sep" aria-hidden="true"></span>
    <button type="button" id="btn-export-bpmn" disabled title="Download BPMN 2.0 XML (.bpmn) after a successful preview">Export BPMN</button>
    <button type="button" id="btn-export-svg" disabled title="Download the diagram as SVG (after a successful preview)">SVG</button>
    <button type="button" id="btn-export-png" disabled title="Download the diagram as PNG (after a successful preview)">PNG</button>
  </div>
</div>
<div class="mode-toolbar">
  <div class="mode-tablist" role="tablist" aria-label="Studio tool">
    <button type="button" class="mode-tab" role="tab" id="tab-bpmn" aria-selected="true" aria-controls="split-root">BPMN diagram</button>
    <button type="button" class="mode-tab" role="tab" id="tab-blocks" aria-selected="false" aria-controls="split-root">Nested blocks (Svgbob)</button>
    <button type="button" class="mode-tab" role="tab" id="tab-goals" aria-selected="false" aria-controls="split-root">Goals tree</button>
  </div>
</div>
${renderLayoutDrawer().replace('<details class="layout-drawer"', '<details class="layout-drawer layout-bpmn-only"')}
<div class="split" id="split-root">
  <section class="pane" aria-label="Source editor">
    <div class="pane-title" id="source-pane-title">BPMN YAML</div>
    <div id="blocks-controls" class="blocks-controls" hidden>
      <label class="blocks-mode-label"><span>Input mode</span>
        <select id="blocks-mode-select" aria-label="Nested blocks input mode">
          <option value="ascii">ASCII nested diagram</option>
          <option value="markdown_table">Markdown table (single)</option>
          <option value="markdown_tables">Markdown document (all tables)</option>
        </select>
      </label>
      <p class="blocks-hint muted">Requires Python 3 and <code>svgbob_cli</code> (install: <code>cargo install svgbob_cli</code>). Samples: <code>examples/nested-blocks/</code>; see <code>backends/blocks/README.md</code>.</p>
    </div>
    <div class="editor-wrap">
      <textarea id="yaml" spellcheck="false" aria-label="BPMN YAML source"></textarea>
      <textarea id="blocks-source" spellcheck="false" aria-label="Nested blocks source text" hidden></textarea>
      <textarea id="goals-source" spellcheck="false" aria-label="Goals tree YAML source" hidden></textarea>
    </div>
  </section>
  <section class="pane" aria-label="Preview">
    <div class="pane-title" id="preview-pane-title">BPMN preview</div>
    <div class="preview-wrap">
      <div id="diagram" aria-live="polite"></div>
      <div id="blocks-preview" aria-live="polite" hidden>
        <div id="blocks-svg-host" class="blocks-svg-host"></div>
      </div>
      <div id="goals-preview" aria-live="polite" hidden style="overflow:auto;padding:16px;"></div>
    </div>
  </section>
</div>
<div class="shell-footer muted" id="status" role="status">Ready</div>
`;
}

const root = document.querySelector('#app');
if (!root || !(root instanceof HTMLElement)) {
  throw new Error('#app container is missing');
}

renderShell(root);

root.dataset.studioTab = 'bpmn';

const textarea = document.querySelector<HTMLTextAreaElement>('#yaml');
const blocksSource = document.querySelector<HTMLTextAreaElement>('#blocks-source');
const diagramHost = document.querySelector<HTMLElement>('#diagram');
const blocksPreview = document.querySelector<HTMLElement>('#blocks-preview');
const blocksSvgHost = document.querySelector<HTMLElement>('#blocks-svg-host');
const blocksControls = document.querySelector<HTMLElement>('#blocks-controls');
const blocksModeSelect = document.querySelector<HTMLSelectElement>('#blocks-mode-select');
const sourcePaneTitle = document.querySelector<HTMLElement>('#source-pane-title');
const previewPaneTitle = document.querySelector<HTMLElement>('#preview-pane-title');
const tabBpmn = document.querySelector<HTMLButtonElement>('#tab-bpmn');
const tabBlocks = document.querySelector<HTMLButtonElement>('#tab-blocks');
const tabGoals = document.querySelector<HTMLButtonElement>('#tab-goals');
const goalsSource = document.querySelector<HTMLTextAreaElement>('#goals-source');
const goalsPreviewEl = document.querySelector<HTMLElement>('#goals-preview');
const status = document.querySelector<HTMLElement>('#status');
const btnOpen = document.querySelector('#btn-open');
const btnCompile = document.querySelector('#btn-compile');
const btnReset = document.querySelector('#btn-reset');
const btnExportBpmn = document.querySelector<HTMLButtonElement>('#btn-export-bpmn');
const btnExportSvg = document.querySelector<HTMLButtonElement>('#btn-export-svg');
const btnExportPng = document.querySelector<HTMLButtonElement>('#btn-export-png');
const btnLayoutReset = document.querySelector('#btn-layout-reset');
const btnLayoutSave = document.querySelector<HTMLButtonElement>('#btn-layout-save');
const pickFile = document.querySelector<HTMLInputElement>('#pick-file');
const btnTheme = document.querySelector<HTMLButtonElement>('#btn-theme');

if (
  !textarea ||
  !blocksSource ||
  !goalsSource ||
  !diagramHost ||
  !blocksPreview ||
  !blocksSvgHost ||
  !blocksControls ||
  !blocksModeSelect ||
  !goalsPreviewEl ||
  !sourcePaneTitle ||
  !previewPaneTitle ||
  !tabBpmn ||
  !tabBlocks ||
  !tabGoals ||
  !status ||
  !btnOpen ||
  !btnCompile ||
  !btnReset ||
  !btnExportBpmn ||
  !btnExportSvg ||
  !btnExportPng ||
  !pickFile ||
  !btnLayoutReset ||
  !btnLayoutSave ||
  !btnTheme
) {
  throw new Error('UI markup failed to load');
}

function syncThemeToggleLabel(): void {
  const t = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  btnTheme.textContent = t === 'light' ? 'Dark' : 'Light';
  btnTheme.title = t === 'light' ? 'Switch to dark theme' : 'Switch to light theme (default)';
  btnTheme.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
}

syncThemeToggleLabel();
btnTheme.addEventListener('click', () => {
  const next: UiTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  syncThemeToggleLabel();
});

textarea.value = initialYaml.trimStart();

function readStoredBlocksMode(): BlocksCompileUiMode {
  try {
    const v = localStorage.getItem(BLOCKS_MODE_STORAGE_KEY);
    if (v === 'ascii' || v === 'markdown_table' || v === 'markdown_tables') {
      return v;
    }
  } catch {
    /* noop */
  }
  return 'ascii';
}

function persistBlocksMode(mode: BlocksCompileUiMode): void {
  try {
    localStorage.setItem(BLOCKS_MODE_STORAGE_KEY, mode);
  } catch {
    /* noop */
  }
}

blocksSource.value = nestedBlocksAscii.trimStart();
blocksModeSelect.value = readStoredBlocksMode();
goalsSource.value = initialGoalsYaml.trimStart();

/** Last successfully compiled BPMN XML (matches the preview). */
let lastCompiledBpmnXml: string | null = null;

/** Last successful nested-blocks response (normalized list of SVG payloads). */
let lastBlocksSvgs: string[] | null = null;

function studioTab(): StudioTab {
  const t = root.dataset.studioTab;
  if (t === 'blocks') return 'blocks';
  if (t === 'goals') return 'goals';
  return 'bpmn';
}

function syncExportButtonsAvailability(): void {
  const tab = studioTab();
  if (tab === 'bpmn') {
    const ok = Boolean(lastCompiledBpmnXml);
    btnExportBpmn.disabled = !ok;
    btnExportSvg.disabled = !ok;
    btnExportPng.disabled = !ok;
  } else if (tab === 'goals') {
    btnExportBpmn.disabled = true;
    btnExportSvg.disabled = true;
    btnExportPng.disabled = true;
  } else {
    btnExportBpmn.disabled = true;
    const ok = Boolean(lastBlocksSvgs && lastBlocksSvgs.length > 0);
    btnExportSvg.disabled = !ok;
    btnExportPng.disabled = !ok;
  }
}

function guessBlocksExportBasename(source: string): string {
  const lines = source.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const title = lines[0] ?? 'nested-blocks';
  const stripped = title
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  const base = stripped.slice(0, 96);
  return base || 'nested-blocks';
}

function setStudioTab(tab: StudioTab): void {
  root.dataset.studioTab = tab;
  tabBpmn.setAttribute('aria-selected', tab === 'bpmn' ? 'true' : 'false');
  tabBlocks.setAttribute('aria-selected', tab === 'blocks' ? 'true' : 'false');
  tabGoals.setAttribute('aria-selected', tab === 'goals' ? 'true' : 'false');

  textarea.toggleAttribute('hidden', tab !== 'bpmn');
  blocksSource.toggleAttribute('hidden', tab !== 'blocks');
  blocksControls.toggleAttribute('hidden', tab !== 'blocks');
  goalsSource.toggleAttribute('hidden', tab !== 'goals');
  diagramHost.toggleAttribute('hidden', tab !== 'bpmn');
  blocksPreview.toggleAttribute('hidden', tab !== 'blocks');
  goalsPreviewEl.toggleAttribute('hidden', tab !== 'goals');

  if (tab === 'bpmn') {
    sourcePaneTitle.textContent = 'BPMN YAML';
    previewPaneTitle.textContent = 'BPMN preview';
  } else if (tab === 'goals') {
    sourcePaneTitle.textContent = 'Goals YAML';
    previewPaneTitle.textContent = 'Goals tree';
  } else {
    sourcePaneTitle.textContent = 'Nested blocks source';
    previewPaneTitle.textContent = 'SVG preview';
  }
  syncExportButtonsAvailability();
}

function readStoredLayout(): Partial<LayoutDiagramOptions> {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<LayoutDiagramOptions> = {};
    for (const key of Object.keys(DEFAULT_LAYOUT_DIAGRAM_OPTIONS) as (keyof LayoutDiagramOptions)[]) {
      const v = parsed[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveLayoutToStorage(values: Partial<LayoutDiagramOptions>): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(values));
  } catch {
    /* noop */
  }
}

function applyDefaultLayoutInputs(): void {
  for (const key of Object.keys(DEFAULT_LAYOUT_DIAGRAM_OPTIONS) as (keyof LayoutDiagramOptions)[]) {
    const el = document.querySelector<HTMLInputElement>(`#layout-${String(key)}`);
    if (el) el.value = String(DEFAULT_LAYOUT_DIAGRAM_OPTIONS[key]);
  }
}

function applyStoredOrDefaultLayout(): void {
  const stored = readStoredLayout();
  for (const key of Object.keys(DEFAULT_LAYOUT_DIAGRAM_OPTIONS) as (keyof LayoutDiagramOptions)[]) {
    const el = document.querySelector<HTMLInputElement>(`#layout-${String(key)}`);
    if (!el) continue;
    el.value = String(key in stored ? stored[key] : DEFAULT_LAYOUT_DIAGRAM_OPTIONS[key]);
  }
}

applyStoredOrDefaultLayout();

function collectLayoutFromInputs(): Partial<LayoutDiagramOptions> {
  const out: Partial<LayoutDiagramOptions> = {};
  for (const key of Object.keys(DEFAULT_LAYOUT_DIAGRAM_OPTIONS) as (keyof LayoutDiagramOptions)[]) {
    const el = document.querySelector<HTMLInputElement>(`#layout-${String(key)}`);
    if (!el) continue;
    const n = Number.parseFloat(el.value);
    if (!Number.isFinite(n)) continue;
    out[key] = n;
  }
  return out;
}

let viewerInstance: InstanceType<typeof NavigatedViewer> | null = null;

function getViewer(): InstanceType<typeof NavigatedViewer> {
  if (!viewerInstance) {
    viewerInstance = new NavigatedViewer({
      container: diagramHost,
      keyboard: { bindTo: document.body },
    });
    let fitRaf = 0;
    const scheduleFit = (): void => {
      if (!viewerInstance) return;
      if (fitRaf) cancelAnimationFrame(fitRaf);
      fitRaf = requestAnimationFrame(() => {
        fitRaf = 0;
        fitDiagram(viewerInstance!);
      });
    };
    new ResizeObserver(() => scheduleFit()).observe(diagramHost);
    window.addEventListener('resize', scheduleFit);
  }
  return viewerInstance;
}

// ── Goals tree SVG renderer ──────────────────────────────────────────────────

const LEVEL_COLORS = ['#dbeafe', '#e0e7ff', '#d4edda', '#fef3c7', '#fce7f3', '#e0f2fe', '#f3e8ff', '#fef9c3'];

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function goalsLayoutToSvg(layout: GoalTreeLayout, tree: GoalTree): string {
  const pad = 24;
  const w = layout.bounds.width + pad * 2;
  const h = layout.bounds.height + pad * 2;
  const ox = -layout.bounds.x + pad;
  const oy = -layout.bounds.y + pad;
  const nodeMap = new Map(layout.nodes.map((n: LaidOutNode) => [n.id, n]));
  const typeMap = new Map(tree.goal_types.map(gt => [gt.name, gt.level]));

  const edgeSvg = layout.edges.map((e: LaidOutEdge) => {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (!s || !t) return '';
    const sx = s.x + ox + s.width;
    const sy = s.y + oy + s.height / 2;
    const tx = t.x + ox;
    const ty = t.y + oy + t.height / 2;
    const mx = (sx + tx) / 2;
    return `<path d="M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}" stroke="#94a3b8" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>`;
  }).join('\n');

  const nodeSvg = layout.nodes.map((n: LaidOutNode) => {
    const x = n.x + ox;
    const y = n.y + oy;
    const level = typeMap.get(n.data.type) ?? n.data.level;
    const fill = LEVEL_COLORS[level % LEVEL_COLORS.length];
    const label = n.data.name.length > 38 ? n.data.name.slice(0, 36) + '…' : n.data.name;
    const typeLabel = n.data.type || '';
    return `<g>
  <rect x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="8" fill="${fill}" stroke="#94a3b8" stroke-width="1"/>
  <text x="${x + n.width / 2}" y="${y + 30}" text-anchor="middle" font-size="13" font-weight="600" font-family="system-ui,sans-serif" fill="#1e293b">${escXml(label)}</text>
  <text x="${x + n.width / 2}" y="${y + 52}" text-anchor="middle" font-size="11" font-family="system-ui,sans-serif" fill="#64748b">${escXml(typeLabel)}</text>
</g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8"/>
  </marker>
</defs>
${edgeSvg}
${nodeSvg}
</svg>`;
}

function compileGoalsAndShow(): void {
  const yamlText = goalsSource.value;
  status.classList.remove('ready', 'err');
  status.classList.add('muted');
  status.textContent = 'Rendering goals tree…';

  try {
    const parsed = yaml.load(yamlText) as unknown;
    const v = validateGoalTree(parsed);
    const warnings = v.warnings.map(w => `⚠ ${w.code}: ${w.message}`).join('\n');
    if (!v.valid) {
      const errText = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      goalsPreviewEl.innerHTML = `<pre style="color:#dc2626;padding:12px;white-space:pre-wrap;">${escXml(errText)}</pre>`;
      status.classList.add('err');
      status.classList.remove('muted', 'ready');
      status.textContent = `Goals: ${v.errors[0]?.message ?? 'validation failed'}`;
      return;
    }
    const layout = layoutGoalTree(parsed as GoalTree);
    const svgContent = goalsLayoutToSvg(layout, parsed as GoalTree);
    const warnHtml = warnings ? `<pre style="color:#b45309;font-size:11px;padding:4px 0;white-space:pre-wrap;">${escXml(warnings)}</pre>` : '';
    goalsPreviewEl.innerHTML = warnHtml + svgContent;
    status.classList.remove('muted', 'err');
    status.classList.add('ready');
    status.textContent = `OK · ${(parsed as GoalTree).goals?.length ?? 0} goals`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    goalsPreviewEl.innerHTML = `<pre style="color:#dc2626;padding:12px;white-space:pre-wrap;">${escXml(msg)}</pre>`;
    status.classList.add('err');
    status.classList.remove('muted', 'ready');
    status.textContent = `Goals parse error: ${msg.slice(0, 120)}`;
  }
}

async function compileAndShow(): Promise<void> {
  const yamlText = textarea.value;
  lastCompiledBpmnXml = null;
  syncExportButtonsAvailability();
  status.classList.remove('ready', 'err');
  status.classList.add('muted');
  status.textContent = 'Compiling…';

  const res = await fetch('/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      yaml: yamlText,
      layout: collectLayoutFromInputs(),
    }),
  });

  if (!res.ok) {
    const msg = await res.json().catch(() => ({ message: res.statusText, details: [] as string[] }));
    const detailText = `${msg.message as string}${(msg.details as string[]).length ? '\n• ' + (msg.details as string[]).join('\n• ') : ''}`;
    status.classList.add('err');
    status.textContent = detailText.slice(0, 2000);
    return;
  }

  const data = await res.json() as { xml: string; metrics?: Record<string, unknown> };
  const xml = data.xml;
  const v = getViewer();
  try {
    await v.importXML(xml);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    status.classList.add('err');
    status.classList.remove('muted', 'ready');
    status.textContent = `BPMN import failed: ${msg}`.slice(0, 2000);
    lastCompiledBpmnXml = null;
    return;
  }
  afterLayout(() => {
    fitDiagram(v);
    status.classList.remove('muted', 'err');
    status.classList.add('ready');
    status.textContent = `OK · ${Math.round(xml.length / 1024)} kB BPMN`;
    lastCompiledBpmnXml = xml;
    syncExportButtonsAvailability();
  });
}

function exportDiagramBpmn(): void {
  try {
    if (studioTab() === 'blocks') {
      status.classList.add('err');
      status.classList.remove('ready', 'muted');
      status.textContent = 'Switch to the BPMN tab to export BPMN XML.';
      return;
    }
    if (!lastCompiledBpmnXml) {
      status.classList.add('err');
      status.classList.remove('ready', 'muted');
      status.textContent = 'No compiled BPMN yet — rebuild the preview first.';
      return;
    }
    const base = guessExportBasenameFromYaml(textarea.value);
    downloadBlob(new Blob([lastCompiledBpmnXml], { type: 'application/xml;charset=utf-8' }), `${base}.bpmn`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    status.classList.add('err');
    status.classList.remove('ready', 'muted');
    status.textContent = `Export BPMN: ${msg}`.slice(0, 2000);
  }
}

async function exportDiagramSvg(): Promise<void> {
  try {
    if (studioTab() === 'blocks') {
      if (!lastBlocksSvgs?.length) {
        status.classList.add('err');
        status.classList.remove('ready', 'muted');
        status.textContent = 'No SVG preview yet — rebuild nested blocks first.';
        return;
      }
      const first = lastBlocksSvgs[0];
      const base = guessBlocksExportBasename(blocksSource.value);
      const suffix = lastBlocksSvgs.length > 1 ? '-sheet1' : '';
      downloadBlob(
        new Blob([first], { type: 'image/svg+xml;charset=utf-8' }),
        `${base}${suffix}.svg`,
      );
      return;
    }
    const v = getViewer();
    const { svg } = await v.saveSVG();
    const base = guessExportBasenameFromYaml(textarea.value);
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${base}.svg`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    status.classList.add('err');
    status.classList.remove('ready', 'muted');
    status.textContent = `Export SVG: ${msg}`.slice(0, 2000);
  }
}

async function exportDiagramPng(): Promise<void> {
  try {
    if (studioTab() === 'blocks') {
      if (!lastBlocksSvgs?.length) {
        status.classList.add('err');
        status.classList.remove('ready', 'muted');
        status.textContent = 'No SVG preview yet — rebuild nested blocks first.';
        return;
      }
      const blob = await rasterSvgStringToPngBlob(lastBlocksSvgs[0]);
      const base = guessBlocksExportBasename(blocksSource.value);
      const suffix = lastBlocksSvgs.length > 1 ? '-sheet1' : '';
      downloadBlob(blob, `${base}${suffix}.png`);
      return;
    }
    const v = getViewer();
    const { svg } = await v.saveSVG();
    const blob = await rasterSvgStringToPngBlob(svg);
    const base = guessExportBasenameFromYaml(textarea.value);
    downloadBlob(blob, `${base}.png`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    status.classList.add('err');
    status.classList.remove('ready', 'muted');
    status.textContent = `Export PNG: ${msg}`.slice(0, 2000);
  }
}

function currentBlocksCompileMode(): BlocksCompileUiMode {
  const v = blocksModeSelect.value;
  if (v === 'ascii' || v === 'markdown_table' || v === 'markdown_tables') {
    return v;
  }
  return 'ascii';
}

async function compileBlocksAndShow(): Promise<void> {
  if (studioTab() !== 'blocks') {
    return;
  }

  lastBlocksSvgs = null;
  blocksSvgHost.innerHTML = '';
  syncExportButtonsAvailability();

  status.classList.remove('ready', 'err');
  status.classList.add('muted');
  status.textContent = 'Rendering nested blocks…';

  let res: Response;
  try {
    res = await fetch('/api/blocks/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        mode: currentBlocksCompileMode(),
        source: blocksSource.value,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    status.classList.add('err');
    status.classList.remove('muted', 'ready');
    status.textContent = `Request failed: ${msg}`.slice(0, 2000);
    return;
  }

  if (!res.ok) {
    const msg = await res
      .json()
      .catch(() => ({ message: res.statusText, details: [] as string[] }));
    const detailText = `${msg.message as string}${(msg.details as string[]).length ? '\n• ' + (msg.details as string[]).join('\n• ') : ''}`;
    status.classList.add('err');
    status.classList.remove('muted', 'ready');
    status.textContent = detailText.slice(0, 2000);
    return;
  }

  const data = (await res.json()) as { svgs?: unknown };
  if (!Array.isArray(data.svgs) || !data.svgs.every((x) => typeof x === 'string')) {
    status.classList.add('err');
    status.classList.remove('muted', 'ready');
    status.textContent = 'Nested blocks API returned an invalid response.';
    return;
  }

  const svgs = data.svgs.filter((s): s is string => typeof s === 'string' && s.length > 0);
  if (svgs.length === 0) {
    status.classList.add('err');
    status.classList.remove('muted', 'ready');
    status.textContent = 'Nested blocks API returned no SVG output.';
    return;
  }

  blocksSvgHost.innerHTML = svgs
    .map(
      (svg, i) =>
        `<div class="blocks-svg-sheet" role="img" aria-label="Nested blocks sheet ${i + 1} of ${svgs.length}">${svg}</div>`,
    )
    .join('');

  lastBlocksSvgs = svgs;
  syncExportButtonsAvailability();
  status.classList.remove('muted', 'err');
  status.classList.add('ready');
  const kb = Math.round(svgs.reduce((a, s) => a + s.length, 0) / 1024);
  status.textContent = `OK · ${svgs.length} SVG sheet(s), ~${kb} kB`;
}

function debouncedBpmn(ms: number): () => void {
  let t = 0;
  return (): void => {
    window.clearTimeout(t);
    t = window.setTimeout(() => void compileAndShow(), ms);
  };
}

function debouncedNestedBlocks(ms: number): () => void {
  let t = 0;
  return (): void => {
    window.clearTimeout(t);
    t = window.setTimeout(() => void compileBlocksAndShow(), ms);
  };
}

function debouncedGoals(ms: number): () => void {
  let t = 0;
  return (): void => {
    window.clearTimeout(t);
    t = window.setTimeout(() => compileGoalsAndShow(), ms);
  };
}

const debouncedCompile = debouncedBpmn(520);
const debouncedBlocksCompile = debouncedNestedBlocks(620);
const debouncedGoalsCompile = debouncedGoals(520);

tabBpmn.addEventListener('click', () => {
  setStudioTab('bpmn');
  void compileAndShow();
});

tabBlocks.addEventListener('click', () => {
  setStudioTab('blocks');
  void compileBlocksAndShow();
});

tabGoals.addEventListener('click', () => {
  setStudioTab('goals');
  compileGoalsAndShow();
});

blocksModeSelect.addEventListener('change', () => {
  const v = blocksModeSelect.value;
  if (v === 'ascii' || v === 'markdown_table' || v === 'markdown_tables') {
    persistBlocksMode(v);
  }
  lastBlocksSvgs = null;
  syncExportButtonsAvailability();
  debouncedBlocksCompile();
});

const layoutFieldsRoot = document.querySelector('#layout-fields-root');
function isLayoutNumberInput(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement && t.type === 'number' && Boolean(t.closest('#layout-fields-root'));
}

layoutFieldsRoot?.addEventListener('input', (ev) => {
  if (studioTab() !== 'bpmn') return;
  if (isLayoutNumberInput(ev.target)) {
    lastCompiledBpmnXml = null;
    syncExportButtonsAvailability();
    debouncedCompile();
  }
});
layoutFieldsRoot?.addEventListener('change', (ev) => {
  if (studioTab() !== 'bpmn') return;
  if (isLayoutNumberInput(ev.target)) {
    lastCompiledBpmnXml = null;
    syncExportButtonsAvailability();
    debouncedCompile();
  }
});

textarea.addEventListener('input', () => {
  lastCompiledBpmnXml = null;
  syncExportButtonsAvailability();
  if (studioTab() === 'bpmn') {
    debouncedCompile();
  }
});

blocksSource.addEventListener('input', () => {
  lastBlocksSvgs = null;
  syncExportButtonsAvailability();
  if (studioTab() === 'blocks') {
    debouncedBlocksCompile();
  }
});

goalsSource.addEventListener('input', () => {
  if (studioTab() === 'goals') {
    debouncedGoalsCompile();
  }
});

btnCompile.addEventListener('click', () => {
  if (studioTab() === 'blocks') {
    void compileBlocksAndShow();
  } else if (studioTab() === 'goals') {
    compileGoalsAndShow();
  } else {
    void compileAndShow();
  }
});

btnReset.addEventListener('click', () => {
  if (studioTab() === 'blocks') {
    lastBlocksSvgs = null;
    const mode = currentBlocksCompileMode();
    if (mode === 'ascii') {
      blocksSource.value = nestedBlocksAscii.trimStart();
    } else if (mode === 'markdown_table') {
      blocksSource.value = SAMPLE_MARKDOWN_SINGLE_TABLE;
    } else {
      blocksSource.value = blocksTablesMarkdown.trimStart();
    }
    void compileBlocksAndShow();
  } else if (studioTab() === 'goals') {
    goalsSource.value = initialGoalsYaml.trimStart();
    compileGoalsAndShow();
  } else {
    lastCompiledBpmnXml = null;
    textarea.value = initialYaml.trimStart();
    applyDefaultLayoutInputs();
    debouncedCompile();
  }
});

btnLayoutReset.addEventListener('click', () => {
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
    /* noop */
  }
  lastCompiledBpmnXml = null;
  applyDefaultLayoutInputs();
  syncExportButtonsAvailability();
  if (studioTab() === 'bpmn') {
    debouncedCompile();
  }
});

btnLayoutSave.addEventListener('click', () => {
  saveLayoutToStorage(collectLayoutFromInputs());
  btnLayoutSave.textContent = 'Saved';
  btnLayoutSave.disabled = true;
  window.setTimeout(() => {
    btnLayoutSave.textContent = 'Save as defaults';
    btnLayoutSave.disabled = false;
  }, 1500);
});

btnExportBpmn.addEventListener('click', () => exportDiagramBpmn());
btnExportSvg.addEventListener('click', () => void exportDiagramSvg());
btnExportPng.addEventListener('click', () => void exportDiagramPng());

btnOpen.addEventListener('click', () => pickFile.click());

pickFile.addEventListener('change', () => {
  const file = pickFile.files?.[0];
  pickFile.value = '';
  if (!file) return;
  const reader = new FileReader();
  const isGoalsFile = file.name.endsWith('.goals.transitrix.yaml');
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      if (isGoalsFile) {
        setStudioTab('goals');
        goalsSource.value = reader.result;
        compileGoalsAndShow();
      } else if (studioTab() === 'blocks') {
        lastBlocksSvgs = null;
        blocksSource.value = reader.result;
        syncExportButtonsAvailability();
        void compileBlocksAndShow();
      } else {
        lastCompiledBpmnXml = null;
        textarea.value = reader.result;
        syncExportButtonsAvailability();
        debouncedCompile();
      }
    }
  };
  reader.readAsText(file, 'utf8');
});

function bindCompileShortcut(textareaEl: HTMLTextAreaElement, run: () => void): void {
  textareaEl.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'enter') {
      ev.preventDefault();
      void run();
    }
  });
}

bindCompileShortcut(textarea, () => void compileAndShow());
bindCompileShortcut(blocksSource, () => void compileBlocksAndShow());
bindCompileShortcut(goalsSource, () => compileGoalsAndShow());

void compileAndShow();
