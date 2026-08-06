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
  NOTATIONS_WITH_CANONICAL_VIEW_EXTENSION,
  inferNotationFromFilename,
} from '../src/validate-notation.js';
// Imported directly to prove the CLI dispatch mirrors the validator the VS Code
// preview uses — same findings, no drift.
import { parseCanonicalGoals } from '../packages/diagrams/src/goals/parse-canonical.js';
import { validateApplicationsCatalogue } from '../packages/diagrams/src/applications/validate.js';
import { validateCapabilityMap } from '../packages/diagrams/src/capability-map/validate.js';
import { validateProductsCatalogue } from '../packages/diagrams/src/products/validate.js';
import { validateScenario } from '../packages/diagrams/src/scenarios/validate.js';
import { validateProcessMap } from '../packages/diagrams/src/process-map/validate.js';
import { validateRequirement } from '../packages/diagrams/src/requirement/validate.js';
import { validateAssertion } from '../packages/diagrams/src/assertion/validate.js';
import { validateVerification } from '../packages/diagrams/src/verification/validate.js';
import { validateTargetState } from '../packages/diagrams/src/target-state/validate.js';
import { parseImpactViewConfig } from '../packages/diagrams/src/compliance/impact.js';
import { parseCoverageMetricConfig } from '../packages/diagrams/src/compliance/coverage-metric.js';
import { validateCodex } from '../packages/diagrams/src/codex/validate.js';
import { validateFactor } from '../packages/diagrams/src/factor/validate.js';
import { validateActor } from '../packages/diagrams/src/actor/validate.js';
import { validateChange } from '../packages/diagrams/src/change/validate.js';
import { validateStakeholder } from '../packages/diagrams/src/stakeholder/validate.js';
import { validateLocation } from '../packages/diagrams/src/location/validate.js';
import { validateBusinessService } from '../packages/diagrams/src/business-service/validate.js';

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

// Group C — compliance suite wired in #518 Phase C1–C4, plus the
// methodology-3.1.0 vocabulary follow-on (RISK / METRIC / NEED / VALIDATION).
const GROUP_C = [
  'requirement', 'constraint', 'assertion', 'verification',
  'risk', 'metric', 'need', 'validation',
  'compliance-impact', 'coverage-metric', 'codex',
];

// Group D — standalone canon/elements/** envelope validators wired in one
// notation at a time (previously dead code, called from nowhere).
const GROUP_D = ['driver', 'actor', 'change', 'stakeholder', 'target-state', 'location', 'business-service'];

const ALL_NOTATIONS = [...GROUP_A, ...GROUP_B, ...GROUP_C, ...GROUP_D];

function viewFixtures(notation: string): string[] {
  return readdirSync(join(corpusRoot, notation))
    .filter((f) => f.endsWith('.transitrix.yaml') || f.endsWith('.view.yaml'))
    .map((f) => join(corpusRoot, notation, f));
}

function elementFixtures(notation: string): string[] {
  return readdirSync(join(corpusRoot, notation))
    .filter((f) => f.endsWith('.yaml') && !f.endsWith('.view.yaml'))
    .map((f) => join(corpusRoot, notation, f));
}

