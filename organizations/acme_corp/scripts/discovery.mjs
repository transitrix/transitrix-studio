#!/usr/bin/env node
// Discovery — noticing drift on a schedule.
//
// Realises the scheduled-trigger contract in
// transitrix/methodology §7 of methodology-update-propagation.md. For each
// consumer listed in adopters.yaml, per run:
//   * clones the consumer's default branch (shallow, read-only);
//   * reads its `pin_key` from `pin_file` and compares against the HEAD commit
//     of this repo (acme-corp does not publish semver tags; pins are commit SHAs);
//   * scans its `decisions_path` for ADR-NNNN-*.md at `status: proposed` whose
//     `date:` is older than fourteen calendar days.
//
// Emits one digest to stdout (YAML) and, when running under GitHub Actions,
// a Markdown summary appended to $GITHUB_STEP_SUMMARY.
//
// Scope: READ-ONLY. This script never pushes, never opens a PR, never edits
// a consumer.
//
// Args (all optional):
//   --registry <path>       default: <repo-root>/adopters.yaml
//   --source-repo <path>    default: <repo-root>
//   --workdir <path>        default: OS tmpdir + "/acme-corp-discovery"
//   --now <YYYY-MM-DD>      default: today (UTC)
//   --stale-days <n>        default: 14
//
// Exit codes:  0 clean run (findings are informational, not failures)
//              2 script-internal error (registry missing, clone failed)

