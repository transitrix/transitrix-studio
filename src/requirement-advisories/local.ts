import { execFileSync } from 'node:child_process';
import { appendFile, readFile, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { parseDocument } from 'yaml';
import { auditEvent, digest, evaluateRequirements, hash, type AuditEvent, type Configuration, type Result, type Selection, type VisibleContext } from './index.js';

/** This external request is the local caller's explicit read authorization. */
export interface LocalRequest {
  version: '1.0.0'; root: string; repositoryIdentity: string; configuration: Configuration;
  requirements: (Omit<Selection, 'handle' | 'contextHandles'> & { path: string; contexts?: string[] })[];
  contexts?: Record<string, { path: string; kind: 'verification' | 'definition';
    requirementPath?: string; target?: string; anchor?: string; selectedLink?: string; excerpt?: string; sha256?: string }>;
  auditPath?: string;
}
const inside = (root: string, file: string) => { const rel = path.relative(root, file); return rel !== '' && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel); };

export async function readRequest(file: string): Promise<LocalRequest> {
  const request = JSON.parse(await readFile(file, 'utf8')) as LocalRequest;
  if (request.version !== '1.0.0' || typeof request.root !== 'string' || !path.isAbsolute(request.root) || !request.repositoryIdentity || !Array.isArray(request.requirements) || !request.configuration ||
    request.auditPath !== undefined && !path.isAbsolute(request.auditPath))
    throw new Error('Unsupported advisory request');
  const root = await realpath(request.root);
  if (inside(root, await realpath(file))) throw new Error('Keep advisory requests outside the model repository');
  return request;
}

