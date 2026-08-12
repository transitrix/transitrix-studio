import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleExportComplianceCommand } from '../src/export-compliance.js';

// transitrix-hq#125 — `--scope gap`'s recursive scan counted any YAML file with
// a matching `notation:` value, including draft/unadmitted requirements and
// vendored example fixtures with no admission record. Only `zone: canon`
// (admission_state absent or `active`) or `zone: codex` material may count.

describe('export-compliance --scope gap: admitted-canon scoping', () => {
  let dir: string;
  let canonDir: string;
  let outFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'export-compliance-gap-scope-test-'));
    canonDir = join(dir, 'canon');
    mkdirSync(canonDir, { recursive: true });
    outFile = join(dir, 'out.md');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const admittedRequirement = [
    'notation: requirement',
    'id: REQUIREMENT-ADMITTED-1',
    'name: "Admitted requirement"',
    'severity: high',
    'zone: canon',
    'admitted_at: "2026-05-28"',
    'admitted_by: "v.korobeinikov"',
  ].join('\n');

  it('excludes a draft requirement with no admission record from the gap count', async () => {
    writeFileSync(join(canonDir, 'admitted.requirement.transitrix.yaml'), admittedRequirement);
    writeFileSync(
      join(canonDir, 'draft.requirement.transitrix.yaml'),
      ['notation: requirement', 'id: REQUIREMENT-DRAFT-1', 'name: "Draft requirement"', 'severity: high'].join('\n'),
    );

    await handleExportComplianceCommand(['--scope', 'gap', '--root', canonDir, '--format', 'md', '--output', outFile]);

    const written = readFileSync(outFile, 'utf-8');
    expect(written).toContain('REQUIREMENT-ADMITTED-1');
    expect(written).not.toContain('REQUIREMENT-DRAFT-1');
    expect(written).toContain('_2 gap(s) across 6 checks_');
  });

  it('excludes a proposed (not-yet-admitted) requirement from the gap count', async () => {
    writeFileSync(join(canonDir, 'admitted.requirement.transitrix.yaml'), admittedRequirement);
    writeFileSync(
      join(canonDir, 'proposed.requirement.transitrix.yaml'),
      [
        'notation: requirement',
        'id: REQUIREMENT-PROPOSED-1',
        'name: "Proposed requirement"',
        'severity: high',
        'zone: canon',
        'admission_state: proposed',
        'proposed_at: "2026-08-01"',
        'proposed_by: "reg-intel-collector"',
      ].join('\n'),
    );

    await handleExportComplianceCommand(['--scope', 'gap', '--root', canonDir, '--format', 'md', '--output', outFile]);

    const written = readFileSync(outFile, 'utf-8');
    expect(written).toContain('REQUIREMENT-ADMITTED-1');
    expect(written).not.toContain('REQUIREMENT-PROPOSED-1');
    expect(written).toContain('_2 gap(s) across 6 checks_');
  });

  it('still counts an admitted requirement with no explicit admission_state (back-compat: absent = active)', async () => {
    writeFileSync(join(canonDir, 'admitted.requirement.transitrix.yaml'), admittedRequirement);

    await handleExportComplianceCommand(['--scope', 'gap', '--root', canonDir, '--format', 'md', '--output', outFile]);

    const written = readFileSync(outFile, 'utf-8');
    expect(written).toContain('REQUIREMENT-ADMITTED-1');
    expect(written).toContain('_2 gap(s) across 6 checks_');
  });
});
