import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Plugin } from 'vite';

import { PayloadTooLargeError, readHttpBodyLimited } from '../src/http-body-limit.ts';
import { handleBlocksCompile } from '../src/serve-ui.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function cervinCompileMiddleware() {
  return async (req: IncomingMessage, res: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string): void;
  }, next: () => void): Promise<void> => {
    const pathOnly = (req.url ?? '').split('?')[0];
    if (req.method !== 'POST' || pathOnly !== '/api/compile') {
      next();
      return;
    }
    try {
      const raw = await readHttpBodyLimited(req);
      const ctype = ((req.headers['content-type'] as string | undefined) ?? '').toLowerCase();
      let yaml = '';
      let layout: Partial<Record<string, number>> | undefined;

      const compilerHref = pathToFileURL(join(repoRoot, 'dist', 'compiler.js')).href;
      const metricsHref = pathToFileURL(join(repoRoot, 'dist', 'metrics.js')).href;
      const mod = (await import(compilerHref)) as {
        compileTransitrixYamlWithLayout: (
          y: string,
          o?: { layout?: Partial<Record<string, number>> },
        ) => Promise<{ xml: string; layout: unknown; validation: unknown }>;
        parseLayoutDiagramOptionsFromJson: (v: unknown) => Partial<Record<string, number>>;
      };
      const metricsMod = (await import(metricsHref)) as {
        computeLayoutMetrics: (layout: unknown) => unknown;
      };

      if (ctype.includes('application/json')) {
        let body: unknown;
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ message: 'Invalid JSON request body', details: [] }));
          return;
        }
        const rec = body as Record<string, unknown>;
        if (typeof rec.yaml !== 'string') {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              message:
                'Expected JSON body shaped like { "yaml": "<source>" [, "layout": { … }] }',
              details: [],
            }),
          );
          return;
        }
        yaml = rec.yaml;
        const parsed = mod.parseLayoutDiagramOptionsFromJson(rec.layout);
        if (Object.keys(parsed).length > 0) {
          layout = parsed;
        }
      } else {
        yaml = raw.toString('utf8');
      }

      try {
        const result = await mod.compileTransitrixYamlWithLayout(yaml, layout ? { layout } : undefined);
        const metrics = metricsMod.computeLayoutMetrics(result.layout);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ xml: result.xml, metrics, validation: result.validation }, null, 2));
      } catch (e) {
        const err = e as Error & { errors?: string[] };
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            message: err.message ?? 'Compilation failed',
            details: err.errors ?? [],
          }),
        );
      }
    } catch (e) {
      if (e instanceof PayloadTooLargeError) {
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ message: (e as PayloadTooLargeError).message, details: [] }));
        return;
      }
      console.error('cervin dev api: unhandled error', e);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  };
}

function cervinDevApi(): Plugin {
  return {
    name: 'cervin-dev-compile-api',
    configureServer(server) {
      server.middlewares.use(cervinCompileMiddleware() as Parameters<typeof server.middlewares.use>[0]);
    },
    configurePreviewServer(server) {
      server.middlewares.use(cervinCompileMiddleware() as Parameters<typeof server.middlewares.use>[0]);
    },
  };
}

function cervinBlocksDevApi(): Plugin {
  return {
    name: 'cervin-dev-blocks-compile-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = (req.url ?? '').split('?')[0];
        if (!(req.method === 'POST' && pathOnly === '/api/blocks/compile')) {
          next();
          return;
        }
        try {
          await handleBlocksCompile(req as IncomingMessage, res as ServerResponse);
        } catch (e) {
          console.error('cervin dev nested-blocks api: error', e);
          if (!(res as ServerResponse & { writableEnded?: boolean }).writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ message: 'Internal server error', details: [] }));
          }
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = (req.url ?? '').split('?')[0];
        if (!(req.method === 'POST' && pathOnly === '/api/blocks/compile')) {
          next();
          return;
        }
        try {
          await handleBlocksCompile(req as IncomingMessage, res as ServerResponse);
        } catch (e) {
          console.error('cervin preview nested-blocks api: error', e);
          if (!(res as ServerResponse & { writableEnded?: boolean }).writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ message: 'Internal server error', details: [] }));
          }
        }
      });
    },
  };
}

export default {
  root: __dirname,
  build: {
    outDir: 'dist',
    emptyDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 4000,
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
  preview: { port: 5174 },
  optimizeDeps: {
    include: ['bpmn-js', 'diagram-js', 'inherits-browser', 'min-dash'],
  },
  plugins: [cervinDevApi(), cervinBlocksDevApi()],
};