import { readFile, readdir, mkdir, rm, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');

const args = process.argv.slice(2);
function argVal(flag, dflt) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const REGISTRY = resolve(argVal('--registry', join(REPO_ROOT, 'adopters.yaml')));
const SOURCE_REPO = resolve(argVal('--source-repo', REPO_ROOT));
const WORKDIR = resolve(argVal('--workdir', join(tmpdir(), 'acme-corp-discovery')));
const NOW = argVal('--now', new Date().toISOString().slice(0, 10));
const STALE_DAYS = parseInt(argVal('--stale-days', '14'), 10);

// --- helpers ---------------------------------------------------------------

function daysBetween(isoA, isoB) {
  const a = Date.parse(isoA + 'T00:00:00Z');
  const b = Date.parse(isoB + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function splitFrontMatter(text) {
  const normalised = text.replace(/\r\n/g, '\n');
  const m = normalised.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: null, body: normalised };
  return { fm: m[1], body: m[2] };
}

function parseFm(fmText) {
  const out = {};
  if (!fmText) return out;
  for (const line of fmText.split('\n')) {
    const m = line.match(/^([a-z_]+):\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    v = v.replace(/\s+#.*$/, '').trim();
    v = v.replace(/^["']|["']$/g, '');
    out[m[1]] = v;
  }
  return out;
}

function stripQuotes(v) {
  return v.replace(/^["']|["']$/g, '');
}

function parseRegistry(text) {
  const consumers = [];
  const lines = text.split(/\r?\n/);
  let cur = null;
  let inConsumers = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '');
    if (/^\s*#/.test(raw)) continue;
    if (/^consumers\s*:/.test(line)) { inConsumers = true; continue; }
    if (!inConsumers) continue;
    const item = line.match(/^\s{2}-\s+([a-z_]+)\s*:\s*(.*)$/);
    if (item) {
      if (cur) consumers.push(cur);
      cur = {};
      cur[item[1]] = stripQuotes(item[2].trim());
      continue;
    }
    const field = line.match(/^\s{4,}([a-z_]+)\s*:\s*(.*)$/);
    if (field && cur) {
      cur[field[1]] = stripQuotes(field[2].trim());
    }
  }
  if (cur) consumers.push(cur);
  return { consumers };
}

function extractPin(text, pinKey) {
  const re = new RegExp(`^${pinKey}\\s*:\\s*(.*)$`, 'm');
  const m = text.match(re);
  if (!m) return null;
  return stripQuotes(m[1].replace(/\s+#.*$/, '').trim());
}

// HEAD commit SHA of the source repo (acme-corp has no version tags).
function headCommit(repoRoot) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// Compare a pinned SHA against the source HEAD SHA.
// Returns 'current', 'behind', or 'unparseable'.
function shaStatus(pin, head) {
  if (!pin || !head) return 'unparseable';
  // Accept short-SHA prefix match so 7-char and 40-char SHAs interoperate.
  const shorter = pin.length <= head.length ? pin : head;
  const longer = pin.length <= head.length ? head : pin;
  if (longer.startsWith(shorter)) return 'current';
  return 'behind';
}

async function checkoutConsumer(consumer) {
  const safeName = consumer.repo.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const dest = join(WORKDIR, safeName);
  await mkdir(WORKDIR, { recursive: true });
  if (existsSync(dest)) {
    try {
      execFileSync('git', ['-C', dest, 'fetch', '--depth', '1', 'origin'],
        { stdio: ['ignore', 'ignore', 'pipe'] });
      execFileSync('git', ['-C', dest, 'reset', '--hard', 'origin/HEAD'],
        { stdio: ['ignore', 'ignore', 'pipe'] });
      return dest;
    } catch {
      await rm(dest, { recursive: true, force: true });
    }
  }
  execFileSync('git', ['clone', '--depth', '1', consumer.clone, dest],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  return dest;
}

async function findAdrs(root, subpath) {
  const dir = join(root, subpath);
  if (!existsSync(dir)) return [];
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (/^ADR-\d{4}-.+\.md$/.test(e.name)) out.push(join(dir, e.name));
  }
  return out.sort();
}

// --- main ------------------------------------------------------------------

async function main() {
  if (!existsSync(REGISTRY)) {
    process.stderr.write(`discovery: registry not found: ${REGISTRY}\n`);
    process.exit(2);
  }
  const registryText = await readFile(REGISTRY, 'utf8');
  const { consumers } = parseRegistry(registryText);
  if (consumers.length === 0) {
    process.stderr.write(`discovery: registry lists no consumers\n`);
    process.exit(2);
  }

  const head = headCommit(SOURCE_REPO);
  if (!head) {
    process.stderr.write(`discovery: could not determine HEAD commit of ${SOURCE_REPO}\n`);
    process.exit(2);
  }

  const entries = [];
  for (const c of consumers) {
    const entry = { repo: c.repo, role: c.role || null, head_commit: head };
    try {
      const dest = await checkoutConsumer(c);
      const pinText = await readFile(join(dest, c.pin_file), 'utf8');
      const pin = extractPin(pinText, c.pin_key);
      entry.pin = pin;
      entry.status = shaStatus(pin, head);

      const adrs = await findAdrs(dest, c.decisions_path);
      const stale = [];
      for (const abs of adrs) {
        const text = await readFile(abs, 'utf8');
        const { fm } = splitFrontMatter(text);
        const parsed = parseFm(fm);
        if (parsed.status !== 'proposed') continue;
        const age = daysBetween(parsed.date, NOW);
        if (age === null) continue;
        if (age >= STALE_DAYS) {
          stale.push({ id: parsed.id || abs.split(/[\\/]/).pop(), age_days: age, date: parsed.date });
        }
      }
      entry.stale_proposed = stale;
    } catch (err) {
      entry.status = 'error';
      entry.error = err.message.split('\n')[0];
    }
    entries.push(entry);
  }

  emitDigest(entries, head);
}

// --- output ----------------------------------------------------------------

function emitDigest(entries, head) {
  const y = [];
  y.push('# Discovery digest');
  y.push(`# source_repo: transitrix/acme-corp`);
  y.push(`# head_commit: ${head}`);
  y.push(`# run_at: ${new Date().toISOString()}`);
  y.push(`# stale_threshold_days: ${STALE_DAYS}`);
  y.push('entries:');
  for (const e of entries) {
    y.push(`  - repo: ${e.repo}`);
    if (e.role) y.push(`    role: ${e.role}`);
    y.push(`    head_commit: ${e.head_commit}`);
    y.push(`    pin: ${e.pin ?? 'null'}`);
    y.push(`    status: ${e.status}`);
    if (e.error) y.push(`    error: ${JSON.stringify(e.error)}`);
    if (e.stale_proposed && e.stale_proposed.length) {
      y.push(`    stale_proposed:`);
      for (const s of e.stale_proposed) {
        y.push(`      - id: ${s.id}`);
        y.push(`        age_days: ${s.age_days}`);
        y.push(`        date: ${s.date}`);
      }
    } else {
      y.push(`    stale_proposed: []`);
    }
  }
  const out = y.join('\n') + '\n';
  process.stdout.write(out);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = renderMarkdown(entries, head);
    appendFile(process.env.GITHUB_STEP_SUMMARY, md).catch(() => { /* best-effort */ });
  }
}

function renderMarkdown(entries, head) {
  const lines = [];
  lines.push(`## Discovery digest`);
  lines.push('');
  lines.push(`- Source repo: \`transitrix/acme-corp\``);
  lines.push(`- HEAD commit: \`${head}\``);
  lines.push(`- Run at: ${new Date().toISOString()}`);
  lines.push(`- Stale-proposed threshold: ${STALE_DAYS} days`);
  lines.push('');
  lines.push(`| Consumer | Role | Pin | Status | Stale-proposed ADRs |`);
  lines.push(`|---|---|---|---|---|`);
  for (const e of entries) {
    const pinShort = e.pin ? e.pin.slice(0, 8) : '—';
    const stale = (e.stale_proposed || []).map(s => `${s.id} (${s.age_days}d)`).join(', ') || '—';
    lines.push(`| \`${e.repo}\` | ${e.role || '—'} | \`${pinShort}\` | ${e.status}${e.error ? ` — ${e.error}` : ''} | ${stale} |`);
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

main().catch((err) => {
  process.stderr.write(`discovery: ${err.stack || err.message}\n`);
  process.exit(2);
});