export async function evaluateLocal(request: LocalRequest): Promise<Result> {
  const root = await realpath(request.root);
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const sources = new Map<string, { path: string; bytes: Uint8Array }>();
  const allowed = new Map<string, string>();
  // Paths are never emitted or opened until their explicit selection and containment are established.
  const load = async (handle: string, relative: string) => {
    if (typeof relative !== 'string' || path.isAbsolute(relative)) return;
    try {
      const file = await realpath(path.resolve(root, relative));
      if (!inside(root, file)) return;
      allowed.set(handle, file);
      const bytes = await readFile(file);
      sources.set(handle, { path: path.relative(root, file).split(path.sep).join('/'), bytes });
    } catch { /* Missing and inaccessible selections have one public representation. */ }
  };
  for (let i = 0; i < request.requirements.length; i++) await load('requirement:' + i, request.requirements[i].path);
  const requestedContexts = new Set(request.requirements.flatMap(r => r.contexts ?? []));
  for (const key of requestedContexts) {
    const c = request.contexts?.[key];
    if (c) await load('context:' + key, c.path);
  }
  // Exact selected overlay, not a base commit masquerading as current working content.
  const overlay = [...new Map([...sources.values()].map(s => [s.path, hash(s.bytes)])).entries()]
    .sort((a, b) => Buffer.compare(Buffer.from(a[0]), Buffer.from(b[0])));
  const snapshot = { commit, overlaySha256: digest(overlay) };
  let audit: AuditEvent[] = [];
  if (request.auditPath) {
    const file = path.resolve(request.auditPath);
    if (inside(root, file) || file === root) throw new Error('Audit storage must be outside the model repository');
    try {
      const resolved = await realpath(file);
      if (inside(root, resolved)) throw new Error('Audit storage must be outside the model repository');
      audit = (await readFile(resolved, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return evaluateRequirements({ repositoryIdentity: request.repositoryIdentity, snapshot, configuration: request.configuration, audit,
    selections: request.requirements.map((r, i) => ({ ...r, handle: 'requirement:' + i, contextHandles: (r.contexts ?? []).map(k => 'context:' + k) })),
    adapter: {
      authorize: handle => allowed.has(handle),
      readRequirement: async handle => { const source = sources.get(handle); if (!source) throw new Error('Unavailable'); return source; },
      readContext: async handle => {
        const c = request.contexts?.[handle.slice('context:'.length)]; const source = sources.get(handle);
        if (!c || !source) return;
        const text = new TextDecoder('utf-8', { fatal: true }).decode(source.bytes);
        const base = { identity: source.path, revision: hash(source.bytes), snapshot };
        if (c.kind === 'verification') {
          const doc = parseDocument(text, { uniqueKeys: true, version: '1.2' });
          if (doc.errors.length) return;
          const d = doc.toJSON();
          if (!d || d.notation !== 'verification' || typeof d.protocol !== 'string' || typeof d.verifies !== 'string' ||
            typeof d.admitted_by !== 'string' || !d.admitted_by.trim() || typeof d.admitted_at !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(d.admitted_at) || !d.gate_checks ||
            !['uniqueness', 'consistency', 'completeness'].every(k => d.gate_checks[k] === 'pass') || d.zone !== 'canon') return;
          return { ...base, kind: 'verification', admitted: true, verifies: d.verifies, excerpt: d.protocol,
            ...(typeof d.verified_on === 'string' ? { verifiedOn: d.verified_on } : {}) };
        }
        if (c.kind !== 'definition' || !c.requirementPath || !c.target || !c.anchor || !c.excerpt || c.sha256 !== hash(source.bytes) ||
          c.selectedLink !== c.target + '#' + c.anchor || !text.includes(c.excerpt) ||
          path.resolve(root, path.dirname(c.requirementPath), c.target) !== allowed.get(handle)) return;
        // Caller explicitly selects an existing anchor and exact visible excerpt; no inferred criterion.
        if (!text.includes(`id="${c.anchor}"`) && !text.includes(`{#${c.anchor}}`) &&
          !text.split(/\r?\n/).some(line => /^#{1,6} /.test(line) && line.replace(/^#{1,6} /, '').trim().toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-') === c.anchor)) return;
        return { ...base, kind: 'definition', excerpt: c.excerpt, target: c.target, anchor: c.anchor, selectedLink: c.selectedLink,
          requirementPath: path.relative(root, path.resolve(root, c.requirementPath)).split(path.sep).join('/') } as VisibleContext;
      },
    },
  });
}

/** Explicit append-only side effect. Evaluation and rendering never call this. */
export async function recordLocalDecision(request: LocalRequest, result: Result, identity: string,
  action: 'dismiss' | 'revoke', actor: string, reason: string): Promise<void> {
  if (!request.auditPath) throw new Error('An external auditPath is required');
  const current = await evaluateLocal(request);
  if (digest(current) !== digest(result)) throw new Error('Snapshot or advisory state changed; review again');
  const finding = [...result.findings, ...result.dismissed.map(d => d.finding)].find(f => f.identity === identity);
  if (!finding) throw new Error('Finding is not visible in this result');
  const file = path.resolve(request.auditPath); const root = await realpath(request.root);
  const parent = await realpath(path.dirname(file));
  if (inside(root, parent) || parent === root) throw new Error('Audit storage must be outside the model repository');
  try { if (inside(root, await realpath(file))) throw new Error('Audit storage must be outside the model repository'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await appendFile(file, JSON.stringify(auditEvent(finding, action, actor, reason, new Date().toISOString())) + '\n', { encoding: 'utf8', flag: 'a' });
}

export function renderAdvisories(result: Result): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const entries = result.findings.map(f => `<li><strong>${escape(f.requirementId)} · ${f.field}</strong> [${f.span.join(', ')}) <code>${escape(f.matchedText)}</code><p>${escape(f.question)}</p><small>${escape(f.identity)}</small></li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><title>Requirement language advisories</title></head><body><h1>Requirement language advisories</h1><p>Opt-in: ${result.optIn ? 'enabled' : 'disabled'} · ${result.status}</p><p>Questions for review; no quality score or verification verdict.</p><ul>${entries}</ul><p>${result.contextResolutions.length} context resolutions · ${result.dismissed.length} explicitly dismissed</p><pre>${escape(JSON.stringify(result, null, 2))}</pre></body></html>`;
}

export async function handleAdvisoriesCommand(args: string[]): Promise<void> {
  if (!args.length || args.includes('--help')) {
    console.log('transitrix advisories <external-request.json> [--dismiss <identity>|--revoke <identity>] [--actor <name> --reason <text>]\nRead-only normalized JSON. Matches do not fail CI. Decisions append only to the explicitly configured external auditPath.'); return;
  }
  for (let i = 1; i < args.length; i += 2) {
    if (!['--dismiss', '--revoke', '--actor', '--reason'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--'))
      throw new Error('Unknown or incomplete advisory option');
  }
  const request = await readRequest(args[0]); let result = await evaluateLocal(request);
  const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const dismiss = option('--dismiss'), revoke = option('--revoke');
  if (dismiss && revoke) throw new Error('Choose one explicit decision');
  if (dismiss || revoke) {
    await recordLocalDecision(request, result, (dismiss ?? revoke)!, dismiss ? 'dismiss' : 'revoke', option('--actor') ?? '', option('--reason') ?? '');
    result = await evaluateLocal(request);
  }
  console.log(JSON.stringify(result, null, 2));
}
