// blocks matrix subset (08-blocks.md §4a/§6/§6a) — grid: root CLI validation
// end-to-end, plus the --template opt-in mechanism.
//
// This is the real-world acceptance check: `npx @transitrix/cli validate
// <raci file> --template raci` must PASS a well-formed RACI grid (exactly one
// "A" per row) and FAIL a row with zero or two "A"s. The fixture below mirrors
// methodology's templates/raci/raci.blocks.transitrix.yaml (a forkable public
// template, not adopter data).

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'dist', 'cli.js');

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const RACI_HEADER = `notation: blocks
spec_version: "0.1"
name: "RACI — Architecture change governance"
generated_at: "2026-07-26"
`;

/** One row's `assign:` map, given as `col-id: letter` pairs. */
function raciDoc(rows: Array<{ id: string; name: string; assign: Record<string, string> }>): string {
  const assignLines = (assign: Record<string, string>) =>
    Object.entries(assign)
      .map(([col, val]) => `${col}: "${val}"`)
      .join(', ');
  const rowsYaml = rows
    .map((r) => `    - id: ${r.id}\n      name: "${r.name}"\n      assign: { ${assignLines(r.assign)} }`)
    .join('\n');
  return `${RACI_HEADER}
grid:
  columns:
    - { id: ROLE-PRODUCT,   name: "Product Owner" }
    - { id: ROLE-LEAD-ARCH, name: "Lead Architect" }
    - { id: ROLE-SECURITY,  name: "Security & Risk" }

  rows:
${rowsYaml}
`;
}

const WELL_FORMED = raciDoc([
  { id: 'ACT-PROPOSE', name: 'Propose a change', assign: { 'ROLE-PRODUCT': 'A', 'ROLE-LEAD-ARCH': 'C' } },
  { id: 'ACT-ASSESS', name: 'Assess impact', assign: { 'ROLE-LEAD-ARCH': 'A', 'ROLE-SECURITY': 'C' } },
]);

const ZERO_A = raciDoc([
  { id: 'ACT-PROPOSE', name: 'Propose a change', assign: { 'ROLE-PRODUCT': 'R', 'ROLE-LEAD-ARCH': 'C' } },
]);

const TWO_A = raciDoc([
  { id: 'ACT-PROPOSE', name: 'Propose a change', assign: { 'ROLE-PRODUCT': 'A', 'ROLE-LEAD-ARCH': 'A' } },
]);

describe('transitrix validate — blocks grid: root (§4a/§6)', () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const t of temps) rmSync(t, { recursive: true, force: true });
    temps.length = 0;
  });

  function writeFixture(name: string, content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'tx-blocks-grid-'));
    temps.push(dir);
    const file = join(dir, name);
    writeFileSync(file, content, 'utf8');
    return file;
  }

  it('passes a well-formed grid: document with no --template (base BL-02x rules only)', () => {
    const file = writeFixture('raci.blocks.transitrix.yaml', WELL_FORMED);
    const { status, stdout } = runCli(['validate', file]);
    expect(status).toBe(0);
    expect(stdout).toContain('valid');
  });

  it('a row with zero "A"s still passes without --template — base grid schema does not know RACI', () => {
    const file = writeFixture('raci.blocks.transitrix.yaml', ZERO_A);
    const { status } = runCli(['validate', file]);
    expect(status).toBe(0);
  });

  it('--template raci passes a well-formed RACI (exactly one "A" per row)', () => {
    const file = writeFixture('raci.blocks.transitrix.yaml', WELL_FORMED);
    const { status, stdout } = runCli(['validate', file, '--template', 'raci']);
    expect(status).toBe(0);
    expect(stdout).toContain('valid');
  });

  it('--template raci fails a row with zero "A" assignments', () => {
    const file = writeFixture('raci.blocks.transitrix.yaml', ZERO_A);
    const { status, stdout } = runCli(['validate', file, '--template', 'raci']);
    expect(status).not.toBe(0);
    expect(stdout).toContain('RACI-001');
  });

  it('--template raci fails a row with two "A" assignments', () => {
    const file = writeFixture('raci.blocks.transitrix.yaml', TWO_A);
    const { status, stdout } = runCli(['validate', file, '--template', 'raci']);
    expect(status).not.toBe(0);
    expect(stdout).toContain('RACI-001');
  });

  it('--json --template raci emits RACI-001 as a structured finding', () => {
    const file = writeFixture('raci.blocks.transitrix.yaml', ZERO_A);
    const { status, stdout } = runCli(['validate', file, '--template', 'raci', '--json']);
    expect(status).not.toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(false);
    expect(parsed.findings.some((f: { ruleId: string }) => f.ruleId === 'RACI-001')).toBe(true);
  });

  it('an unrecognised --template name fails clearly rather than silently skipping the check', () => {
    const file = writeFixture('raci.blocks.transitrix.yaml', ZERO_A);
    const { status, stdout } = runCli(['validate', file, '--template', 'not-a-real-template']);
    expect(status).not.toBe(0);
    expect(stdout).toContain('BL-TEMPLATE-UNKNOWN');
  });

  it('BL-020: a document with neither nested_blocks nor grid is rejected', () => {
    const file = writeFixture('empty.blocks.transitrix.yaml', `${RACI_HEADER}\n`);
    const { status, stdout } = runCli(['validate', file]);
    expect(status).not.toBe(0);
    expect(stdout).toContain('BL-020');
  });

  it('BL-025: a dangling assign key referencing an unknown column is rejected', () => {
    const bad = `${RACI_HEADER}
grid:
  columns:
    - { id: ROLE-PRODUCT, name: "Product Owner" }
  rows:
    - id: ACT-PROPOSE
      name: "Propose a change"
      assign: { ROLE-DOES-NOT-EXIST: "A" }
`;
    const file = writeFixture('dangling.blocks.transitrix.yaml', bad);
    const { status, stdout } = runCli(['validate', file]);
    expect(status).not.toBe(0);
    expect(stdout).toContain('BL-025');
  });
});
