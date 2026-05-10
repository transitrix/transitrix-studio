import type { IncomingMessage } from 'node:http';

/** Max body size for `POST /api/compile` (JSON or raw YAML). */
export const MAX_COMPILE_BODY_BYTES = 1_048_576;

export class PayloadTooLargeError extends Error {
  constructor(maxBytes = MAX_COMPILE_BODY_BYTES) {
    super(`Request body exceeds limit (${maxBytes} bytes)`);
    this.name = 'PayloadTooLargeError';
  }
}

export function readHttpBodyLimited(req: IncomingMessage, maxBytes = MAX_COMPILE_BODY_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const bail = (err: Error): void => {
      if (settled) return;
      settled = true;
      if (typeof (req as IncomingMessage & { destroy?: (e?: Error) => void }).destroy === 'function') {
        try {
          (req as IncomingMessage & { destroy: (e?: Error) => void }).destroy(err);
        } catch {
          /* ignore destroy errors on test doubles */
        }
      }
      reject(err);
    };
    req.on('data', (c: Buffer | string) => {
      if (settled) return;
      const buf = typeof c === 'string' ? Buffer.from(c, 'utf8') : c;
      total += buf.length;
      if (total > maxBytes) {
        bail(new PayloadTooLargeError(maxBytes));
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (e: Error | unknown) => bail(e instanceof Error ? e : new Error(String(e))));
  });
}
