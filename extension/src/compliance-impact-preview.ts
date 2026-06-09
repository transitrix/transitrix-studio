import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { generateWebviewCss, type ThemeId } from '../../packages/diagrams/src/theme/index.js';
import {
  buildImpactMatrix,
  type ImpactColumn,
  type ImpactViewConfig,
  type ImpactMatrix,
  type ImpactCell,
} from '../../packages/diagrams/src/compliance/impact.js';
import type { AssertionStatus } from '../../packages/diagrams/src/assertion/types.js';
import type { IndexRequirement } from '../../packages/diagrams/src/compliance/types.js';
import { genNonce } from './preview-controls.js';
import { scanComplianceCanon, openComplianceFile } from './compliance-scan.js';
import type { ScannedCanon } from './compliance-scan.js';

// Compliance-impact matrix preview -- CV-2 (vkgeorgia/strategy#84).
//
// Renders the obligation x subject matrix (buildImpactMatrix ss5) as an in-IDE
// webview. Distinct from the Products x Requirements compliance-matrix preview
// (Phase 2): this view derives impact at the coarsest grain (REQUIREMENT x
// subject) from the canon ASSERTION artefacts, using an ImpactViewConfig.
//
// View config: looks for a workspace *.compliance-impact.view.yaml file.
// If none found, subjects.products is auto-filled from the canon scan and all
// other fields use the pinned defaults (consistent with COMPLIANCE_IMPACT_DEFAULTS
// in the library -- CV-1). Kept inline so CV-2 is independent of the CV-1 PR.
//
// Proposed-assertion affordance (F17, strategy#84): assertions with
// status:'proposed' are excluded from buildImpactMatrix by the allowedStatuses
// check (they are not admitted). For each (requirement, subject) pair that is a
// gap in the active matrix, the preview counts how many proposed assertions
// exist and surfaces "N pending (admission)" in the cell.
//
// Scripts enabled under strict nonce CSP (2026-06-02 posture call) -- only for
// the inline filter controls that postMessage to the host. Read-only preview.

// Defaults consistent with COMPLIANCE_IMPACT_DEFAULTS in the library (CV-1).
const DEFAULT_STATUSES: AssertionStatus[] = ['compliant', 'partial', 'non_compliant', 'under_review', 'n_a'];
const DEFAULT_ORDER_ROWS_BY = 'id' as const;
const DEFAULT_NO_OBLIGATION_LABEL = 'No mapped obligation (current model)';
const DEFAULT_NO_OBLIGATION_APPLIES_LABEL = 'No obligation applies';

const ADMITTED_STATUSES = new Set<string>(['compliant', 'partial', 'non_compliant', 'under_review', 'n_a']);
const ALL_STATUSES: AssertionStatus[] = ['compliant', 'partial', 'non_compliant', 'under_review', 'n_a'];
const ALL_SEVERITIES = ['high', 'medium', 'low'];

const STATUS_LABELS: Record<AssertionStatus, string> = {
  compliant: 'Compliant',
  partial: 'Partial',
  non_compliant: 'Non-compliant',
  under_review: 'Under review',
  n_a: 'N/A',
};

const OPEN_FILE_COMMAND = 'transitrixStudio.openComplianceFile';
const REFRESH_COMMAND = 'transitrixStudio.refreshComplianceImpact';

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** pending-assertion count key: requirement-id + subject-id. */
function pendingKey(about: string, subject: string): string {
  return about + '\x00' + subject;
}

/**
 * Count proposed (non-admitted) assertions per (requirement, subject) pair.
 * Returns a map of pendingKey -> count.
 */
function buildPendingIndex(canon: ScannedCanon): Map<string, number> {
  const pending = new Map<string, number>();
  for (const a of canon.assertions) {
    if (ADMITTED_STATUSES.has(a.status)) continue;
    const k = pendingKey(a.about, a.subject);
    pending.set(k, (pending.get(k) ?? 0) + 1);
  }
  return pending;
}

