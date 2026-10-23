import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import type * as vscode from 'vscode';
import type { DiagramFrameOpts } from '../extension/src/diagram-frame.js';

const host = vi.hoisted(() => ({
  files: new Map<string, string>(),
  receive: undefined as undefined | ((message: unknown) => Promise<void>),
  dispose: undefined as undefined | (() => void),
  frame: undefined as DiagramFrameOpts | undefined,
  openTextDocument: vi.fn(),
  scan: vi.fn(),
  webview: { html: '' },
}));

function uri(fsPath: string) {
  return { fsPath, toString: () => pathToFileURL(fsPath).href };
}

vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => uri(p),
    parse: (p: string) => uri(fileURLToPath(p)),
    joinPath: (base: { fsPath: string }, ...parts: string[]) => uri(path.join(base.fsPath, ...parts)),
  },
  FileType: { File: 1, Directory: 2 },
  ViewColumn: { Beside: 2 },
  workspace: {
    workspaceFolders: [],
    openTextDocument: host.openTextDocument,
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
    fs: {
      readDirectory: async (root: { fsPath: string }) => [...host.files.keys()]
        .filter(p => path.dirname(p) === root.fsPath).map(p => [path.basename(p), 1]),
      readFile: async (file: { fsPath: string }) => {
        const text = host.files.get(file.fsPath);
        if (text === undefined) throw new Error('File not found');
        return Buffer.from(text);
      },
    },
  },
  window: {
    createWebviewPanel: () => ({
      title: '', reveal: vi.fn(),
      onDidDispose: (callback: () => void) => { host.dispose = callback; },
      webview: {
        get html() { return host.webview.html; },
        set html(value: string) { host.webview.html = value; },
        onDidReceiveMessage: (callback: typeof host.receive) => { host.receive = callback; },
      },
    }),
  },
}));
vi.mock('../extension/src/compliance-scan.js', () => ({ scanComplianceCanon: host.scan }));
vi.mock('../extension/src/diagram-frame.js', () => ({
  OPEN_THEME_COMMAND: 'theme',
  buildDiagramFrame: (frame: DiagramFrameOpts) => {
    host.frame = frame;
    return `${frame.svgContent}${frame.interactive?.controlsPanel ?? ''}`;
  },
}));

import { ProcessBlueprintPreview } from '../extension/src/process-blueprint-preview.js';

const sketch = { id: 'STAGE-SKETCH-1', name: 'Sketch label', goal: 'Sketch goal', result: 'Sketch result' };
const processColumn = { id: 'PROCESS-RECEIVE-1' };
function document(root: string, stages: object[], compliance = true) {
  const fileName = path.join(root, 'canon', 'views', 'sample.process-blueprint.transitrix.yaml');
  const text = yaml.dump({
    notation: 'process-blueprint',
    process_blueprint: {
      id: 'PROCESS_BLUEPRINT-SAMPLE-1', name: 'Synthetic blueprint',
      stages, lane_config: { compliance },
    },
  });
  return { uri: uri(fileName), fileName, getText: () => text } as vscode.TextDocument;
}
function catalog(root: string, name: string) {
  host.files.set(path.join(root, 'canon', 'elements', 'process.yaml'), yaml.dump({
    notation: 'process', id: processColumn.id, name, goal: 'Receive goal', result: 'Receive result',
    flow: { steps: [{ id: 'STEP-INLINE-1' }] },
  }));
  host.files.set(path.join(root, 'canon', 'elements', 'step.yaml'), yaml.dump({
    notation: 'step', id: 'STEP-PROMOTED-1', process: processColumn.id,
  }));
}
async function toggle(kind: string, id = '', visible = true, value?: number) {
  await host.receive!({ type: 'transitrix:bp-toggle', kind, id, visible, value });
  expect(host.frame?.errorMsg).toBe('');
}
function svg() { return host.frame!.svgContent!; }
function controls() { return host.frame!.interactive!.controlsPanel; }

beforeEach(() => {
  host.files.clear();
  host.openTextDocument.mockReset();
  host.scan.mockReset().mockImplementation(async (file?: { fsPath: string }) => ({
    codex: [],
    requirements: [
      { id: 'REQ-INLINE-1', derived_from: ['LAW-INLINE-1'] },
      { id: 'REQ-PROMOTED-1', derived_from: ['LAW-PROMOTED-1'] },
      { id: 'REQ-UNRESOLVED-1', derived_from: ['LAW-UNRESOLVED-1'] },
    ],
    assertions: file ? [
      { about: 'REQ-INLINE-1', status: 'compliant', realised_via: ['STEP-INLINE-1'] },
      { about: 'REQ-PROMOTED-1', status: 'compliant', realised_via: ['STEP-PROMOTED-1'] },
      { about: 'REQ-UNRESOLVED-1', status: 'compliant', realised_via: ['STEP-MISSING-1'] },
    ] : [],
  }));
  host.frame = undefined;
  host.webview.html = '';
});

