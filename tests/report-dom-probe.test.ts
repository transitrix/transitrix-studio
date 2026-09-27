import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';

vi.mock('vscode', () => ({ workspace: { workspaceFolders: [{ uri: { fsPath: '/fixtures' } }] } }));
vi.hoisted(() => { process.env.TX_E2E_CAPTURE_DIR = '/captures'; });
import { reportDom } from '../extension/test-e2e/helpers.js';

function webview() {
  const listeners = new Set<(message: unknown) => void>();
  const result = { text: 'report' };
  const panel = {
    visible: false,
    viewType: 'requirementChain-matrix',
    reveal: vi.fn(() => { panel.visible = true; }),
    webview: {
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
      postMessage: vi.fn(async (_message: Record<string, unknown>) => true),
    },
  };
  const respond = (message: Record<string, unknown>) => {
    for (const listener of listeners) listener({ ...message, value: result });
  };
  return { panel, target: panel as unknown as vscode.WebviewPanel, listeners, result, respond };
}

describe('report DOM probe lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reveals a report hidden by a source edit while a read is pending', async () => {
    const { panel, target, listeners, result, respond } = webview();
    panel.webview.postMessage.mockImplementationOnce(async () => {
      panel.visible = false;
      return true;
    }).mockImplementation(async message => {
      if (panel.visible) respond(message);
      return true;
    });
    const pending = reportDom(target);
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toEqual(result);
    expect(panel.reveal).toHaveBeenCalledTimes(2);
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restores visibility for an action without dispatching that action twice', async () => {
    const { panel, target, respond, listeners } = webview();
    let action: Record<string, unknown> | undefined;
    panel.webview.postMessage.mockImplementation(async message => {
      if (message.op === 'read') respond(message);
      else { action = message; panel.visible = false; }
      return true;
    });
    const pending = reportDom(target, 'click', 'button');
    await vi.advanceTimersByTimeAsync(100);
    expect(panel.visible).toBe(true);
    expect(panel.webview.postMessage.mock.calls.filter(([m]) => m.op === 'click')).toHaveLength(1);
    respond(action!);
    await pending;
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up an unanswered probe and identifies the failed operation', async () => {
    const { target, listeners } = webview();
    const pending = expect(reportDom(target)).rejects.toThrow('requirementChain-matrix read');
    await vi.advanceTimersByTimeAsync(15000);
    await pending;
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