describe('validate-notation — canonical extension helpers (#343)', () => {
  it('CANONICAL_NOTATION_FILE_EXTENSIONS covers view notations only', () => {
    expect(CANONICAL_NOTATION_FILE_EXTENSIONS).toHaveLength(
      NOTATIONS_WITH_CANONICAL_VIEW_EXTENSION.length,
    );
    for (const notation of NOTATIONS_WITH_CANONICAL_VIEW_EXTENSION) {
      expect(CANONICAL_NOTATION_FILE_EXTENSIONS).toContain(`.${notation}.transitrix.yaml`);
    }
    expect(CANONICAL_NOTATION_FILE_EXTENSIONS).not.toContain('.requirement.transitrix.yaml');
    expect(CANONICAL_NOTATION_FILE_EXTENSIONS).not.toContain('.assertion.transitrix.yaml');
  });

  it('inferNotationFromFilename matches canonical view extensions', () => {
    expect(inferNotationFromFilename('foo/bar.dgca.transitrix.yaml')).toBe('dgca');
    expect(inferNotationFromFilename('foo/bar.goals.transitrix.yaml')).toBe('goals');
    expect(inferNotationFromFilename('foo/bar.capability-map.transitrix.yaml')).toBe('capability-map');
    expect(inferNotationFromFilename('foo/bar.action-card.transitrix.yaml')).toBe('action-card');
    expect(inferNotationFromFilename('foo/bar.compliance-impact.transitrix.yaml')).toBe('compliance-impact');
    expect(inferNotationFromFilename('foo\\bar.dgca.transitrix.yaml')).toBe('dgca');
  });

  it('inferNotationFromFilename recognises element filenames by typed-id prefix', () => {
    expect(inferNotationFromFilename('canon/elements/REQUIREMENT-DATA-ERASURE-1.yaml')).toBe('requirement');
    expect(inferNotationFromFilename('canon/elements/ASSERTION-CRM-DATA-ERASURE-1.yaml')).toBe('assertion');
  });

  it('inferNotationFromFilename recognises codex typed-id filenames', () => {
    expect(inferNotationFromFilename('codex/external/eu/LAW-GDPR-1.yaml')).toBe('codex');
    expect(inferNotationFromFilename('codex/internal/INTERNAL_STANDARD-coding-conventions-1.yaml')).toBe('codex');
  });

  it('inferNotationFromFilename recognises constraint typed-id filenames', () => {
    expect(inferNotationFromFilename('canon/elements/constraints/CONSTRAINT-GDPR-1.yaml')).toBe('constraint');
  });

  it('inferNotationFromFilename recognises verification typed-id filenames', () => {
    expect(inferNotationFromFilename('canon/verifications/VERIFICATION-DEVICE-ALARM-TEST-1.yaml')).toBe('verification');
  });

  it('inferNotationFromFilename returns undefined for non-canonical names', () => {
    expect(inferNotationFromFilename('foo.bpmn.transitrix.yaml')).toBeUndefined();
    expect(inferNotationFromFilename('foo.yaml')).toBeUndefined();
    expect(inferNotationFromFilename('foo.unknown.transitrix.yaml')).toBeUndefined();
    expect(inferNotationFromFilename('foo.dgca.yaml')).toBeUndefined();
  });
});