/**
 * Resolve the jurisdiction(s) for each requirement via derived_from -> codex.
 * Returns a map of requirement id -> sorted deduplicated jurisdictions.
 */
function buildJurisdictionIndex(
  requirements: IndexRequirement[],
  canon: ScannedCanon,
): Map<string, string[]> {
  const codexJurisdiction = new Map<string, string>();
  for (const c of canon.codex) {
    if (c.jurisdiction) codexJurisdiction.set(c.id, c.jurisdiction);
  }
  const out = new Map<string, string[]>();
  for (const r of requirements) {
    const js = new Set<string>();
    for (const codexId of r.derived_from ?? []) {
      const j = codexJurisdiction.get(codexId);
      if (j) js.add(j);
    }
    out.set(r.id, [...js].sort());
  }
  return out;
}

function collectAllJurisdictions(
  requirements: IndexRequirement[],
  jIndex: Map<string, string[]>,
): string[] {
  const out = new Set<string>();
  for (const r of requirements) {
    for (const j of jIndex.get(r.id) ?? []) out.add(j);
  }
  return [...out].sort();
}

function parseViewConfigRaw(raw: unknown): ImpactViewConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const top = raw as Record<string, unknown>;
  const v: Record<string, unknown> =
    'view' in top && top.view && typeof top.view === 'object' && !Array.isArray(top.view)
      ? (top.view as Record<string, unknown>)
      : top;
  if (!v.id || typeof v.id !== 'string') return null;
  if (!v.name || typeof v.name !== 'string') return null;
  const subjects =
    v.subjects && typeof v.subjects === 'object' && !Array.isArray(v.subjects)
      ? (v.subjects as Record<string, unknown>)
      : {};
  const obligations =
    v.obligations && typeof v.obligations === 'object' && !Array.isArray(v.obligations)
      ? (v.obligations as Record<string, unknown>)
      : {};
  const obFilter =
    obligations.filter && typeof obligations.filter === 'object' && !Array.isArray(obligations.filter)
      ? (obligations.filter as Record<string, unknown>)
      : null;
  const sd =
    v.status_display && typeof v.status_display === 'object' && !Array.isArray(v.status_display)
      ? (v.status_display as Record<string, unknown>)
      : {};
  const ec =
    v.empty_cells && typeof v.empty_cells === 'object' && !Array.isArray(v.empty_cells)
      ? (v.empty_cells as Record<string, unknown>)
      : {};
  return {
    id: v.id,
    name: v.name,
    description: typeof v.description === 'string' ? v.description : undefined,
    subjects: {
      products: Array.isArray(subjects.products)
        ? (subjects.products as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      processes: Array.isArray(subjects.processes)
        ? (subjects.processes as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
    },
    obligations: {
      include: Array.isArray(obligations.include)
        ? (obligations.include as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined,
      filter: obFilter
        ? {
            derived_from_codex: Array.isArray(obFilter.derived_from_codex)
              ? (obFilter.derived_from_codex as unknown[]).filter((x): x is string => typeof x === 'string')
              : undefined,
          }
        : undefined,
    },
    status_display: {
      show: Array.isArray(sd.show)
        ? (sd.show as unknown[]).filter((x): x is AssertionStatus => typeof x === 'string')
        : [...DEFAULT_STATUSES],
    },
    empty_cells: {
      no_obligation_label:
        typeof ec.no_obligation_label === 'string' ? ec.no_obligation_label : DEFAULT_NO_OBLIGATION_LABEL,
      no_obligation_applies_label:
        typeof ec.no_obligation_applies_label === 'string'
          ? ec.no_obligation_applies_label
          : DEFAULT_NO_OBLIGATION_APPLIES_LABEL,
    },
    order_rows_by: v.order_rows_by === 'name' ? 'name' : DEFAULT_ORDER_ROWS_BY,
  };
}

async function resolveViewConfig(canon: ScannedCanon): Promise<ImpactViewConfig> {
  const viewFiles = await vscode.workspace.findFiles(
    '**/*.compliance-impact.view.yaml',
    '**/node_modules/**',
    5,
  );
  for (const uri of viewFiles) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const raw = yaml.load(Buffer.from(bytes).toString('utf-8'));
      const cfg = parseViewConfigRaw(raw);
      if (cfg) return cfg;
    } catch {
      // Skip unreadable/unparseable files.
    }
  }
  // Auto-config: discover subjects from the canon.
  const productIds = canon.products.map(p => p.id).sort();
  return {
    id: 'auto',
    name: 'Compliance Impact (auto)',
    description:
      'Auto-generated from canon scan on ' +
      todayIso() +
      '. Add a *.compliance-impact.view.yaml to pin subjects and defaults.',
    subjects: { products: productIds, processes: [] },
    obligations: {},
    status_display: { show: [...DEFAULT_STATUSES] },
    empty_cells: {
      no_obligation_label: DEFAULT_NO_OBLIGATION_LABEL,
      no_obligation_applies_label: DEFAULT_NO_OBLIGATION_APPLIES_LABEL,
    },
    order_rows_by: DEFAULT_ORDER_ROWS_BY,
  };
}

