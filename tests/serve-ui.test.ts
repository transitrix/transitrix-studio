import EventEmitter from 'node:events';
import { describe, expect, it } from 'vitest';

import type { IncomingMessage, ServerResponse } from 'node:http';

import { MAX_COMPILE_BODY_BYTES } from '../src/http-body-limit.js';
import { handleBlocksCompile, handleCompile, isInsideRoot } from '../src/serve-ui.js';

// Minimal YAML that compiles successfully (two elements + one flow).
const VALID_YAML = `
process:
  id: test-proc
  name: Test
  pools:
    - id: pool-1
      name: Pool 1
      lanes:
        - id: lane-1
          name: Lane 1
          elements:
            - { id: start, type: startEvent, name: Start }
            - { id: end,   type: endEvent,   name: End   }
  flows:
    - { id: f1, from: start, to: end }
`.trimStart();

function mockReq(
  method: string,
  payloads: Buffer[],
  contentType?: string,
): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage & EventEmitter;
  (req as Record<string, unknown>).method = method;
  (req as Record<string, unknown>).headers = contentType
    ? { 'content-type': contentType }
    : {};
  queueMicrotask(() => {
    for (const b of payloads) req.emit('data', b);
    req.emit('end');
  });
  return req;
}

interface MockResponse {
  statusCode: number | undefined;
  headers: Record<string, string>;
  body: string;
}

function mockRes(): ServerResponse & { captured: MockResponse } {
  const captured: MockResponse = { statusCode: undefined, headers: {}, body: '' };
  const res = {
    captured,
    writeHead(code: number, hdrs?: Record<string, string>) {
      captured.statusCode = code;
      if (hdrs) Object.assign(captured.headers, hdrs);
    },
    end(chunk?: unknown) {
      if (typeof chunk === 'string') captured.body += chunk;
      else if (Buffer.isBuffer(chunk)) captured.body += chunk.toString('utf8');
    },
  } as unknown as ServerResponse & { captured: MockResponse };
  return res;
}

describe('handleCompile', () => {
  it('returns 405 for non-POST requests', async () => {
    const req = mockReq('GET', []);
    const res = mockRes();
    await handleCompile(req, res);
    expect(res.captured.statusCode).toBe(405);
  });

  it('compiles valid YAML (plain text body) and returns 200 with JSON metrics', async () => {
    const req = mockReq('POST', [Buffer.from(VALID_YAML, 'utf8')], 'text/plain');
    const res = mockRes();
    await handleCompile(req, res);
    expect(res.captured.statusCode).toBe(200);
    expect(res.captured.headers['Content-Type']).toContain('application/json');
    const parsed = JSON.parse(res.captured.body) as { xml: string; metrics: unknown };
    expect(parsed.xml).toContain('<?xml');
    expect(parsed.metrics).toBeDefined();
  });

  it('compiles valid YAML via JSON body and returns 200 with JSON metrics', async () => {
    const body = JSON.stringify({ yaml: VALID_YAML });
    const req = mockReq('POST', [Buffer.from(body, 'utf8')], 'application/json');
    const res = mockRes();
    await handleCompile(req, res);
    expect(res.captured.statusCode).toBe(200);
    const parsed = JSON.parse(res.captured.body) as { xml: string; metrics: unknown };
    expect(parsed.xml).toContain('<?xml');
    expect(parsed.metrics).toBeDefined();
  });

  it('returns 400 for malformed JSON body', async () => {
    const req = mockReq('POST', [Buffer.from('{not json}', 'utf8')], 'application/json');
    const res = mockRes();
    await handleCompile(req, res);
    expect(res.captured.statusCode).toBe(400);
    const parsed = JSON.parse(res.captured.body) as { message: string };
    expect(parsed).toHaveProperty('message');
  });

  it('returns 400 for JSON body missing the yaml field', async () => {
    const body = JSON.stringify({ notYaml: 'oops' });
    const req = mockReq('POST', [Buffer.from(body, 'utf8')], 'application/json');
    const res = mockRes();
    await handleCompile(req, res);
    expect(res.captured.statusCode).toBe(400);
  });

  it('returns 413 when body exceeds the size limit (covers RD-002)', async () => {
    const oversized = Buffer.alloc(MAX_COMPILE_BODY_BYTES + 1, 0x61); // 'a' × (1MB + 1)
    const req = mockReq('POST', [oversized], 'text/plain');
    const res = mockRes();
    await handleCompile(req, res);
    expect(res.captured.statusCode).toBe(413);
    const parsed = JSON.parse(res.captured.body) as { message: string };
    expect(parsed.message).toMatch(/exceed/i);
  });
});

