/**
 * Shared helpers for the extension-e2e harness (transitrix-hq#143, hold 6).
 *
 * Runs *inside* the real VS Code Extension Development Host (launched by
 * @vscode/test-electron — see ../runTest.ts). This file and the extension
 * under test both `require('vscode')` inside the same Extension Host
 * process, so they share the same `vscode` module singleton — patching
 * `vscode.window.createWebviewPanel` / `showSaveDialog` here is visible to
 * the extension's own calls to those same functions. That is the mechanism
 * this harness relies on throughout: there is no separate mock, no reach
 * into extension internals — only monkey-patching of the shared, real
 * `vscode` API surface.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export const WORKSPACE_ROOT = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
if (!WORKSPACE_ROOT) {
  throw new Error('extension-e2e: no workspace folder open — launchArgs must pass the fixtures folder.');
}

export function fixturePath(...segments: string[]): string {
  return path.join(WORKSPACE_ROOT!, ...segments);
}

/**
 * Explicitly activates the extension under test and waits for it to finish,
 * rather than relying on its `workspaceContains:*` activation events firing
 * (and completing) before the first test's `openFixture()` runs.
 *
 * `workspaceContains:*` activation is a background glob scan VS Code kicks
 * off once the window is ready — there is no guarantee it has completed, or
 * even started, by the time `extensionTestsPath` (this suite) begins
 * running. Observed empirically: without this, the very first test in a
 * fresh test-host run reliably got 0 webview panels (the extension's
 * `onDidChangeActiveTextEditor` listener wasn't registered yet when
 * `openFixture()`'s `showTextDocument()` fired the event), while later
 * tests in the same run passed once activation had caught up. Calling
 * `.activate()` directly is idempotent (VS Code resolves the same promise
 * for an already-active/activating extension) and removes the race outright
 * rather than papering over it with a fixed delay.
 */
export async function ensureExtensionActivated(): Promise<void> {
  const ext = vscode.extensions.getExtension('transitrix.transitrix-studio');
  if (!ext) {
    throw new Error('extension-e2e: transitrix.transitrix-studio extension not found in the test host.');
  }
  if (!ext.isActive) await ext.activate();
}

/** Generic poll — used because several previews render asynchronously (webview round trip). */
export async function waitFor(
  predicate: () => boolean,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const { timeoutMs = 10000, intervalMs = 100, label = 'condition' } = opts;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() > deadline) {
      throw new Error(`extension-e2e: timed out waiting for ${label} (${timeoutMs}ms)`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Captures every WebviewPanel created while `fn` runs, by patching
 * `vscode.window.createWebviewPanel` for the duration of the call. Restores
 * the original afterwards regardless of outcome.
 *
 * The patch stays installed for up to `settleMs` past `fn()` resolving, not
 * just for the literal duration of the call: the extension's own
 * auto-open-preview path (`autoOpenPreviewForDocument`, wired off
 * `onDidChangeActiveTextEditor`) is invoked fire-and-forget (`void
 * autoOpenPreviewForDocument(...)`) — `showTextDocument()` resolves before
 * that listener has necessarily created its panel. Without this wait, every
 * surface raced the assertion and failed with "got 0 panels" regardless of
 * whether the preview actually rendered.
 */
export async function captureWebviewPanels<T>(
  fn: () => Promise<T>,
  opts: { settleMs?: number } = {},
): Promise<{ result: T; panels: vscode.WebviewPanel[] }> {
  // 15s, not a few hundred ms: `autoOpenPreviewForDocument` runs
  // fire-and-forget off `onDidChangeActiveTextEditor` (see extension.ts) —
  // `showTextDocument()` resolving does not mean that listener has even
  // started, let alone reached its `createWebviewPanel` call. Measured
  // empirically: with a short window here, every surface raced this wait,
  // returned 0 panels, and the *actual* panel showed up during the next
  // test's window instead (visible as "Cannot read properties of undefined
  // (reading 'webview')" / "Webview is disposed" rejections logged a test
  // or two later, once this test's own `closeAllEditors()` had already torn
  // the panel down mid-open).
  const { settleMs = 15000 } = opts;
  const panels: vscode.WebviewPanel[] = [];
  const original = vscode.window.createWebviewPanel;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vscode.window as any).createWebviewPanel = (...args: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const panel = (original as any).apply(vscode.window, args);
    panels.push(panel);
    return panel;
  };
  try {
    const result = await fn();
    await waitFor(() => panels.length > 0, { timeoutMs: settleMs, label: 'a webview panel to be created' }).catch(() => undefined);
    return { result, panels };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.window as any).createWebviewPanel = original;
  }
}