describe('Process Blueprint interactive rerender', () => {
  it.each([false, true])('retains catalog names and STEP joins with mixed sketch columns=%s', async mixed => {
    const root = path.resolve('synthetic-model-a');
    catalog(root, 'Receive orders');
    const doc = document(root, mixed ? [processColumn, sketch] : [processColumn]);
    const preview = new ProcessBlueprintPreview();
    await preview.showOrReveal(doc);
    expect(host.frame?.errorMsg).toBe('');
    const initial = svg();
    expect(initial).toContain('Receive orders');
    expect(initial).toContain('data-chip-law="LAW-INLINE-1"');
    expect(initial).toContain('data-chip-law="LAW-PROMOTED-1"');
    expect(initial).not.toContain('data-chip-law="LAW-UNRESOLVED-1"');
    for (let i = 0; i < 2; i++) {
      await toggle('row', 'goal', false);
      expect(svg()).not.toContain('Receive goal');
      expect(svg()).toContain('Receive orders');
      expect(svg()).toContain('data-chip-law="LAW-INLINE-1"');
      await toggle('column', processColumn.id, false);
      expect(svg()).not.toContain('Receive orders');
      expect(controls()).toContain('Receive orders');
      await toggle('column-width', '', true, 310);
      expect(svg()).not.toContain('Receive orders');
      if (mixed) expect(svg()).toContain('Sketch label');
      await toggle('column', processColumn.id, true);
      expect(svg()).toContain('Receive orders');
      expect(svg()).toContain('width="310"');
      expect(svg()).toContain('data-chip-law="LAW-PROMOTED-1"');
      expect(svg()).not.toContain('Receive goal');
      await toggle('row', 'goal', true);
      await toggle('column-width', '', true, 220);
      expect(svg()).toBe(initial);
    }
    for (const [owner] of host.scan.mock.calls) expect(owner.toString()).toBe(doc.uri.toString());
    expect(host.openTextDocument).not.toHaveBeenCalled();
    await preview.refreshSaved(doc);
    expect(svg()).toBe(initial);
  });

  it('keeps authored sketch labels, visibility and cached unsaved content', async () => {
    const doc = document(path.resolve('synthetic-sketch'), [sketch], false);
    const preview = new ProcessBlueprintPreview();
    await preview.showOrReveal(doc);
    const initial = svg();
    doc.getText = () => 'not the cached preview';
    await toggle('row', 'result', false);
    expect(svg()).toContain('Sketch label');
    expect(svg()).not.toContain('Sketch result');
    await toggle('column', sketch.id, false);
    await toggle('column-width', '', true, 300);
    expect(svg()).not.toContain('Sketch label');
    expect(controls()).toContain('Sketch label');
    await toggle('column', sketch.id, true);
    expect(svg()).not.toContain('Sketch result');
    await toggle('row', 'result', true);
    await toggle('column-width', '', true, 220);
    expect(svg()).toBe(initial);
    expect(host.openTextDocument).not.toHaveBeenCalled();
  });

  it('uses the new owning canon after switching documents and reopening the panel', async () => {
    const a = path.resolve('synthetic-model-a');
    const b = path.resolve('synthetic-model-b');
    catalog(a, 'First catalogue');
    catalog(b, 'Second catalogue');
    const first = document(a, [processColumn]);
    const second = document(b, [processColumn]);
    const preview = new ProcessBlueprintPreview();
    await preview.showOrReveal(first);
    await toggle('column', processColumn.id, false);
    await preview.showOrReveal(second);
    await toggle('column-width', '', true, 280);
    expect(svg()).toContain('Second catalogue');
    expect(svg()).not.toContain('First catalogue');
    host.dispose!();
    expect(preview.isShowingDocument(second.uri)).toBe(false);
    await preview.showOrReveal(first);
    await toggle('row', 'result', false);
    expect(svg()).toContain('First catalogue');
    expect(svg()).not.toContain('Second catalogue');
  });

  it('does not replace disposed panel content when an interactive render finishes', async () => {
    const root = path.resolve('synthetic-disposal');
    catalog(root, 'Receive orders');
    const preview = new ProcessBlueprintPreview();
    await preview.showOrReveal(document(root, [processColumn]));
    const previousHtml = host.webview.html;
    let finishScan!: (value: unknown) => void;
    let startedScan!: () => void;
    const started = new Promise<void>(resolve => { startedScan = resolve; });
    host.scan.mockImplementationOnce(() => {
      startedScan();
      return new Promise(resolve => { finishScan = resolve; });
    });
    const rendering = toggle('column-width', '', true, 300);
    await started;
    host.dispose!();
    finishScan({ codex: [], requirements: [], assertions: [] });
    await rendering;
    expect(host.webview.html).toBe(previousHtml);
  });

  it('preserves missing PROCESS fallback and file-scope diagnostics', async () => {
    const doc = document(path.resolve('synthetic-missing'), [
      { id: 'PROCESS-MISSING-1' }, sketch,
    ]);
    const preview = new ProcessBlueprintPreview();
    await preview.showOrReveal(doc);
    const warnings = host.frame!.warnings;
    expect(host.frame!.errorMsg).toBe('');
    expect(svg()).toContain('PROCESS-MISSING-1');
    expect(svg()).not.toContain('Restated name');
    await toggle('column-width', '', true, 300);
    expect(svg()).toContain('PROCESS-MISSING-1');
    expect(svg()).toContain('Sketch label');
    expect(host.frame!.warnings).toEqual(warnings);
  });

  it('keeps validation errors through interactive rerenders', async () => {
    const preview = new ProcessBlueprintPreview();
    await preview.showOrReveal(document(path.resolve('synthetic-invalid'), [
      { id: 'PROCESS-MISSING-1', name: 'Restated name' },
    ]));
    const error = host.frame!.errorMsg;
    expect(error).toContain('BP-013');
    await host.receive!({ type: 'transitrix:bp-toggle', kind: 'column-width', value: 300 });
    expect(host.frame!.errorMsg).toBe(error);
  });
});