interface ImpactFilter {
  statuses: Set<AssertionStatus>;
  severities: Set<string>;
  jurisdictions: Set<string>;
}

function defaultFilter(): ImpactFilter {
  return {
    statuses: new Set<AssertionStatus>(),
    severities: new Set<string>(),
    jurisdictions: new Set<string>(),
  };
}

function applyFilter(
  matrix: ImpactMatrix,
  filter: ImpactFilter,
  jIndex: Map<string, string[]>,
): { rows: IndexRequirement[]; columns: ImpactColumn[]; cells: ImpactCell[][] } {
  let rows = matrix.rows;

  if (filter.severities.size > 0) {
    rows = rows.filter(r => filter.severities.has(r.severity ?? ''));
  }
  if (filter.jurisdictions.size > 0) {
    rows = rows.filter(r => (jIndex.get(r.id) ?? []).some(j => filter.jurisdictions.has(j)));
  }

  const rowIdxMap = new Map(matrix.rows.map((r, i) => [r.id, i]));
  const colIndices = matrix.columns.map((_, i) => i);
  const filteredCells: ImpactCell[][] = rows.map(r => {
    const origRow = rowIdxMap.get(r.id)!;
    return colIndices.map(ci => matrix.cells[origRow][ci]);
  });

  return { rows, columns: matrix.columns, cells: filteredCells };
}

export class ComplianceImpactPreview {
  readonly panelTitle = 'Compliance Impact Matrix';
  private panel: vscode.WebviewPanel | undefined;
  private matrix: ImpactMatrix | undefined;
  private config: ImpactViewConfig | undefined;
  private canon: ScannedCanon | undefined;
  private pendingIndex = new Map<string, number>();
  private jIndex = new Map<string, string[]>();
  private filter: ImpactFilter = defaultFilter();

  constructor(private readonly extensionUri: vscode.Uri) {}

