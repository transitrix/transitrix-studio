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
  CANONICAL_NOTATION_FILE_EXTENSIONS,
  inferNotationFromFilename,
} from '../src/validate-notation.js';
// Imported directly to prove the CLI dispatch mirrors the validator the VS Code
// preview uses — same findings, no drift (vkgeorgia/strategy#258).
import { parseCanonicalGoals } from '../packages/diagrams/src/goals/parse-canonical.js';
import { validateApplicationsCatalogue } from '../packages/diagrams/src/applications/validate.js';
import { validateCapabilityMap } from '../packages/diagrams/src/capability-map/validate.js';
import { validateProductsCatalogue } from '../packages/diagrams/src/products/validate.js';
import { validateScenario } from '../packages/diagrams/src/scenarios/validate.js';
import { validateProcessMap } from '../packages/diagrams/src/process-map/validate.js';

const corpusRoot = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'notation-corpus');

// Group A — shared package validators already used by the preview before Phase B.
const GROUP_A = [
  'goals',
  'dgca',
  'dga',
  'action',
  'action-card',
  'process-blueprint',
  'blocks',
];

// Group B — deduped from extension inline copies in Phase B; package is now canonical.
const GROUP_B = [
  'applications',
  'capability-map',
  'products',
  'scenarios',
  'process-map',
];

const ALL_NOTATIONS = [...GROUP_A, ...GROUP_B];

function fixtures(notation: string): string[] {
  return readdirSync(join(corpusRoot, notation))
    .filter((f) => f.endsWith('.transitrix.yaml'))
    .map((f) => join(corpusRoot, notation, f));
}

describe('validate-notation — canonical extension helpers (#343)', () => {
  it('CANONICAL_NOTATION_FILE_EXTENSIONS has one entry per validatable notation', () => {
    expect(CANONICAL_NOTATION_FILE_EXTENSIONS).toHaveLength(FILE_VALIDATABLE_NOTATIONS.length);
    for (const notation of FILE_VALIDATABLE_NOTATIONS) {
      expect(CANONICAL_NOTATION_FILE_EXTENSIONS).toContain(`.${notation}.transitrix.yaml`);
    }
  });

  it('inferNotationFromFilename matches canonical extensions', () => {
    expect(inferNotationFromFilename('foo/bar.dgca.transitrix.yaml')).toBe('dgca');
    expect(inferNotationFromFilename('foo/bar.goals.transitrix.yaml')).toBe('goals');
    expect(inferNotationFromFilename('foo/bar.capability-map.transitrix.yaml')).toBe('capability-map');
    expect(inferNotationFromFilename('foo/bar.action-card.transitrix.yaml')).toBe('action-card');
    // Windows backslash paths
    expect(inferNotationFromFilename('foo\\bar.dgca.transitrix.yaml')).toBe('dgca');
  });

  it('inferNotationFromFilename returns undefined for non-canonical names', () => {
    expect(inferNotationFromFilename('foo.bpmn.transitrix.yaml')).toBeUndefined();
    expect(inferNotationFromFilename('foo.yaml')).toBeUndefined();
    expect(inferNotationFromFilename('foo.unknown.transitrix.yaml')).toBeUndefined();
    expect(inferNotationFromFilename('foo.dgca.yaml')).toBeUndefined(); // missing .transitrix
  });
});

describe('validate-notation — dispatch (#258)', () => {
  it('recognises all Group A and Group B notations', () => {
    for (const n of ALL_NOTATIONS) expect(isFileValidatableNotation(n)).toBe(true);
    expect([...FILE_VALIDATABLE_NOTATIONS].sort()).toEqual([...ALL_NOTATIONS].sort());
  });

  it('does not claim BPMN, non-diagram views, or unknown notations', () => {
    for (const n of ['bpmn', 'compliance-impact', 'coverage-metric', 'nonsense']) {
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
  for (const notation of ALL_NOTATIONS) {
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

  // Group B parity — CLI dispatch calls the same package function the extension now imports.
  it('applications: CLI findings mirror validateApplicationsCatalogue exactly', () => {
    const broken = { notation: 'applications' };
    const raw = validateApplicationsCatalogue(broken);
    const report = validateNotationDoc('applications', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.isValid).toBe(false);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('capability-map: CLI findings mirror validateCapabilityMap exactly', () => {
    const broken = { notation: 'capability-map' };
    const raw = validateCapabilityMap(broken);
    const report = validateNotationDoc('capability-map', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.isValid).toBe(false);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('products: CLI findings mirror validateProductsCatalogue exactly', () => {
    const broken = { notation: 'products' };
    const raw = validateProductsCatalogue(broken);
    const report = validateNotationDoc('products', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.isValid).toBe(false);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('scenarios: CLI findings mirror validateScenario exactly', () => {
    const broken = { notation: 'scenarios' };
    const raw = validateScenario(broken);
    const report = validateNotationDoc('scenarios', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.isValid).toBe(false);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('process-map: CLI findings mirror validateProcessMap exactly', () => {
    const broken = { notation: 'process-map' };
    const raw = validateProcessMap(broken);
    const report = validateNotationDoc('process-map', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.isValid).toBe(false);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });
});
