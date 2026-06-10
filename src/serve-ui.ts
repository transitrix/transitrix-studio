import { createReadStream, existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import process from 'node:process'
import { basename, dirname, extname, resolve as pathResolve, sep as pathSep } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { IncomingMessage, ServerResponse } from 'node:http'

import { compileTransitrixYamlWithLayout } from './compiler.js'
import { computeLayoutMetrics } from './metrics.js'
import { PayloadTooLargeError, readHttpBodyLimited } from './http-body-limit.js'
import {
  parseLayoutDiagramOptionsFromJson,
  type LayoutDiagramOptions,
} from './layout-options.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function mimeType(file: string): string {
  switch (extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    case '.ttf':
      return 'font/ttf'
    case '.json':
      return 'application/json'
    default:
      return 'application/octet-stream'
  }
}

function resolveUiDist(): string {
  const dir = pathResolve(__dirname, '..', 'ui', 'dist')
  if (existsSync(pathResolve(dir, 'index.html'))) {
    return dir
  }
  throw new Error(
    `UI build not found (${pathResolve(dir, 'index.html')}). Run: npm run ui:build`,
  )
}

export function isInsideRoot(staticRoot: string, candidateAbs: string): boolean {
  // path.relative() returns the raw second argument when the two paths live on
  // different Windows drives — and that does not start with `..`, so a naive
  // relative-based check would silently let `D:\b` "live inside" `C:\a`.
  // A direct prefix comparison with the path separator catches that.
  const root = pathResolve(staticRoot)
  const candidate = pathResolve(candidateAbs)
  return candidate === root || candidate.startsWith(root + pathSep)
}

async function serveFile(res: ServerResponse, filePath: string): Promise<void> {
  const st = await stat(filePath)
  res.writeHead(200, {
    'Content-Type': mimeType(filePath),
    'Content-Length': String(st.size),
    'Cache-Control': 'no-cache',
  })
  const stream = createReadStream(filePath)
  stream.on('error', (err) => {
    // Stream errors fire after headers are already written; the client cannot
    // be told via status code, so abort the socket instead of letting the
    // unhandled error crash the process.
    // eslint-disable-next-line no-console
    console.error('serveFile: read stream error', err)
    res.destroy(err)
  })
  stream.pipe(res)
}

export async function handleCompile(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('405 Method Not Allowed')
    return
  }
  try {
    const raw = await readHttpBodyLimited(req)
    const ctype = (req.headers['content-type'] ?? '').toLowerCase()
    let yaml: string
    let layout: Partial<LayoutDiagramOptions> | undefined

    if (ctype.includes('application/json')) {
      let body: unknown
      try {
        body = JSON.parse(raw.toString('utf8'))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ message: 'Invalid JSON request body', details: [] }))
        return
      }
      const rec = body as Record<string, unknown>
      if (typeof rec.yaml !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(
          JSON.stringify({
            message: 'Expected JSON body shaped like { "yaml": "<source>" [, "layout": { ... }] }',
            details: [],
          }),
        )
        return
      }
      yaml = rec.yaml
      const parsedLayout = parseLayoutDiagramOptionsFromJson(rec.layout)
      if (Object.keys(parsedLayout).length > 0) {
        layout = parsedLayout
      }
    } else {
      yaml = raw.toString('utf8')
    }

    const result = await compileTransitrixYamlWithLayout(yaml, layout ? { layout } : undefined)
    const metrics = computeLayoutMetrics(result.layout)
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(
      JSON.stringify({ xml: result.xml, metrics, validation: result.validation }, null, 2),
    )
  } catch (e) {
    if (e instanceof PayloadTooLargeError) {
      res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ message: e.message, details: [] }))
      return
    }
    const err = e as Error & { errors?: string[] }
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(
      JSON.stringify({
        message: err.message ?? 'Compilation failed',
        details: err.errors ?? [],
      }),
    )
  }
}

export interface ServeUiOptions {
  port: number
  host?: string
}

export async function runUiServer(opts: ServeUiOptions): Promise<void> {
  const staticRoot = resolveUiDist()

  const server = createServer(async (req, res) => {
    try {
      let pathOnly: string
      try {
        pathOnly = decodeURIComponent(req.url?.split('?')[0] ?? '/')
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('400 Bad Request')
        return
      }

      if (pathOnly === '/api/compile') {
        await handleCompile(req, res)
        return
      }

      const relReq = pathOnly === '/' ? 'index.html' : pathOnly.replace(/^\/+/, '')
      const filePath = pathResolve(staticRoot, relReq)

      if (!isInsideRoot(staticRoot, filePath)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('403 Forbidden')
        return
      }

      try {
        const st = await stat(filePath)
        if (st.isFile()) {
          await serveFile(res, filePath)
          return
        }
      } catch {
        /* not found or not a file */
      }

      const indexHtml = pathResolve(staticRoot, 'index.html')
      if (existsSync(indexHtml)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
        res.end(await readFile(indexHtml, 'utf8'))
        return
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('404 Not Found')
    } catch (e) {
      console.error('cervin serve: unhandled error', e)
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Internal server error')
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(opts.port, opts.host ?? '127.0.0.1', () => resolve())
    server.on('error', reject)
  })

  const host = opts.host ?? '127.0.0.1'
  const url = `http://${host}:${opts.port}/`
  const rootName = basename(staticRoot)
  // eslint-disable-next-line no-console
  console.error(`Transitrix Studio UI → ${url}  (static root: "${rootName}")`)
}

/** `cervin serve [--port 8765] [--host 127.0.0.1]` — keeps running after start. */
export async function cliServeArgv(argv: string[]): Promise<void> {
  let port = 8765
  let host = '127.0.0.1'

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port' || a === '-p') {
      const v = argv[++i]
      if (v) {
        const parsed = Number.parseInt(v, 10)
        if (!Number.isFinite(parsed)) {
          console.error(`cervin serve: --port requires a numeric value, got: ${v}`)
          process.exitCode = 1
          process.exit(1)
        }
        port = parsed
      }
      continue
    }
    if (a.startsWith('--port=')) {
      const v = a.slice('--port='.length)
      const parsed = Number.parseInt(v, 10)
      if (!Number.isFinite(parsed)) {
        console.error(`cervin serve: --port requires a numeric value, got: ${v}`)
        process.exitCode = 1
        process.exit(1)
      }
      port = parsed
      continue
    }
    if (a === '--host' || a === '-H') {
      const v = argv[++i]
      if (v) host = v
      continue
    }
    if (a === '--help' || a === '-h') {
      // eslint-disable-next-line no-console
      console.error(`usage: cervin serve [--port 8765] [--host 127.0.0.1]

Local web UI: YAML on the left, BPMN preview on the right.
Compiles through the server (same pipeline as the CLI / VS Code extension for BPMN).

Before first run:
  npm run build && npm run ui:build
`)
      process.exitCode = 0
      process.exit(0)
    }
  }

  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    // eslint-disable-next-line no-console
    console.error('cervin serve: invalid --port')
    process.exitCode = 1
    process.exit(1)
  }

  await runUiServer({ port, host })
}

const thisScript = pathResolve(fileURLToPath(import.meta.url))
if (process.argv[1] && pathResolve(process.argv[1]) === thisScript) {
  void cliServeArgv(process.argv.slice(2)).catch((e: unknown) => {
    console.error(String((e as Error).message ?? e))
    process.exit(1)
  })
}