describe('handleBlocksCompile', () => {
  it('returns 405 for non-POST requests', async () => {
    const req = mockReq('GET', []);
    const res = mockRes();
    await handleBlocksCompile(req, res);
    expect(res.captured.statusCode).toBe(405);
  });

  it('returns 415 when Content-Type is not JSON', async () => {
    const req = mockReq('POST', [Buffer.from('{}', 'utf8')], 'text/plain');
    const res = mockRes();
    await handleBlocksCompile(req, res);
    expect(res.captured.statusCode).toBe(415);
    const parsed = JSON.parse(res.captured.body) as { message: string };
    expect(parsed.message).toMatch(/json/i);
  });

  it('returns 400 for malformed JSON body', async () => {
    const req = mockReq('POST', [Buffer.from('{oops', 'utf8')], 'application/json');
    const res = mockRes();
    await handleBlocksCompile(req, res);
    expect(res.captured.statusCode).toBe(400);
  });

  it('returns 400 when JSON body omits mode or source', async () => {
    const body = JSON.stringify({ mode: 'ascii' });
    const req = mockReq('POST', [Buffer.from(body, 'utf8')], 'application/json');
    const res = mockRes();
    await handleBlocksCompile(req, res);
    expect(res.captured.statusCode).toBe(400);
    const parsed = JSON.parse(res.captured.body) as { message: string };
    expect(parsed.message.toLowerCase()).toMatch(/source/);
  });

  it('returns 413 when body exceeds the size limit', async () => {
    const oversized = Buffer.alloc(MAX_COMPILE_BODY_BYTES + 1, 0x61);
    const req = mockReq('POST', [oversized], 'application/json');
    const res = mockRes();
    await handleBlocksCompile(req, res);
    expect(res.captured.statusCode).toBe(413);
  });
});

// Pre-release blocker regression (orchestrator review 2026-05-21).
describe('isInsideRoot', () => {
  it('accepts the root itself', () => {
    expect(isInsideRoot('/srv/ui', '/srv/ui')).toBe(true);
  });

  it('accepts a descendant', () => {
    expect(isInsideRoot('/srv/ui', '/srv/ui/index.html')).toBe(true);
    expect(isInsideRoot('/srv/ui', '/srv/ui/assets/app.js')).toBe(true);
  });

  it('rejects a parent-traversal path', () => {
    expect(isInsideRoot('/srv/ui', '/srv/secret.txt')).toBe(false);
    expect(isInsideRoot('/srv/ui', '/etc/passwd')).toBe(false);
  });

  it('rejects a sibling whose name starts with the root name (prefix-only attack)', () => {
    // "/srv/ui-evil/..." shares the prefix "/srv/ui" but is a different directory.
    expect(isInsideRoot('/srv/ui', '/srv/ui-evil/file.txt')).toBe(false);
  });

  it('[blocker] rejects a path on a different Windows drive', () => {
    // path.relative('C:\\a', 'D:\\b') returns 'D:\\b' which does not start with '..';
    // a relative-based check passes that as "inside the root". The fix uses a
    // direct prefix comparison so cross-drive paths are correctly rejected.
    if (process.platform !== 'win32') return; // path semantics differ on POSIX
    expect(isInsideRoot('C:\\srv\\ui', 'D:\\evil\\file.txt')).toBe(false);
  });
});