describe('validate-notation — dispatch (#258, #518 C1)', () => {
  it('recognises all Group A, B, and C notations', () => {
    for (const n of ALL_NOTATIONS) expect(isFileValidatableNotation(n)).toBe(true);
    expect([...FILE_VALIDATABLE_NOTATIONS].sort()).toEqual([...ALL_NOTATIONS].sort());
  });

  it('does not claim BPMN or unknown notations', () => {
    for (const n of ['bpmn', 'nonsense']) {
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

describe('validate-notation — the view notation corpus validates clean (#258)', () => {
  for (const notation of [...GROUP_A, ...GROUP_B, 'coverage-metric']) {
    for (const file of viewFixtures(notation)) {
      const name = file.slice(corpusRoot.length + 1).replace(/\\/g, '/');
      it(`${name} → valid`, () => {
        const data = loadNotationYaml(readFileSync(file, 'utf8'));
        const report = validateNotationDoc(notation, data);
        const errors = report.findings.filter((f) => f.severity === 'error');
        expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
        expect(report.isValid).toBe(true);
      });
    }
  }

  for (const file of viewFixtures('compliance-impact')) {
    const name = file.slice(corpusRoot.length + 1).replace(/\\/g, '/');
    it(`${name} → valid`, () => {
      const data = loadNotationYaml(readFileSync(file, 'utf8'));
      const report = validateNotationDoc('compliance-impact', data);
      const errors = report.findings.filter((f) => f.severity === 'error');
      expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
      expect(report.isValid).toBe(true);
    });
  }
});

describe('validate-notation — element notation corpus validates clean (#518 C1)', () => {
  for (const notation of ['requirement', 'assertion', 'verification', 'risk', 'metric', 'need', 'validation', 'driver', 'actor', 'change', 'stakeholder', 'target-state', 'location', 'business-service'] as const) {
    for (const file of elementFixtures(notation)) {
      const name = file.slice(corpusRoot.length + 1).replace(/\\/g, '/');
      it(`${name} → valid`, () => {
        const data = loadNotationYaml(readFileSync(file, 'utf8'));
        const report = validateNotationDoc(notation, data);
        const errors = report.findings.filter((f) => f.severity === 'error');
        expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
        expect(report.isValid).toBe(true);
      });
    }
  }
});

describe('validate-notation — constraint corpus validates clean (#518 C4)', () => {
  const dir = join(corpusRoot, 'constraint');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml'))) {
    it(`${f} → valid`, () => {
      const data = loadNotationYaml(readFileSync(join(dir, f), 'utf8'));
      const report = validateNotationDoc('constraint', data);
      const errors = report.findings.filter((x) => x.severity === 'error');
      expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
      expect(report.isValid).toBe(true);
    });
  }
});

describe('validate-notation — codex corpus validates clean (#518 C2)', () => {
  function codexFixtures(): string[] {
    const root = join(corpusRoot, 'codex');
    const out: string[] = [];
    for (const zone of ['external/EU', 'internal']) {
      const dir = join(root, zone);
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml'))) {
        out.push(join(dir, f));
      }
    }
    return out;
  }

  for (const file of codexFixtures()) {
    const name = file.slice(corpusRoot.length + 1).replace(/\\/g, '/');
    it(`${name} → valid`, () => {
      const data = loadNotationYaml(readFileSync(file, 'utf8'));
      const report = validateNotationDoc('codex', data, { filePath: name });
      const errors = report.findings.filter((f) => f.severity === 'error');
      expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
      expect(report.isValid).toBe(true);
    });
  }
});

describe('validate-notation — parity with the preview validator (#258, #518 C1)', () => {
  it('goals findings mirror parseCanonicalGoals exactly', () => {
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
    const data = loadNotationYaml(readFileSync(viewFixtures('goals')[0], 'utf8'));
    const raw = parseCanonicalGoals(data);
    const report = validateNotationDoc('goals', data);
    const warningCodes = report.findings
      .filter((f) => f.severity === 'warning')
      .map((f) => f.ruleId);
    expect(warningCodes).toEqual(raw.warnings.map((w) => w.code));
  });

  it('applications: CLI findings mirror validateApplicationsCatalogue exactly', () => {
    const broken = { notation: 'applications' };
    const raw = validateApplicationsCatalogue(broken);
    const report = validateNotationDoc('applications', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('capability-map: CLI findings mirror validateCapabilityMap exactly', () => {
    const broken = { notation: 'capability-map' };
    const raw = validateCapabilityMap(broken);
    const report = validateNotationDoc('capability-map', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('products: CLI findings mirror validateProductsCatalogue exactly', () => {
    const broken = { notation: 'products' };
    const raw = validateProductsCatalogue(broken);
    const report = validateNotationDoc('products', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('scenarios: CLI findings mirror validateScenario exactly', () => {
    const broken = { notation: 'scenarios' };
    const raw = validateScenario(broken);
    const report = validateNotationDoc('scenarios', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('process-map: CLI findings mirror validateProcessMap exactly', () => {
    const broken = { notation: 'process-map' };
    const raw = validateProcessMap(broken);
    const report = validateNotationDoc('process-map', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('requirement: CLI findings mirror validateRequirement exactly', () => {
    const broken = { notation: 'requirement' };
    const raw = validateRequirement(broken);
    const report = validateNotationDoc('requirement', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('driver: CLI findings mirror validateFactor exactly', () => {
    const broken = { notation: 'driver' };
    const raw = validateFactor(broken);
    const report = validateNotationDoc('driver', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('actor: CLI findings mirror validateActor exactly', () => {
    const broken = { notation: 'actor' };
    const raw = validateActor(broken);
    const report = validateNotationDoc('actor', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('assertion: CLI findings mirror validateAssertion exactly', () => {
    const broken = { notation: 'assertion' };
    const today = new Date().toISOString().slice(0, 10);
    const raw = validateAssertion(broken, { today });
    const report = validateNotationDoc('assertion', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('verification: CLI findings mirror validateVerification exactly', () => {
    const broken = { notation: 'verification' };
    const raw = validateVerification(broken);
    const report = validateNotationDoc('verification', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('change: CLI findings mirror validateChange exactly', () => {
    const broken = { notation: 'change' };
    const raw = validateChange(broken);
    const report = validateNotationDoc('change', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('stakeholder: CLI findings mirror validateStakeholder exactly', () => {
    const broken = { notation: 'stakeholder' };
    const raw = validateStakeholder(broken);
    const report = validateNotationDoc('stakeholder', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('target-state: CLI findings mirror validateTargetState exactly', () => {
    const broken = { notation: 'target-state' };
    const raw = validateTargetState(broken);
    const report = validateNotationDoc('target-state', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('compliance-impact: structural errors map to COMPIMP-001', () => {
    const broken = { notation: 'compliance-impact', view: { name: 'X' } };
    const raw = parseImpactViewConfig(broken);
    expect(raw.ok).toBe(false);
    const report = validateNotationDoc('compliance-impact', broken);
    expect(report.isValid).toBe(false);
    expect(report.findings.every((f) => f.ruleId === 'COMPIMP-001')).toBe(true);
    expect(report.findings.length).toBe(raw.ok ? 0 : raw.errors.length);
  });

  it('coverage-metric: CLI mirrors parseCoverageMetricConfig on a broken doc', () => {
    const broken = { notation: 'coverage-metric', view: { name: 'X' } };
    const raw = parseCoverageMetricConfig(broken);
    expect(raw.ok).toBe(false);
    const report = validateNotationDoc('coverage-metric', broken);
    expect(report.isValid).toBe(false);
    expect(report.findings.filter((f) => f.severity === 'error').length).toBe(raw.errors.length);
  });

  it('location: CLI findings mirror validateLocation exactly', () => {
    const broken = { notation: 'location' };
    const raw = validateLocation(broken);
    const report = validateNotationDoc('location', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('business-service: CLI findings mirror validateBusinessService exactly', () => {
    const broken = { notation: 'business-service' };
    const raw = validateBusinessService(broken);
    const report = validateNotationDoc('business-service', broken);
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('codex: CLI findings mirror validateCodex with folder jurisdiction', () => {
    const broken = { zone: 'codex', id: 'LAW-X-1', name: 'X', jurisdiction: 'ge' };
    const raw = validateCodex(broken, { folderJurisdiction: 'eu' });
    const report = validateNotationDoc('codex', broken, {
      filePath: 'codex/external/eu/LAW-X-1.yaml',
    });
    expect(report.isValid).toBe(raw.valid);
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(raw.errors.map((e) => e.code));
  });

  it('requirement: CLI applies REQ-002 when catalog is supplied (#518 C3)', () => {
    const doc = {
      notation: 'requirement',
      id: 'REQUIREMENT-TEST-1',
      name: 'T',
      description: 'D',
      zone: 'canon',
      admitted_at: '2026-01-01',
      admitted_by: 't',
      gate_checks: {},
      valid_from: '2026-01-01',
      valid_to: null,
      derived_from: ['LAW-MISSING-1'],
    };
    const without = validateNotationDoc('requirement', doc);
    expect(without.findings.some((f) => f.ruleId === 'REQ-002')).toBe(false);
    const withCatalog = validateNotationDoc('requirement', doc, {
      catalog: { typeOf: () => undefined },
    });
    expect(withCatalog.findings.some((f) => f.ruleId === 'REQ-002')).toBe(true);
  });
});

// blocks matrix subset (08-blocks.md §4a/§6/§6a) — the grid: root form plus the
// --template opt-in mechanism a template (e.g. RACI) uses to layer its own
// cell-value invariant on top of the base BL-02x well-formedness rules.
describe('validate-notation — blocks grid: root + --template (§6a)', () => {
  const wellFormedRaci = {
    notation: 'blocks',
    grid: {
      columns: [
        { id: 'ROLE-PRODUCT', name: 'Product Owner' },
        { id: 'ROLE-LEAD-ARCH', name: 'Lead Architect' },
      ],
      rows: [
        { id: 'ACT-PROPOSE', name: 'Propose a change', assign: { 'ROLE-PRODUCT': 'A', 'ROLE-LEAD-ARCH': 'C' } },
        { id: 'ACT-DECIDE', name: 'Approve / reject', assign: { 'ROLE-LEAD-ARCH': 'A', 'ROLE-PRODUCT': 'I' } },
      ],
    },
  };

  it('a well-formed grid: document validates without --template (base BL-02x rules only)', () => {
    const report = validateNotationDoc('blocks', wellFormedRaci);
    expect(report.isValid).toBe(true);
    expect(report.findings).toEqual([]);
  });

  it('--template raci passes a well-formed RACI (exactly one "A" per row)', () => {
    const report = validateNotationDoc('blocks', wellFormedRaci, { template: 'raci' });
    expect(report.isValid).toBe(true);
  });

  it('--template raci fails a row with zero "A" assignments', () => {
    const zeroA = {
      ...wellFormedRaci,
      grid: {
        ...wellFormedRaci.grid,
        rows: [
          { id: 'ACT-PROPOSE', name: 'Propose a change', assign: { 'ROLE-PRODUCT': 'R', 'ROLE-LEAD-ARCH': 'C' } },
        ],
      },
    };
    const report = validateNotationDoc('blocks', zeroA, { template: 'raci' });
    expect(report.isValid).toBe(false);
    expect(report.findings.some((f) => f.ruleId === 'RACI-001')).toBe(true);
  });

  it('--template raci fails a row with two "A" assignments', () => {
    const twoA = {
      ...wellFormedRaci,
      grid: {
        ...wellFormedRaci.grid,
        rows: [
          { id: 'ACT-PROPOSE', name: 'Propose a change', assign: { 'ROLE-PRODUCT': 'A', 'ROLE-LEAD-ARCH': 'A' } },
        ],
      },
    };
    const report = validateNotationDoc('blocks', twoA, { template: 'raci' });
    expect(report.isValid).toBe(false);
    expect(report.findings.some((f) => f.ruleId === 'RACI-001')).toBe(true);
  });

  it('an unrecognised --template name fails clearly instead of silently skipping the invariant', () => {
    const report = validateNotationDoc('blocks', wellFormedRaci, { template: 'not-a-real-template' });
    expect(report.isValid).toBe(false);
    expect(report.findings.some((f) => f.ruleId === 'BL-TEMPLATE-UNKNOWN')).toBe(true);
  });

  it('BL-020: a grid: document still reports base errors even with --template set', () => {
    const bothRoots = { notation: 'blocks', nested_blocks: { id: 'BLOCKS-1', name: 'X', blocks: [{ id: 'a', name: 'A' }] }, grid: wellFormedRaci.grid };
    const report = validateNotationDoc('blocks', bothRoots, { template: 'raci' });
    expect(report.isValid).toBe(false);
    expect(report.findings.some((f) => f.ruleId === 'BL-020')).toBe(true);
  });
});