  async showOrReveal(): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'complianceImpactPreview',
        this.panelTitle,
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
          enableCommandUris: [OPEN_FILE_COMMAND, REFRESH_COMMAND],
        },
      );
      this.panel.webview.onDidReceiveMessage((m) => { void this.onMessage(m); });
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.matrix = undefined;
        this.config = undefined;
        this.canon = undefined;
      });
    } else {
      this.panel.reveal(vscode.ViewColumn.Active, false);
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.panel) return;
    this.panel.webview.html = this.buildLoadingHtml();

    const canon = await scanComplianceCanon();
    this.canon = canon;
    this.config = await resolveViewConfig(canon);
    this.pendingIndex = buildPendingIndex(canon);

    // Auto-fill subjects.products if the view config left it empty.
    const cfg = this.config;
    const subjectProducts =
      cfg.subjects.products && cfg.subjects.products.length > 0
        ? cfg.subjects.products
        : canon.products.map(p => p.id).sort();
    const effectiveConfig: ImpactViewConfig = {
      ...cfg,
      subjects: { ...cfg.subjects, products: subjectProducts },
    };

    this.matrix = buildImpactMatrix(
      {
        products: canon.products,
        requirements: canon.requirements,
        assertions: canon.assertions,
        codex: canon.codex,
      },
      effectiveConfig,
    );

    this.jIndex = buildJurisdictionIndex(this.matrix.rows, canon);
    this.render();
  }

  private async onMessage(m: {
    type?: string;
    statuses?: string[];
    severities?: string[];
    jurisdictions?: string[];
  }): Promise<void> {
    if (m?.type !== 'transitrix:impact-filter') return;
    this.filter = {
      statuses: new Set(
        (m.statuses ?? []).filter((s): s is AssertionStatus => (ALL_STATUSES as string[]).includes(s)),
      ),
      severities: new Set((m.severities ?? []).filter(s => ALL_SEVERITIES.includes(s))),
      jurisdictions: new Set(
        (m.jurisdictions ?? []).filter(j => typeof j === 'string' && j.length > 0),
      ),
    };
    this.render();
  }

  private render(): void {
    if (!this.panel || !this.matrix) return;
    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');
    this.panel.webview.html = this.buildHtml(themeId);
  }

  private buildLoadingHtml(): string {
    return `<!DOCTYPE html><html lang="en"><body style="padding:24px;font-family:sans-serif;color:#64748b">Scanning canon&#8230;</body></html>`;
  }

  private buildHtml(themeId: ThemeId): string {
    const nonce = genNonce();
    const matrix = this.matrix!;
    const config = this.config!;

    const { rows, columns, cells } = applyFilter(matrix, this.filter, this.jIndex);
    const allJurisdictions = collectAllJurisdictions(matrix.rows, this.jIndex);

    const totalGaps = matrix.cells.flat().filter(c => c.kind === 'gap').length;
    const totalPending = [...this.pendingIndex.values()].reduce((a, b) => a + b, 0);
    const pendingSummary =
      totalPending > 0 ? ' &middot; <strong>' + totalPending + '</strong> pending (admission)' : '';

    const empty = rows.length === 0 || columns.length === 0;
    const bodyHtml = empty ? this.emptyHtml(matrix) : this.gridHtml(rows, columns, cells, matrix.emptyLabels);

    const statusBoxes = ALL_STATUSES.map(
      s =>
        '<label class="ci-chip"><input type="checkbox" data-ci-status="' +
        s +
        '"' +
        (this.filter.statuses.has(s) ? ' checked' : '') +
        '> ' +
        escXml(STATUS_LABELS[s]) +
        '</label>',
    ).join('');
    const severityBoxes = ALL_SEVERITIES.map(
      s =>
        '<label class="ci-chip"><input type="checkbox" data-ci-severity="' +
        s +
        '"' +
        (this.filter.severities.has(s) ? ' checked' : '') +
        '> ' +
        escXml(s) +
        '</label>',
    ).join('');
    const jurisdictionRow = allJurisdictions.length
      ? '<span class="ci-filter-label">Jurisdiction</span>' +
        allJurisdictions
          .map(
            j =>
              '<label class="ci-chip"><input type="checkbox" data-ci-jurisdiction="' +
              escXml(j) +
              '"' +
              (this.filter.jurisdictions.has(j) ? ' checked' : '') +
              '> ' +
              escXml(j) +
              '</label>',
          )
          .join('')
      : '';

    const configLine =
      config.id === 'auto'
        ? 'Auto-config (add *.compliance-impact.view.yaml to pin)'
        : 'View: <code>' + escXml(config.id) + '</code>';

    return (
      '<!DOCTYPE html>\n' +
      '<html lang="en">\n' +
      '<head>\n' +
      '  <meta charset="UTF-8"/>\n' +
      '  <meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'nonce-' +
      nonce +
      '\';">\n' +
      '  <style>\n' +
      generateWebviewCss(themeId) +
      '\n' +
      IMPACT_CSS +
      '\n' +
      '  </style>\n' +
      '</head>\n' +
      '<body data-theme="' +
      escXml(themeId) +
      '">\n' +
      '  <div id="ci-toolbar">\n' +
      '    <div class="ci-title">Compliance Impact Matrix</div>\n' +
      '    <div class="ci-summary">' +
      rows.length +
      ' obligations &times; ' +
      columns.length +
      ' subjects &middot; <strong>' +
      totalGaps +
      '</strong> gaps' +
      pendingSummary +
      '</div>\n' +
      '    <div class="ci-config">' +
      configLine +
      '</div>\n' +
      '    <a href="command:' +
      REFRESH_COMMAND +
      '" class="ci-btn" title="Re-scan the workspace and reload view config">Refresh</a>\n' +
      '  </div>\n' +
      '  <div id="ci-filters">\n' +
      '    <span class="ci-filter-label">Status</span>' +
      statusBoxes +
      '\n' +
      '    <span class="ci-filter-label">Severity</span>' +
      severityBoxes +
      '\n' +
      '    ' +
      jurisdictionRow +
      '\n' +
      '  </div>\n' +
      '  ' +
      bodyHtml +
      '\n' +
      '  <script nonce="' +
      nonce +
      '">\n' +
      '(function () {\n' +
      "  var vscode = acquireVsCodeApi();\n" +
      "  function collect(attr) {\n" +
      "    var out = [];\n" +
      "    document.querySelectorAll('[data-ci-' + attr + ']').forEach(function (el) {\n" +
      "      if (el.checked) out.push(el.getAttribute('data-ci-' + attr));\n" +
      "    });\n" +
      "    return out;\n" +
      "  }\n" +
      "  document.querySelectorAll('[data-ci-status],[data-ci-severity],[data-ci-jurisdiction]').forEach(function (el) {\n" +
      "    el.addEventListener('change', function () {\n" +
      "      vscode.postMessage({\n" +
      "        type: 'transitrix:impact-filter',\n" +
      "        statuses: collect('status'),\n" +
      "        severities: collect('severity'),\n" +
      "        jurisdictions: collect('jurisdiction'),\n" +
      "      });\n" +
      "    });\n" +
      "  });\n" +
      '}());\n' +
      '  </script>\n' +
      '</body>\n' +
      '</html>'
    );
  }

  private emptyHtml(matrix: ImpactMatrix): string {
    if (matrix.rows.length === 0) {
      return '<div class="ci-empty"><p>No obligations found.</p><p>This view needs <code>notation: requirement</code> files in the workspace. None were found.</p></div>';
    }
    return '<div class="ci-empty"><p>No subjects in scope.</p><p>Add a <code>*.compliance-impact.view.yaml</code> with <code>subjects.products</code>, or add <code>notation: product</code> files to the workspace.</p></div>';
  }

  private gridHtml(
    rows: IndexRequirement[],
    columns: ImpactColumn[],
    cells: ImpactCell[][],
    emptyLabels: { no_obligation_label: string; no_obligation_applies_label: string },
  ): string {
    const head =
      '<tr>\n      <th class="ci-corner"></th>\n      ' +
      columns
        .map(col => '<th class="ci-col"><div class="ci-col-name">' + escXml(col.label) + '</div></th>')
        .join('') +
      '\n    </tr>';

    const bodyRows = rows
      .map((req, ri) => {
        const js = this.jIndex.get(req.id) ?? [];
        const jBadges = js
          .map(j => '<span class="ci-jur">' + escXml(j) + '</span>')
          .join('');
        const rowTitle = [
          req.id,
          req.severity ? 'severity: ' + req.severity : null,
          js.length ? 'jurisdiction: ' + js.join(', ') : null,
        ]
          .filter(Boolean)
          .join(' | ');
        const rowHead =
          '<th class="ci-row" title="' +
          escXml(rowTitle) +
          '">\n' +
          '        <div class="ci-row-id">' +
          escXml(req.id) +
          '</div>\n' +
          (req.name !== req.id
            ? '        <div class="ci-row-name">' + escXml(req.name) + '</div>\n'
            : '') +
          (req.severity
            ? '        <div class="ci-sev ci-sev-' +
              escXml(req.severity) +
              '">' +
              escXml(req.severity) +
              '</div>\n'
            : '') +
          '        ' +
          jBadges +
          '\n      </th>';

        const cellsHtml = columns
          .map((col, ci) => {
            const cell = cells[ri][ci];

            if (cell.kind === 'gap') {
              const pendingCount = this.pendingIndex.get(pendingKey(req.id, col.subjectId)) ?? 0;
              if (pendingCount > 0) {
                return (
                  '<td class="ci-cell ci-pending" title="' +
                  pendingCount +
                  ' assertion(s) pending admission for (' +
                  escXml(req.id) +
                  ', ' +
                  escXml(col.label) +
                  ')">\n' +
                  '              <span class="ci-badge-pending">' +
                  pendingCount +
                  ' pending</span>\n            </td>'
                );
              }
              return (
                '<td class="ci-cell ci-gap" title="' +
                escXml(emptyLabels.no_obligation_label) +
                '"></td>'
              );
            }

            if (cell.kind === 'n_a_only') {
              return (
                '<td class="ci-cell ci-na" title="' +
                escXml(emptyLabels.no_obligation_applies_label) +
                '">\n' +
                '              <span class="ci-badge ci-badge-na">N/A</span>\n            </td>'
              );
            }

            // Bound cell.
            const status = cell.status!;
            if (this.filter.statuses.size > 0 && !this.filter.statuses.has(status)) {
              return '<td class="ci-cell ci-filtered" title="Hidden by status filter"></td>';
            }

            const firstAssertion = cell.assertions[0];
            const fsPath = firstAssertion ? this.canon?.pathById.get(firstAssertion.id) : undefined;
            const metaParts = [
              STATUS_LABELS[status],
              firstAssertion?.assessed_at ? 'assessed ' + firstAssertion.assessed_at : null,
              firstAssertion?.next_review_at ? 'review by ' + firstAssertion.next_review_at : null,
              cell.assertions.length > 1 ? '+' + (cell.assertions.length - 1) + ' more' : null,
            ]
              .filter(Boolean)
              .join(' | ');

            const badge =
              '<span class="ci-badge ci-badge-' +
              status +
              '">' +
              escXml(STATUS_LABELS[status]) +
              '</span>';
            const inner = fsPath
              ? '<a class="ci-link" href="command:' +
                OPEN_FILE_COMMAND +
                '?' +
                encodeURIComponent(JSON.stringify([fsPath])) +
                '" title="' +
                escXml(metaParts) +
                '">' +
                badge +
                '</a>'
              : '<span title="' + escXml(metaParts) + '">' + badge + '</span>';

            return '<td class="ci-cell ci-' + status + '">' + inner + '</td>';
          })
          .join('');

        return '<tr>' + rowHead + cellsHtml + '</tr>';
      })
      .join('');

    return (
      '<div id="ci-grid-wrap"><table id="ci-grid"><thead>' +
      head +
      '</thead><tbody>' +
      bodyRows +
      '</tbody></table></div>'
    );
  }
}

