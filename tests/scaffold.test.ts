import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  collectExistingCanonIds,
  parseNewArgv,
  scaffoldConstraintElement,
  scaffoldDriverElement,
  scaffoldGoalElement,
  scaffoldRequirementElement,
} from '../src/scaffold.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'dist', 'cli.js');

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function makeRepo(): string {
  return mkdtempSync(join(tmpdir(), 'tx-scaffold-'));
}

function writeCanonElement(root: string, relPath: string, id: string): void {
  const abs = join(root, 'canon', 'elements', relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `notation: driver\nid: ${id}\nname: "Existing"\n`, 'utf-8');
}

// ── parseNewArgv ─────────────────────────────────────────────────────────

describe('parseNewArgv', () => {
  it('recognises the goal subtype', () => {
    expect(parseNewArgv(['goal']).type).toBe('goal');
    expect(parseNewArgv(['nonsense']).type).toBeUndefined();
  });

  it('parses --id/--name/--author both as separate and = forms', () => {
    const r = parseNewArgv(['goal', '--id', 'GOAL-X-1', '--name=Grow revenue', '--author', 'a.b']);
    expect(r.id).toBe('GOAL-X-1');
    expect(r.name).toBe('Grow revenue');
    expect(r.author).toBe('a.b');
  });

  it('parses --factors as a comma-split list', () => {
    const r = parseNewArgv(['goal', '--factors', 'DRIVER-A-1, DRIVER-B-2']);
    expect(r.factors).toEqual(['DRIVER-A-1', 'DRIVER-B-2']);
  });

  it('parses --level as a number', () => {
    expect(parseNewArgv(['goal', '--level', '2']).level).toBe(2);
  });

  it('parses --dry-run and --help', () => {
    expect(parseNewArgv(['goal', '--dry-run']).dryRun).toBe(true);
    expect(parseNewArgv(['goal', '--help']).wantsHelp).toBe(true);
  });

  it('recognises the driver, constraint, and requirement subtypes', () => {
    expect(parseNewArgv(['driver']).type).toBe('driver');
    expect(parseNewArgv(['constraint']).type).toBe('constraint');
    expect(parseNewArgv(['requirement']).type).toBe('requirement');
  });

  it('parses type-specific flags for driver/constraint/requirement', () => {
    const d = parseNewArgv(['driver', '--type', 'external', '--category', 'legal', '--references-constraint', 'CONSTRAINT-A-1, CONSTRAINT-B-2']);
    expect(d.typeValue).toBe('external');
    expect(d.category).toBe('legal');
    expect(d.referencesConstraint).toEqual(['CONSTRAINT-A-1', 'CONSTRAINT-B-2']);

    const c = parseNewArgv(['constraint', '--statement', 'MUST NOT', '--status', 'proposed', '--severity', 'mandatory']);
    expect(c.statement).toBe('MUST NOT');
    expect(c.status).toBe('proposed');
    expect(c.severity).toBe('mandatory');

    const r = parseNewArgv(['requirement', '--origin', 'process-product', '--level', 'system', '--kind', 'functional', '--serves', 'NEED-A-1']);
    expect(r.origin).toBe('process-product');
    expect(r.levelRaw).toBe('system');
    expect(r.kind).toBe('functional');
    expect(r.serves).toBe('NEED-A-1');
  });
});

// ── scaffoldGoalElement ──────────────────────────────────────────────────

