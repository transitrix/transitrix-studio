import EventEmitter from 'node:events';
import { describe, expect, it } from 'vitest';

import type { IncomingMessage } from 'node:http';

import { PayloadTooLargeError, readHttpBodyLimited } from '../src/http-body-limit.js';

function mockReq(payloads: Buffer[]): IncomingMessage & EventEmitter {
  const req = new EventEmitter() as IncomingMessage & EventEmitter;
  queueMicrotask(() => {
    for (const b of payloads) {
      req.emit('data', b);
    }
    req.emit('end');
  });
  return req;
}

describe('http-body-limit', () => {
  it('collects buffered body below limit', async () => {
    const buf = Buffer.from('hello', 'utf8');
    await expect(readHttpBodyLimited(mockReq([buf]), 100)).resolves.toEqual(buf);
  });

  it('rejects PayloadTooLarge when data exceeds limit', async () => {
    await expect(
      readHttpBodyLimited(mockReq([Buffer.alloc(32), Buffer.alloc(32)]), 48),
    ).rejects.toThrow(PayloadTooLargeError);
  });
});
