import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  isFileValidatableNotation,
  validateNotationDoc,
  loadNotationYaml,
  notationOf,
  FILE_VALIDATABLE_NOTATIONS,
} from '../src/validate-notation.js';
// Imported directly to prove the CLI dispatch mirrors the validator the VS Code
// preview uses — same findings, no drift (vkgeorgia/strategy#258).
import { parseCanonicalGoals } from '../packages/diagrams/src/goals/parse-canonical.js';

const corpusRoot = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'notation-corpus');

// Group A — notations the CLI validates per file by routing on the notation field.
const GROUP_A = [
  'goals',
  'fgca',
  'fga',
  'activities',
  'activity-card',
  'process-blueprint',
  'blocks',
];

function fixtures(notation: string): string[] {
  return readdirSync(join(corpusRoot, notation))
    .filter((f) => f.endsWith('.transitrix.yaml'))
    .map((f) => join(corpusRoot, notation, f));
}

describe('validate-notation — dispatch (#258)', () => {
  it('recognises exactly the Group A notations', () => {
    for (const n of GROUP_A) expect(isFileValidatableNotation(n)).toBe(true);
    expect([...FILE_VALIDATABLE_NOTATIONS].sort()).toEqual([...GROUP_A].sort());
  });

  it('does not claim BPMN, Group B, or unknown notations', () => {
    for (const n of [
      'bpmn',
      'applications',
      'capability-map',
      'products',
      'scenarios',
      'process-map',
      'compliance-impact',
      'nonsense',
    ]) {
      expect(isFileValidatableNotation(n)).toBe(false);
    }
  });

  it('reads the notation field defensively', () => {
    expect(notationOf({ notation: 'goals' })).toBe('goals');
    expect(notationOf({ notation: 123 })).toBeUndefined();
    expect(notationOf({})).toBeUndefined();
    expect(notationOf(null)).toBeUndefined();
    expect(notationOf([1, 2])).toBeUndefined();
  });
});

describe('validate-notation — the notation corpus validates clean (#258)', () => {
  for (const notation of GROUP_A) {
    for (const file of fixtures(notation)) {
      const name = file.slice(corpusRoot.length + 1).replace(/\\/g, '/');
      it(`${name} → valid`, () => {
        const data = loadNotationYaml(readFileSync(file, 'utf8'));
        const report = validateNotationDoc(notation, data);
        const errors = report.findings.filter((f) => f.severity === 'error');
        // Surface the offending findings in the failure message if this regresses.
        expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
        expect(report.isValid).toBe(true);
        expect(report.summary.errorCount).toBe(0);
      });
    }
  }
});

describe('validate-notation — parity with the preview validator (#258)', () => {
  it('goals findings mirror parseCanonicalGoals exactly', () => {
    // A deliberately malformed goals doc — the CLI must surface the same codes
    // the preview shows in its red block.
    const broken = { notation: 'goals', id: 'x', name: 'Broken', goals: [] };
    const raw = parseCanonicalGoals(broken);
    const report = validateNotationDoc('goals', broken);

    const reportErrorCodes = report.findings
      .filter((f) => f.severity === 'error')
      .map((f) => f.ruleId);
    expect(reportErrorCodes).toEqual(raw.errors.map((e) => e.code));
    expect(report.isValid).toBe(raw.valid);
    expect(report.isValid).toBe(false);
    expect(reportErrorCodes.length).toBeGreaterThan(0);
  });

  it('maps validator warnings to advisory findings, not errors', () => {
    const data = loadNotationYaml(readFileSync(fixtures('goals')[0], 'utf8'));
    const raw = parseCanonicalGoals(data);
    const report = validateNotationDoc('goals', data);
    const warningCodes = report.findings
      .filter((f) => f.severity === 'warning')
      .map((f) => f.ruleId);
    expect(warningCodes).toEqual(raw.warnings.map((w) => w.code));
  });
});