const IMPACT_CSS = `
body { padding: 0; }
#ci-toolbar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--ts-border, #cbd5e1); flex-wrap: wrap; }
.ci-title { font-size: 14px; font-weight: 700; color: var(--ts-text, #0f172a); }
.ci-summary { font-size: 12px; color: var(--ts-text-muted, #64748b); }
.ci-summary strong { color: var(--ts-text, #0f172a); }
.ci-config { font-size: 11px; color: var(--ts-text-muted, #64748b); margin-left: auto; }
.ci-config code { background: var(--ts-bg-subtle, #f1f5f9); padding: 1px 4px; border-radius: 3px; }
.ci-btn { font-size: 11px; padding: 2px 10px; border-radius: 4px; color: var(--ts-text-muted, #64748b); text-decoration: none; border: 1px solid var(--ts-border, #cbd5e1); }
.ci-btn:hover { color: var(--ts-text, #0f172a); background: var(--ts-bg-elevated, #f1f5f9); }
#ci-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 16px; border-bottom: 1px solid var(--ts-border, #cbd5e1); font-size: 11px; }
.ci-filter-label { font-weight: 600; color: var(--ts-text, #0f172a); margin-left: 8px; }
.ci-filter-label:first-child { margin-left: 0; }
.ci-chip { display: inline-flex; align-items: center; gap: 4px; color: var(--ts-text-muted, #64748b); cursor: pointer; }
#ci-grid-wrap { overflow: auto; padding: 12px 16px 24px; }
#ci-grid { border-collapse: collapse; font-size: 12px; }
#ci-grid th, #ci-grid td { border: 1px solid var(--ts-border, #cbd5e1); }
.ci-corner { background: transparent; border: none; }
.ci-col { padding: 6px 10px; vertical-align: bottom; text-align: left; background: var(--ts-bg-subtle, #f1f5f9); min-width: 80px; max-width: 140px; }
.ci-col-name { font-weight: 600; color: var(--ts-text, #0f172a); font-size: 11px; word-break: break-all; }
.ci-row { padding: 6px 12px; text-align: left; background: var(--ts-bg-subtle, #f1f5f9); white-space: nowrap; position: sticky; left: 0; min-width: 160px; max-width: 260px; }
.ci-row-id { font-size: 11px; font-family: var(--vscode-editor-font-family, monospace); color: var(--ts-text-muted, #64748b); }
.ci-row-name { font-weight: 600; color: var(--ts-text, #0f172a); font-size: 12px; white-space: normal; }
.ci-sev { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
.ci-sev-high { color: #b91c1c; } .ci-sev-medium { color: #b45309; } .ci-sev-low { color: #2563eb; }
.ci-jur { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 10px; color: var(--ts-text-muted, #64748b); background: var(--ts-bg-elevated, #e2e8f0); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; margin-right: 2px; }
.ci-cell { width: 110px; height: 40px; text-align: center; vertical-align: middle; }
.ci-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.ci-link { text-decoration: none; }
.ci-gap { background: repeating-linear-gradient(45deg, transparent, transparent 5px, var(--ts-bg-subtle, #f1f5f9) 5px, var(--ts-bg-subtle, #f1f5f9) 10px); }
.ci-pending { background: #fef9c3; border: 1px dashed #b45309 !important; }
.ci-badge-pending { display: inline-block; padding: 2px 6px; border-radius: 8px; font-size: 10px; font-weight: 600; color: #b45309; background: #fef9c3; }
.ci-filtered { background: var(--ts-bg-subtle, #f8fafc); opacity: 0.35; }
.ci-na { background: var(--ts-bg-subtle, #f1f5f9); }
.ci-badge-na { color: var(--ts-text-muted, #64748b); background: var(--ts-bg-subtle, #f1f5f9); }
.ci-compliant { background: var(--ts-status-success-bg, #d1fae5); }
.ci-badge-compliant { color: var(--ts-status-success-fg, #065f46); background: var(--ts-status-success-bg, #d1fae5); }
.ci-partial { background: var(--ts-status-warning-bg, #fef9c3); }
.ci-badge-partial { color: var(--ts-status-warning-fg, #854d0e); background: var(--ts-status-warning-bg, #fef9c3); }
.ci-non_compliant { background: var(--ts-status-error-bg, #fee2e2); }
.ci-badge-non_compliant { color: var(--ts-status-error-fg, #991b1b); background: var(--ts-status-error-bg, #fee2e2); }
.ci-under_review { background: var(--ts-status-info-bg, #e0f2fe); }
.ci-badge-under_review { color: var(--ts-status-info-fg, #0c4a6e); background: var(--ts-status-info-bg, #e0f2fe); }
.ci-empty { padding: 40px 24px; color: var(--ts-text-muted, #64748b); max-width: 640px; }
.ci-empty code { background: var(--ts-bg-subtle, #f1f5f9); padding: 1px 4px; border-radius: 3px; }
`;