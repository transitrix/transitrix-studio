import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { applyEnvelopeFix, computeFixPlan, isFixableNotation } from '../src/validate-fix.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'dist', 'cli.js');

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function makeRepo(): string {
  return mkdtempSync(join(tmpdir(), 'tx-validate-fix-'));
}

function writeCanonElement(root: string, relPath: string, id: string, notation: string): string {
  const abs = join(root, 'canon', 'elements', relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `notation: ${notation}\nid: ${id}\nname: "Existing"\n`, 'utf-8');
  return abs;
}

const FIXABLE = [
  'actor', 'change', 'driver', 'stakeholder', 'target-state',
  'location', 'business-service', 'integration', 'node', 'technology-service',
];

describe('isFixableNotation', () => {
  it('recognises the ten wired envelope notations', () => {
    for (const n of FIXABLE) expect(isFixableNotation(n)).toBe(true);
  });

  it('rejects notations validate --fix does not support', () => {
    expect(isFixableNotation('goals')).toBe(false);
    expect(isFixableNotation('requirement')).toBe(false);
  });
});

// ── computeFixPlan ───────────────────────────────────────────────────────

describe('computeFixPlan', () => {
  it('fills every derivable envelope field on an ACTOR missing the whole envelope', () => {
    const root = makeRepo();
    const absFilePath = join(root, 'ACTOR-OPS-1.yaml');
    const data = { notation: 'actor', id: 'ACTOR-OPS-1', name: 'Ops', type: 'system' };

    const plan = computeFixPlan('actor', data, { root, absFilePath, author: 'a.b' });

    expect(plan.unresolved).toEqual([]);
    const byField = Object.fromEntries(plan.filled.map((f) => [f.field, f.value]));
    expect(byField.zone).toBe('canon');
    expect(byField.admitted_by).toBe('a.b');
    expect(typeof byField.admitted_at).toBe('string');
    expect(typeof byField.valid_from).toBe('string');
    expect(byField.valid_to).toBeNull();
    expect(byField.gate_checks).toEqual({ uniqueness: 'pass', consistency: 'pass', completeness: 'pass' });
  });

  it('leaves admitted_by unresolved (and gate_checks uncertified) with no --author and no git identity', () => {
    const root = makeRepo();
    const absFilePath = join(root, 'ACTOR-OPS-1.yaml');
    const data = { notation: 'actor', id: 'ACTOR-OPS-1', name: 'Ops', type: 'system' };

    // Isolate from the host's real git identity: neither `root` nor the fake
    // HOME is a git repo / carries a .gitconfig, so `git config user.name`
    // resolves nothing regardless of what's configured on the machine
    // running this test.
    const fakeHome = makeRepo();
    const env = {
      HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE,
      GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM,
    };
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    process.env.GIT_CONFIG_GLOBAL = join(fakeHome, 'does-not-exist.gitconfig');
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    try {
      const plan = computeFixPlan('actor', data, { root, absFilePath });

      const filledFields = plan.filled.map((f) => f.field);
      expect(filledFields).not.toContain('admitted_by');
      expect(filledFields).not.toContain('gate_checks');
      expect(plan.unresolved.map((u) => u.field).sort()).toEqual(['admitted_by', 'gate_checks']);
    } finally {
      for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('never overwrites a field that is present but invalid — only fills what is absent', () => {
    const root = makeRepo();
    const absFilePath = join(root, 'ACTOR-OPS-1.yaml');
    // zone present but wrong value; everything else present and valid; gate_checks absent.
    const data = {
      notation: 'actor', id: 'ACTOR-OPS-1', name: 'Ops', type: 'system',
      zone: 'field', admitted_at: '2026-08-01', admitted_by: 'a.b', valid_from: '2026-08-01', valid_to: null,
    };

    const plan = computeFixPlan('actor', data, { root, absFilePath, author: 'a.b' });

    // zone is present (even though wrong) — --fix must not touch it. And since
    // the bad zone is a real, unresolved finding, gate_checks can't be
    // honestly certified either (it would claim `completeness: pass` on a
    // document that isn't).
    expect(plan.filled).toEqual([]);
    expect(plan.unresolved).toEqual([
      { field: 'gate_checks', reason: expect.stringContaining('ACTOR-001') },
    ]);
  });

  it('does not certify gate_checks when the id already exists elsewhere in canon', () => {
    const root = makeRepo();
    writeCanonElement(root, '02_business/actors/ACTOR-DUP-1.yaml', 'ACTOR-DUP-1', 'actor');
    const absFilePath = join(root, 'ACTOR-DUP-1.yaml');
    const data = {
      notation: 'actor', id: 'ACTOR-DUP-1', name: 'Ops', type: 'system',
      zone: 'canon', admitted_at: '2026-08-01', admitted_by: 'a.b', valid_from: '2026-08-01', valid_to: null,
    };

    const plan = computeFixPlan('actor', data, { root, absFilePath, author: 'a.b' });

    expect(plan.filled).toEqual([]);
    expect(plan.unresolved).toEqual([
      { field: 'gate_checks', reason: expect.stringContaining('ACTOR-DUP-1" also exists elsewhere in canon') },
    ]);
  });

  it('does not certify gate_checks while another finding remains on the document', () => {
    const root = makeRepo();
    const absFilePath = join(root, 'ACTOR-OPS-1.yaml');
    // type is not one of ACTOR_TYPES — a real, unrelated finding (ACTOR-002) that --fix cannot repair.
    const data = {
      notation: 'actor', id: 'ACTOR-OPS-1', name: 'Ops', type: 'not-a-real-type',
      zone: 'canon', admitted_at: '2026-08-01', admitted_by: 'a.b', valid_from: '2026-08-01', valid_to: null,
    };

    const plan = computeFixPlan('actor', data, { root, absFilePath, author: 'a.b' });

    expect(plan.filled).toEqual([]);
    expect(plan.unresolved).toEqual([
      { field: 'gate_checks', reason: expect.stringContaining('ACTOR-002') },
    ]);
  });

  it('is idempotent — nothing left to fill once the envelope is complete', () => {
    const root = makeRepo();
    const absFilePath = join(root, 'ACTOR-OPS-1.yaml');
    const data = {
      notation: 'actor', id: 'ACTOR-OPS-1', name: 'Ops', type: 'system',
      zone: 'canon', admitted_at: '2026-08-01', admitted_by: 'a.b',
      gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
      valid_from: '2026-08-01', valid_to: null,
    };

    const plan = computeFixPlan('actor', data, { root, absFilePath, author: 'a.b' });

    expect(plan.filled).toEqual([]);
    expect(plan.unresolved).toEqual([]);
  });
});

// ── applyEnvelopeFix ─────────────────────────────────────────────────────

describe('applyEnvelopeFix', () => {
  it('inserts fields immediately after the top-level id: line, touching nothing else', () => {
    const text = 'notation: actor\nid: ACTOR-OPS-1\nname: "Ops"\ntype: system\n';
    const result = applyEnvelopeFix(text, [
      { field: 'zone', value: 'canon' },
      { field: 'admitted_at', value: '2026-08-05' },
      { field: 'valid_to', value: null },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('notation: actor\nid: ACTOR-OPS-1\n');
    expect(result.text).toContain('name: "Ops"\ntype: system\n');
    expect(result.text).toContain('zone: canon');
    expect(result.text).toContain('admitted_at: "2026-08-05"');
    expect(result.text).toContain('valid_to: null');
    expect(result.text.indexOf('zone: canon')).toBeLessThan(result.text.indexOf('name: "Ops"'));
  });

  it('renders gate_checks as a nested mapping', () => {
    const text = 'id: A-1\n';
    const result = applyEnvelopeFix(text, [
      { field: 'gate_checks', value: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' } },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('gate_checks:\n  uniqueness: pass\n  consistency: pass\n  completeness: pass');
  });

  it('fails when there is no top-level id: line', () => {
    const result = applyEnvelopeFix('name: "Ops"\n', [{ field: 'zone', value: 'canon' }]);
    expect(result.ok).toBe(false);
  });

  it('fails when there is more than one top-level id: line', () => {
    const result = applyEnvelopeFix('id: A-1\nid: B-2\n', [{ field: 'zone', value: 'canon' }]);
    expect(result.ok).toBe(false);
  });

  it('is a no-op when nothing is filled', () => {
    const text = 'id: A-1\nname: "x"\n';
    const result = applyEnvelopeFix(text, []);
    expect(result).toEqual({ ok: true, text });
  });

  it('does not match an indented (nested) id: line as the anchor', () => {
    const text = 'id: A-1\nreferences:\n  - id: NESTED-1\n';
    const result = applyEnvelopeFix(text, [{ field: 'zone', value: 'canon' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text.indexOf('zone: canon')).toBeLessThan(result.text.indexOf('references:'));
  });
});

// ── CLI end-to-end: `transitrix validate <file> --fix` ──────────────────

describe('transitrix validate --fix (CLI)', () => {
  it('fills the envelope, reports each field, and is idempotent on a second run', () => {
    const root = makeRepo();
    const file = join(root, 'ACTOR-OPS-1.yaml');
    writeFileSync(file, 'notation: actor\nid: ACTOR-OPS-1\nname: "Ops"\ntype: system\n', 'utf-8');

    const first = runCli(['validate', file, '--fix', '--root', root, '--author', 'a.b']);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('filled: zone = "canon"');
    expect(first.stdout).toContain('filled: admitted_by = "a.b"');
    expect(first.stdout).toMatch(/wrote /);

    const afterFirst = readFileSync(file, 'utf-8');
    expect(afterFirst).toContain('zone: canon');
    expect(afterFirst).toContain('gate_checks:');

    const second = runCli(['validate', file, '--fix', '--root', root, '--author', 'a.b']);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('nothing to fix');
    expect(readFileSync(file, 'utf-8')).toBe(afterFirst);
  });

  it('--dry-run reports the plan without writing', () => {
    const root = makeRepo();
    const file = join(root, 'ACTOR-OPS-1.yaml');
    const original = 'notation: actor\nid: ACTOR-OPS-1\nname: "Ops"\ntype: system\n';
    writeFileSync(file, original, 'utf-8');

    const result = runCli(['validate', file, '--fix', '--dry-run', '--root', root, '--author', 'a.b']);
    expect(result.stdout).toContain('dry run — no changes written');
    expect(readFileSync(file, 'utf-8')).toBe(original);
  });

  it('rejects --fix combined with --scope=repo', () => {
    const root = makeRepo();
    const result = runCli(['validate', '--scope=repo', '--fix', '--root', root]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--fix is only supported for file scope');
  });

  it('rejects --fix for a notation it does not yet support', () => {
    const root = makeRepo();
    const file = join(root, 'req.yaml');
    writeFileSync(file, 'notation: requirement\nid: REQUIREMENT-X-1\n', 'utf-8');
    const result = runCli(['validate', file, '--fix', '--root', root]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not yet supported by --fix');
  });
});
