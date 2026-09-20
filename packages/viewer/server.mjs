import { open, readFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inspectSource, MAX_BYTES, NOTATIONS } from './source.mjs';

export const RESOURCE_URI = 'ui://transitrix/viewer.html';
const MIME = 'text/html;profile=mcp-app';
const ui = { csp: { connectDomains: [], resourceDomains: [], frameDomains: [] }, permissions: {}, prefersBorder: true };
const inputSchema = {
  type: 'object', additionalProperties: false,
  properties: { sourceId: { type: 'string' }, notation: { enum: NOTATIONS }, content: { type: 'string', maxLength: MAX_BYTES } },
  oneOf: [{ required: ['sourceId'], not: { anyOf: [{ required: ['content'] }, { required: ['notation'] }] } },
    { required: ['notation', 'content'], not: { required: ['sourceId'] } }],
};
export const tool = {
  name: 'view_diagram', description: 'Read and inspect an authorized Goals or bounded PlantUML sequence diagram. Supply sourceId from the configured bindings, or notation and content. No writes.',
  inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ['model', 'app'] } },
};

export async function bindSources(entries) {
  const bindings = new Map();
  for (const entry of entries) {
    const match = /^([A-Za-z0-9_-]{1,64}):(goals|plantuml)=(.+)$/.exec(entry);
    if (!match || match[1] === 'supplied-content' || bindings.has(match[1])) throw new Error('Use unique ID:goals=FILE or ID:plantuml=FILE bindings.');
    // Pin the resolved path once; requests never supply filesystem paths.
    bindings.set(match[1], { notation: match[2], path: await realpath(match[3]) });
  }
  return bindings;
}

export async function viewDiagram(args, bindings = new Map()) {
  try {
    if (!args || Array.isArray(args) || typeof args !== 'object' || Object.keys(args).some(k => !['sourceId', 'notation', 'content'].includes(k))) throw new Error('Invalid arguments; undeclared operations are denied.');
    let bytes, notation, identity;
    if ('sourceId' in args) {
      if (Object.keys(args).length !== 1 || typeof args.sourceId !== 'string' || !bindings.has(args.sourceId)) throw new Error('Source unavailable or not authorized.');
      const binding = bindings.get(args.sourceId);
      notation = binding.notation;
      identity = args.sourceId;
      let handle;
      try {
        // Reject replacement symlinks, including symlinked parent directories.
        if (await realpath(binding.path) !== binding.path) throw new Error();
        handle = await open(binding.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error();
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        let total = 0;
        while (total < buffer.length) {
          const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
          if (!bytesRead) break;
          total += bytesRead;
        }
        if (total > MAX_BYTES) throw new Error();
        bytes = buffer.subarray(0, total);
      } catch { throw new Error('Source unavailable or not authorized (missing, replaced, unreadable or too large).'); }
      finally { await handle?.close(); }
    } else {
      if (Object.keys(args).length !== 2 || !NOTATIONS.includes(args.notation) || typeof args.content !== 'string') throw new Error('Supply sourceId, or notation and content.');
      bytes = Buffer.from(args.content, 'utf8');
      if (bytes.length > MAX_BYTES) throw new Error('Source exceeds 32768 bytes.');
      notation = args.notation;
      identity = 'supplied-content';
    }
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const provenance = { identity, notation, bytes: bytes.length, sha256 };
    try {
      const model = inspectSource(notation, content);
      return { content: [{ type: 'text', text: `Read-only ${notation}: ${identity}; SHA-256 ${sha256}. ${model.warnings.map(w => w.message).join(' ')}` }],
        structuredContent: { ...provenance, status: 'ok', warnings: model.warnings }, _meta: { source: content } };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error.message }], structuredContent: { ...provenance, status: 'error', diagnostic: error.message } };
    }
  } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }], structuredContent: { status: 'unavailable', diagnostic: error.message } }; }
}

// A deliberately bounded stdio MCP adapter; no HTTP listener, credential store,
// filesystem discovery, prompts, sampling, execution or mutation methods.
export function createSession(bindings, html) {
  let initialized = false, ready = false;
  return async request => {
    const id = request?.id;
    const fail = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
    if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string' || (id !== undefined && typeof id !== 'string' && typeof id !== 'number')) return fail(-32600, 'Invalid Request');
    if (id === undefined) {
      if (initialized && request.method === 'notifications/initialized') ready = true;
      return null;
    }
    let result;
    const p = request.params ?? {};
    if (request.method === 'initialize') {
      if (initialized) return fail(-32600, 'Already initialized');
      initialized = true;
      result = { protocolVersion: '2025-06-18', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'transitrix-viewer', version: '0.1.0' },
        instructions: `Read-only prototype. Configured source IDs: ${[...bindings.keys()].join(', ') || '(none)'}. Other paths and all writes are denied.` };
    } else if (request.method === 'ping') result = {};
    else if (!ready) return fail(-32000, 'Initialize the session first');
    else if (request.method === 'tools/list') result = { tools: [tool] };
    else if (request.method === 'resources/list') result = { resources: [{ uri: RESOURCE_URI, name: 'Diagram viewer', mimeType: MIME, _meta: { ui } }] };
    else if (request.method === 'resources/templates/list') result = { resourceTemplates: [] };
    else if (request.method === 'resources/read') {
      if (p.uri !== RESOURCE_URI) return fail(-32002, 'Resource unavailable');
      result = { contents: [{ uri: RESOURCE_URI, mimeType: MIME, text: html, _meta: { ui } }] };
    } else if (request.method === 'tools/call') {
      if (p.name !== tool.name) return fail(-32602, 'Unknown tool; writes and undeclared operations are denied');
      result = await viewDiagram(p.arguments, bindings);
    } else return fail(-32601, 'Method not found');
    return { jsonrpc: '2.0', id, result };
  };
}

export async function main() {
  const bindings = await bindSources(process.argv.slice(2));
  const html = await readFile(new URL('./viewer.html', import.meta.url), 'utf8');
  const dispatch = createSession(bindings, html);
  let pending = '';
  process.stdin.setEncoding('utf8');
  // Bound framing before JSON parsing, including a peer that never sends LF.
  for await (const chunk of process.stdin) {
    pending += chunk.toString('utf8');
    let end;
    while ((end = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1);
      if (Buffer.byteLength(line) > 256 * 1024) throw new Error('Request too large');
      let response;
      try { response = await dispatch(JSON.parse(line)); }
      catch { response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }; }
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    }
    if (Buffer.byteLength(pending) > 256 * 1024) throw new Error('Request too large');
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Viewer could not start or request exceeded limits. Check source bindings and build output.'); process.exitCode = 1; });