/**
 * Redirects `vscode.window.showSaveDialog` to always resolve with a fixed
 * target path for the duration of `fn` — there is no human to click through
 * the native save dialog in a headless run. Restores the original after.
 */
export async function withSaveDialogTarget<T>(targetFsPath: string, fn: () => Promise<T>): Promise<T> {
  const original = vscode.window.showSaveDialog;
  vscode.window.showSaveDialog = (async () => vscode.Uri.file(targetFsPath)) as typeof vscode.window.showSaveDialog;
  try {
    return await fn();
  } finally {
    vscode.window.showSaveDialog = original;
  }
}

export interface CapturedMessage {
  [key: string]: unknown;
}

/** Subscribes to a webview's postMessage traffic and returns the collected list + a dispose fn. */
export function captureMessages(webview: vscode.Webview): { messages: CapturedMessage[]; dispose: () => void } {
  const messages: CapturedMessage[] = [];
  const sub = webview.onDidReceiveMessage((m: unknown) => {
    messages.push(m as CapturedMessage);
  });
  return { messages, dispose: () => sub.dispose() };
}

/**
 * Wraps `webview.postMessage` (host → webview direction) to record every
 * outgoing message — used to capture the exact SVG payload the extension
 * hands to the webview canvas rasterizer (`transitrix:renderPng`), so the
 * PNG-engine comparison feeds the *same* SVG bytes into both the old
 * (resvg) and new (webview canvas) paths.
 */
export function captureOutgoing(webview: vscode.Webview): { sent: CapturedMessage[]; dispose: () => void } {
  const sent: CapturedMessage[] = [];
  const original = webview.postMessage.bind(webview);
  webview.postMessage = ((msg: unknown) => {
    sent.push(msg as CapturedMessage);
    return original(msg);
  }) as typeof webview.postMessage;
  return { sent, dispose: () => { webview.postMessage = original; } };
}

/** Opens a fixture file and makes it the active editor (mirrors real user action; triggers auto-open-preview). */
export async function openFixture(relPath: string): Promise<vscode.TextDocument> {
  const uri = vscode.Uri.file(fixturePath(relPath));
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
  return doc;
}

/** True once the panel's webview HTML contains a rendered `<svg` (synchronous-render previews). */
export function htmlHasSvg(panel: vscode.WebviewPanel): boolean {
  return /<svg[\s>]/i.test(panel.webview.html);
}

export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

/** Records showErrorMessage/showWarningMessage calls for the duration of `fn`, without suppressing the dialog's default (auto-dismissed, no button) return. */
export async function captureNotifications<T>(fn: () => Promise<T>): Promise<{ result: T; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const origError = vscode.window.showErrorMessage;
  const origWarn = vscode.window.showWarningMessage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vscode.window as any).showErrorMessage = (msg: string, ...rest: unknown[]) => {
    errors.push(msg);
    return (origError as unknown as (...a: unknown[]) => Promise<undefined>).apply(vscode.window, [msg, ...rest]);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vscode.window as any).showWarningMessage = (msg: string, ...rest: unknown[]) => {
    warnings.push(msg);
    return (origWarn as unknown as (...a: unknown[]) => Promise<undefined>).apply(vscode.window, [msg, ...rest]);
  };
  try {
    const result = await fn();
    return { result, errors, warnings };
  } finally {
    vscode.window.showErrorMessage = origError;
    vscode.window.showWarningMessage = origWarn;
  }
}

// Passed explicitly via extensionTestsEnv (see ../runTest.ts) rather than
// derived from the workspace path — the workspace folder is an
// implementation detail of how fixtures are opened, not a stable anchor for
// where captured artefacts belong.
export const CAPTURE_DIR = process.env.TX_E2E_CAPTURE_DIR;
if (!CAPTURE_DIR) {
  throw new Error('extension-e2e: TX_E2E_CAPTURE_DIR not set — runTest.ts must pass it via extensionTestsEnv.');
}

export function ensureCaptureDir(): void {
  fs.mkdirSync(CAPTURE_DIR!, { recursive: true });
}