describe('scaffoldGoalElement', () => {
  it('computes the full envelope for a minimal valid goal', () => {
    const root = makeRepo();
    const outcome = scaffoldGoalElement({
      root,
      id: 'GOAL-REVENUE-1',
      name: 'Grow revenue',
      admittedBy: 'v.korobeinikov',
      today: '2026-08-02',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.relPath).toBe('canon/elements/01_motivation/goals/GOAL-REVENUE-1.yaml');
    expect(outcome.content).toContain('zone: canon');
    expect(outcome.content).toContain('admitted_at: "2026-08-02"');
    expect(outcome.content).toContain('admitted_by: "v.korobeinikov"');
    expect(outcome.content).toContain('valid_from: "2026-08-02"');
    expect(outcome.content).toContain('valid_to: null');
    expect(outcome.content).toContain('uniqueness: pass');
    expect(outcome.filled).toEqual(
      expect.arrayContaining(['zone', 'admitted_at', 'admitted_by', 'gate_checks', 'valid_from', 'valid_to']),
    );
  });

  it('rejects an id that does not match the GOAL grammar', () => {
    const root = makeRepo();
    const outcome = scaffoldGoalElement({
      root,
      id: 'NOTAGOAL-1',
      name: 'x',
      admittedBy: 'a.b',
      today: '2026-08-02',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/GOAL-\[<middle>-]<INTEGER>/);
  });

  it('rejects a missing name', () => {
    const root = makeRepo();
    const outcome = scaffoldGoalElement({ root, id: 'GOAL-X-1', name: '  ', admittedBy: 'a.b', today: '2026-08-02' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/name is required/);
  });

  it('rejects a missing admittedBy identity', () => {
    const root = makeRepo();
    const outcome = scaffoldGoalElement({ root, id: 'GOAL-X-1', name: 'x', admittedBy: '', today: '2026-08-02' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/admitted_by identity/);
  });

  it('gate_checks.uniqueness fails when the id already exists in canon', () => {
    const root = makeRepo();
    writeCanonElement(root, '01_motivation/goals/GOAL-DUP-1.yaml', 'GOAL-DUP-1');
    const outcome = scaffoldGoalElement({ root, id: 'GOAL-DUP-1', name: 'x', admittedBy: 'a.b', today: '2026-08-02' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/uniqueness/);
  });

  it('gate_checks.consistency fails when a referenced factor does not exist in canon', () => {
    const root = makeRepo();
    const outcome = scaffoldGoalElement({
      root,
      id: 'GOAL-X-1',
      name: 'x',
      admittedBy: 'a.b',
      today: '2026-08-02',
      factors: ['DRIVER-MISSING-1'],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/consistency.*DRIVER-MISSING-1/);
  });

  it('gate_checks.consistency passes when every referenced factor exists in canon', () => {
    const root = makeRepo();
    writeCanonElement(root, '01_motivation/factors/DRIVER-A-1.yaml', 'DRIVER-A-1');
    const outcome = scaffoldGoalElement({
      root,
      id: 'GOAL-X-1',
      name: 'x',
      admittedBy: 'a.b',
      today: '2026-08-02',
      factors: ['DRIVER-A-1'],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.content).toContain('factors: [DRIVER-A-1]');
  });
});

// ── scaffoldDriverElement ────────────────────────────────────────────────

describe('scaffoldDriverElement', () => {
  it('computes the full envelope for a minimal valid driver', () => {
    const root = makeRepo();
    const outcome = scaffoldDriverElement({
      root,
      id: 'DRIVER-EU-REG-1',
      name: 'EU regulatory window',
      admittedBy: 'v.korobeinikov',
      today: '2026-08-03',
      driverType: 'external',
      category: 'legal',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.relPath).toBe('canon/elements/01_motivation/factors/DRIVER-EU-REG-1.yaml');
    expect(outcome.content).toContain('notation: driver');
    expect(outcome.content).toContain('type: external');
    expect(outcome.content).toContain('category: legal');
    expect(outcome.content).toContain('admitted_by: "v.korobeinikov"');
  });

  it('rejects an id that does not match the DRIVER grammar', () => {
    const root = makeRepo();
    const outcome = scaffoldDriverElement({ root, id: 'FACTOR-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/DRIVER-\[<middle>-]<INTEGER>/);
  });

  it('gate_checks.consistency fails when a referenced constraint does not exist in canon', () => {
    const root = makeRepo();
    const outcome = scaffoldDriverElement({
      root, id: 'DRIVER-X-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03',
      referencesConstraint: ['CONSTRAINT-MISSING-1'],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/consistency.*CONSTRAINT-MISSING-1/);
  });

  it('gate_checks.consistency passes when the referenced constraint exists in canon', () => {
    const root = makeRepo();
    writeCanonElement(root, '01_motivation/constraints/CONSTRAINT-A-1.yaml', 'CONSTRAINT-A-1');
    const outcome = scaffoldDriverElement({
      root, id: 'DRIVER-X-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03',
      referencesConstraint: ['CONSTRAINT-A-1'],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.content).toContain('references_constraint: [CONSTRAINT-A-1]');
  });
});

// ── scaffoldConstraintElement ────────────────────────────────────────────

describe('scaffoldConstraintElement', () => {
  it('computes the full envelope for a minimal valid constraint, defaulting status to active', () => {
    const root = makeRepo();
    const outcome = scaffoldConstraintElement({
      root,
      id: 'CONSTRAINT-GDPR-RESIDENCY-1',
      name: 'EU data must stay in EU',
      admittedBy: 'v.korobeinikov',
      today: '2026-08-03',
      statement: 'Personal data MUST NOT leave the EEA',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.relPath).toBe('canon/elements/01_motivation/constraints/CONSTRAINT-GDPR-RESIDENCY-1.yaml');
    expect(outcome.content).toContain('notation: constraint');
    expect(outcome.content).toContain('statement: "Personal data MUST NOT leave the EEA"');
    expect(outcome.content).toContain('status: active');
  });

  it('honours an explicit --status value', () => {
    const root = makeRepo();
    const outcome = scaffoldConstraintElement({
      root, id: 'CONSTRAINT-X-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03',
      statement: 's', status: 'proposed',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.content).toContain('status: proposed');
  });

  it('rejects a missing statement', () => {
    const root = makeRepo();
    const outcome = scaffoldConstraintElement({ root, id: 'CONSTRAINT-X-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03', statement: '  ' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/statement is required/);
  });

  it('gate_checks.consistency fails when parent does not exist in canon', () => {
    const root = makeRepo();
    const outcome = scaffoldConstraintElement({
      root, id: 'CONSTRAINT-X-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03',
      statement: 's', parent: 'CONSTRAINT-MISSING-1',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/consistency.*CONSTRAINT-MISSING-1/);
  });

  it('refuses to scaffold agreement: agreed — a tool must never write it (AGREE-002)', () => {
    const root = makeRepo();
    const outcome = scaffoldConstraintElement({
      root, id: 'CONSTRAINT-X-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03',
      statement: 's', agreement: 'agreed', agreedBy: 'v.korobeinikov',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/agreement: agreed cannot be scaffolded/);
    expect(outcome.errors.join(' ')).toMatch(/AGREE-002/);
  });

  it('renders draft/disputed agreement lines', () => {
    const root = makeRepo();
    const outcome = scaffoldConstraintElement({
      root, id: 'CONSTRAINT-X-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03',
      statement: 's', agreement: 'disputed', agreedBy: 'v.korobeinikov', agreedAt: '2026-08-03',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.content).toContain('agreement: disputed');
    expect(outcome.content).toContain('agreed_by: "v.korobeinikov"');
    expect(outcome.content).toContain('agreed_at: "2026-08-03"');
  });
});

// ── scaffoldRequirementElement ───────────────────────────────────────────

describe('scaffoldRequirementElement', () => {
  it('computes the full envelope for a minimal valid requirement', () => {
    const root = makeRepo();
    const outcome = scaffoldRequirementElement({
      root,
      id: 'REQUIREMENT-AUDIT-LOG-RETENTION-1',
      name: 'Retain audit logs',
      admittedBy: 'v.korobeinikov',
      today: '2026-08-03',
      description: 'Must retain logs 12 months',
      origin: 'process-product',
      level: 'system',
      kind: 'functional',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.relPath).toBe('canon/elements/01_motivation/requirements/REQUIREMENT-AUDIT-LOG-RETENTION-1.yaml');
    expect(outcome.content).toContain('notation: requirement');
    expect(outcome.content).toContain('origin: process-product');
    expect(outcome.content).toContain('level: system');
    expect(outcome.content).toContain('kind: functional');
  });

  it('rejects a missing description', () => {
    const root = makeRepo();
    const outcome = scaffoldRequirementElement({ root, id: 'REQUIREMENT-X-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03', description: '  ' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/description is required/);
  });

  it('gate_checks.consistency fails when serves does not resolve to an existing canon id', () => {
    const root = makeRepo();
    const outcome = scaffoldRequirementElement({
      root, id: 'REQUIREMENT-X-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03',
      description: 'd', serves: 'NEED-MISSING-1',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/consistency.*NEED-MISSING-1/);
  });

  it('gate_checks.consistency passes when serves resolves to an existing canon id', () => {
    const root = makeRepo();
    writeCanonElement(root, '01_motivation/needs/NEED-A-1.yaml', 'NEED-A-1');
    const outcome = scaffoldRequirementElement({
      root, id: 'REQUIREMENT-X-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03',
      description: 'd', serves: 'NEED-A-1',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.content).toContain('serves: NEED-A-1');
  });

  it('refuses to scaffold agreement: agreed — a tool must never write it (AGREE-002)', () => {
    const root = makeRepo();
    const outcome = scaffoldRequirementElement({
      root, id: 'REQUIREMENT-X-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03',
      description: 'd', agreement: 'agreed', agreedBy: 'v.korobeinikov',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/agreement: agreed cannot be scaffolded/);
    expect(outcome.errors.join(' ')).toMatch(/AGREE-002/);
  });

  it('refuses agreement: agreed regardless of admittedBy — the tool is the writer either way', () => {
    const root = makeRepo();
    // Even a plainly human admittedBy/agreedBy does not matter: the refusal
    // is on the write path (this command), not on whether agreed_by "looks
    // like a tool" — that heuristic is the *validator*'s AGREE-002 check,
    // a separate and looser rule than this unconditional scaffold refusal.
    const outcome = scaffoldRequirementElement({
      root, id: 'REQUIREMENT-X-1', name: 'x', admittedBy: 'v.korobeinikov', today: '2026-08-03',
      description: 'd', agreement: 'agreed', agreedBy: 'v.korobeinikov',
    });
    expect(outcome.ok).toBe(false);
  });

  it('renders draft agreement with no agreed_at when omitted', () => {
    const root = makeRepo();
    const outcome = scaffoldRequirementElement({
      root, id: 'REQUIREMENT-X-1', name: 'x', admittedBy: 'a.b', today: '2026-08-03',
      description: 'd', agreement: 'draft', agreedBy: 'v.korobeinikov',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.content).toContain('agreement: draft');
    expect(outcome.content).toContain('agreed_by: "v.korobeinikov"');
    expect(outcome.content).not.toContain('agreed_at:');
  });
});

describe('collectExistingCanonIds', () => {
  it('returns an empty set when canon/ does not exist', () => {
    const root = makeRepo();
    expect(collectExistingCanonIds(root).size).toBe(0);
  });

  it('collects ids from both elements/ and relations/', () => {
    const root = makeRepo();
    writeCanonElement(root, '01_motivation/goals/GOAL-A-1.yaml', 'GOAL-A-1');
    const relAbs = join(root, 'canon', 'relations', 'REL-A-1.yaml');
    mkdirSync(dirname(relAbs), { recursive: true });
    writeFileSync(relAbs, 'notation: relation\nid: REL-A-1\ntype: goal_parent\n', 'utf-8');
    const ids = collectExistingCanonIds(root);
    expect(ids.has('GOAL-A-1')).toBe(true);
    expect(ids.has('REL-A-1')).toBe(true);
  });
});

// ── CLI integration ──────────────────────────────────────────────────────

describe('transitrix new goal (CLI)', () => {
  it('writes a complete element file and reports the filled fields', () => {
    const root = makeRepo();
    const { status, stdout } = runCli([
      'new', 'goal',
      '--id', 'GOAL-REVENUE-1',
      '--name', 'Grow revenue',
      '--author', 'a.b',
      '--root', root,
    ]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/wrote canon\/elements\/01_motivation\/goals\/GOAL-REVENUE-1\.yaml/);
    const written = readFileSync(
      join(root, 'canon', 'elements', '01_motivation', 'goals', 'GOAL-REVENUE-1.yaml'),
      'utf-8',
    );
    expect(written).toContain('admitted_by: "a.b"');
  });

  it('--dry-run prints the content without writing', () => {
    const root = makeRepo();
    const { status, stdout } = runCli([
      'new', 'goal',
      '--id', 'GOAL-PREVIEW-1',
      '--name', 'Preview only',
      '--author', 'a.b',
      '--root', root,
      '--dry-run',
    ]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Would write/);
    expect(existsSync(join(root, 'canon', 'elements', '01_motivation', 'goals', 'GOAL-PREVIEW-1.yaml'))).toBe(false);
  });

  it('exits 1 and reports gate-check failures without writing', () => {
    const root = makeRepo();
    writeCanonElement(root, '01_motivation/goals/GOAL-DUP-1.yaml', 'GOAL-DUP-1');
    const { status, stderr } = runCli([
      'new', 'goal',
      '--id', 'GOAL-DUP-1',
      '--name', 'Duplicate',
      '--author', 'a.b',
      '--root', root,
    ]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/uniqueness/);
  });

  it('exits 1 when --id/--name are missing', () => {
    const root = makeRepo();
    const { status, stderr } = runCli(['new', 'goal', '--root', root]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/--id and --name are required/);
  });

  it('--help exits 0', () => {
    const { status, stderr } = runCli(['new', '--help']);
    expect(status).toBe(0);
    expect(stderr).toMatch(/transitrix new goal/);
  });
});

describe('transitrix new driver/constraint/requirement (CLI)', () => {
  it('writes a complete DRIVER element file', () => {
    const root = makeRepo();
    const { status, stdout } = runCli([
      'new', 'driver',
      '--id', 'DRIVER-EU-REG-1',
      '--name', 'EU regulatory window',
      '--type', 'external',
      '--category', 'legal',
      '--author', 'a.b',
      '--root', root,
    ]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/wrote canon\/elements\/01_motivation\/factors\/DRIVER-EU-REG-1\.yaml/);
  });

  it('writes a complete CONSTRAINT element file, defaulting status to active', () => {
    const root = makeRepo();
    const { status, stdout } = runCli([
      'new', 'constraint',
      '--id', 'CONSTRAINT-GDPR-RESIDENCY-1',
      '--name', 'EU data must stay in EU',
      '--statement', 'Personal data MUST NOT leave the EEA',
      '--author', 'a.b',
      '--root', root,
    ]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/wrote canon\/elements\/01_motivation\/constraints\/CONSTRAINT-GDPR-RESIDENCY-1\.yaml/);
    const written = readFileSync(
      join(root, 'canon', 'elements', '01_motivation', 'constraints', 'CONSTRAINT-GDPR-RESIDENCY-1.yaml'),
      'utf-8',
    );
    expect(written).toContain('status: active');
  });

  it('exits 1 when constraint --statement is missing', () => {
    const root = makeRepo();
    const { status, stderr } = runCli(['new', 'constraint', '--id', 'CONSTRAINT-X-1', '--name', 'x', '--root', root]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/--statement is required/);
  });

  it('writes a complete REQUIREMENT element file', () => {
    const root = makeRepo();
    const { status, stdout } = runCli([
      'new', 'requirement',
      '--id', 'REQUIREMENT-AUDIT-LOG-RETENTION-1',
      '--name', 'Retain audit logs',
      '--description', 'Must retain logs 12 months',
      '--author', 'a.b',
      '--root', root,
    ]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/wrote canon\/elements\/01_motivation\/requirements\/REQUIREMENT-AUDIT-LOG-RETENTION-1\.yaml/);
  });

  it('exits 1 when requirement --description is missing', () => {
    const root = makeRepo();
    const { status, stderr } = runCli(['new', 'requirement', '--id', 'REQUIREMENT-X-1', '--name', 'x', '--root', root]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/--description is required/);
  });

  it('exits 1 and refuses --agreement agreed — a tool must never write it (AGREE-002)', () => {
    const root = makeRepo();
    const { status, stderr } = runCli([
      'new', 'requirement',
      '--id', 'REQUIREMENT-X-1', '--name', 'x', '--description', 'd',
      '--agreement', 'agreed', '--agreed-by', 'v.korobeinikov',
      '--author', 'a.b', '--root', root,
    ]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/AGREE-002/);
    expect(existsSync(join(root, 'canon', 'elements', '01_motivation', 'requirements', 'REQUIREMENT-X-1.yaml'))).toBe(false);
  });

  it('writes a REQUIREMENT with agreement: draft via --agreement', () => {
    const root = makeRepo();
    const { status } = runCli([
      'new', 'requirement',
      '--id', 'REQUIREMENT-X-1', '--name', 'x', '--description', 'd',
      '--agreement', 'draft', '--agreed-by', 'v.korobeinikov',
      '--author', 'a.b', '--root', root,
    ]);
    expect(status).toBe(0);
    const written = readFileSync(
      join(root, 'canon', 'elements', '01_motivation', 'requirements', 'REQUIREMENT-X-1.yaml'),
      'utf-8',
    );
    expect(written).toContain('agreement: draft');
    expect(written).toContain('agreed_by: "v.korobeinikov"');
  });
});
