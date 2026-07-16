import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import {
  runViewValidate,
  runRepoValidate,
  repoScopeHasErrors,
} from '../src/repo-validate.js';

// Phase A.2 (vkgeorgia/strategy#258): `validate --scope=repo` sweeps every
// notation file under canon/views/** with the same validators the preview uses.

const corpus = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'notation-corpus',
);

function write(root: string, rel: string, body: string): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, 'utf8');
}

function copyCorpus(root: string, rel: string, corpusRel: string): void {
  write(root, rel, readFileSync(join(corpus, corpusRel), 'utf8'));
}

describe('repo-scope views sweep (#258)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tx-views-'));
    // A clean Group A file, a deliberately broken one, a BPMN file (validated via
    // the IR pipeline), a Group B file, and Group C compliance views (covered
    // since #518 C1).
    copyCorpus(root, 'canon/views/goals/good.goals.transitrix.yaml', 'goals/strategy-2026.goals.transitrix.yaml');
    write(root, 'canon/views/goals/bad.goals.transitrix.yaml', 'notation: goals\nid: x\nname: Bad\ngoals: []\n');
    copyCorpus(root, 'canon/views/bpmn/ok.bpmn.transitrix.yaml', 'bpmn/simple-approval.bpmn.transitrix.yaml');
    copyCorpus(root, 'canon/views/applications/p.applications.transitrix.yaml', 'applications/portfolio-2026.applications.transitrix.yaml');
    copyCorpus(root, 'canon/views/coverage-metric/c.coverage-metric.transitrix.yaml', 'coverage-metric/eu-coverage.coverage-metric.transitrix.yaml');
    copyCorpus(root, 'canon/views/compliance-impact/ci.compliance-impact.view.yaml', 'compliance-impact/gdpr-nis2.compliance-impact.view.yaml');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('flags the broken Group A file with its rule code', () => {
    const { findings } = runViewValidate(root);
    const bad = findings.filter((f) => f.file.endsWith('bad.goals.transitrix.yaml'));
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.every((f) => f.notation === 'goals')).toBe(true);
    expect(bad.some((f) => f.severity === 'error' && f.ruleId.startsWith('GOALS-'))).toBe(true);
  });

  it('leaves the clean Group A file error-free', () => {
    const { findings } = runViewValidate(root);
    const good = findings.filter(
      (f) => f.file.endsWith('good.goals.transitrix.yaml') && f.severity === 'error',
    );
    expect(good).toEqual([]);
  });

  it('validates BPMN via the IR pipeline (not skipped)', () => {
    const { findings, skipped } = runViewValidate(root);
    expect(skipped.some((s) => s.notation === 'bpmn')).toBe(false);
    // simple-approval is clean → no BPMN error findings.
    expect(findings.filter((f) => f.notation === 'bpmn' && f.severity === 'error')).toEqual([]);
  });

  it('validates Group B notations too (covered since #179, not skipped)', () => {
    const { skipped, findings } = runViewValidate(root);
    expect(skipped.some((s) => s.notation === 'applications')).toBe(false);
    // The corpus applications catalogue is clean → no error findings.
    expect(findings.filter((f) => f.notation === 'applications' && f.severity === 'error')).toEqual([]);
  });

  it('validates Group C compliance views (#518 C1), not skipped', () => {
    const { skipped, findings } = runViewValidate(root);
    expect(skipped.some((s) => s.notation === 'coverage-metric')).toBe(false);
    expect(skipped.some((s) => s.notation === 'compliance-impact')).toBe(false);
    expect(findings.filter((f) => f.notation === 'coverage-metric' && f.severity === 'error')).toEqual([]);
    expect(findings.filter((f) => f.notation === 'compliance-impact' && f.severity === 'error')).toEqual([]);
  });

  it('runRepoValidate combines canon + views and fails on a view error', () => {
    const result = runRepoValidate(root);
    expect(result.canon).toEqual([]); // no elements/relations in this fixture
    expect(result.views.some((f) => f.severity === 'error')).toBe(true);
    expect(repoScopeHasErrors(result)).toBe(true);
  });
});

describe('repo-scope views sweep — clean tree passes (#258)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tx-views-clean-'));
    copyCorpus(root, 'canon/views/goals/good.goals.transitrix.yaml', 'goals/strategy-2026.goals.transitrix.yaml');
    copyCorpus(root, 'canon/views/applications/p.applications.transitrix.yaml', 'applications/portfolio-2026.applications.transitrix.yaml');
    copyCorpus(root, 'canon/views/coverage-metric/c.coverage-metric.transitrix.yaml', 'coverage-metric/eu-coverage.coverage-metric.transitrix.yaml');
    copyCorpus(root, 'canon/views/compliance-impact/ci.compliance-impact.view.yaml', 'compliance-impact/gdpr-nis2.compliance-impact.view.yaml');
    // C3 cross-doc refs: codex + product subjects referenced by the compliance views.
    copyCorpus(root, 'codex/external/EU/LAW-GDPR-1.yaml', 'codex/external/EU/LAW-GDPR-1.yaml');
    copyCorpus(root, 'codex/external/EU/LAW-NIS2-1.yaml', 'codex/external/EU/LAW-NIS2-1.yaml');
    write(
      root,
      'canon/elements/02_business/products/PRODUCT-ECOMM-1.yaml',
      readFileSync(join(corpus, 'compliance-c3/PRODUCT-MOBILE-1.yaml'), 'utf8').replace(
        'PRODUCT-MOBILE-1',
        'PRODUCT-ECOMM-1',
      ).replace('Acme Mobile', 'E-Commerce'),
    );
    write(
      root,
      'canon/elements/02_business/products/PRODUCT-SUPPORT-1.yaml',
      readFileSync(join(corpus, 'compliance-c3/PRODUCT-MOBILE-1.yaml'), 'utf8').replace(
        'PRODUCT-MOBILE-1',
        'PRODUCT-SUPPORT-1',
      ).replace('Acme Mobile', 'Support'),
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('clean Group A + Group B + Group C files pass with no skipped views', () => {
    const result = runRepoValidate(root);
    expect(result.views.filter((f) => f.severity === 'error')).toEqual([]);
    expect(repoScopeHasErrors(result)).toBe(false);
    expect(result.skipped.some((s) => s.notation === 'applications')).toBe(false);
    expect(result.skipped.some((s) => s.notation === 'coverage-metric')).toBe(false);
    expect(result.skipped.some((s) => s.notation === 'compliance-impact')).toBe(false);
  });
});

// A canon-projection Action Schedule (view_config, no inline actions[]) used
// to fail every repo-scope validate run with `SCHEMA_INVALID: actions must
// be an array` — the validator only understood the inline form.
// `runViewValidate` now resolves the projection against
// canon/elements/05_implementation/actions/** first (mirroring how the DGCA
// preview resolves its own view_config projections).
describe('repo-scope views sweep — action canon-projection form (#619)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tx-views-action-projection-'));
    write(
      root,
      'canon/elements/05_implementation/actions/ACTION-GDPR-COMPLIANCE-1.yaml',
      'notation: action\nid: ACTION-GDPR-COMPLIANCE-1\nname: GDPR Compliance\ntype: Programme\n',
    );
    write(
      root,
      'canon/elements/05_implementation/actions/ACTION-GDPR-AUDIT-1.yaml',
      'notation: action\nid: ACTION-GDPR-AUDIT-1\nname: Data audit\ntype: Task\nparent: ACTION-GDPR-COMPLIANCE-1\nduration: 10\n',
    );
    write(
      root,
      'canon/views/action/gdpr-remediation.action.transitrix.yaml',
      [
        'notation: action',
        'spec_version: "0.1"',
        'id: ACTION_SCHED-GDPR-1',
        'name: GDPR Remediation',
        'view_config:',
        '  scope:',
        '    root_action: ACTION-GDPR-COMPLIANCE-1',
      ].join('\n'),
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resolves the projection and validates clean, instead of SCHEMA_INVALID', () => {
    const { findings, skipped } = runViewValidate(root);
    expect(skipped.some((s) => s.notation === 'action')).toBe(false);
    const actionFindings = findings.filter((f) => f.notation === 'action');
    expect(actionFindings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(actionFindings.some((f) => f.message.includes('actions must be an array'))).toBe(false);
  });
});

// A canon-projection DGCA document (view_config, no inline
// factors/goals/changes/actions) failed every repo-scope validate run with
// FGCA-004 "must be an array" — `runViewValidate` never resolved DGCA
// projections at all (only the VS Code preview did). Confirmed against
// methodology's own official example (notations/examples/dgca/
// strategy-2026.dgca.transitrix.yaml) before this fix.
describe('repo-scope views sweep — dgca canon-projection form', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tx-views-dgca-projection-'));
    write(root, 'canon/elements/01_motivation/drivers/DRIVER-1.yaml', 'notation: driver\nid: DRIVER-1\nname: Market pressure\n');
    write(
      root,
      'canon/elements/01_motivation/goals/GOAL-1.yaml',
      'notation: goal\nid: GOAL-1\nname: Grow revenue\nfactors: [DRIVER-1]\n',
    );
    write(
      root,
      'canon/elements/05_implementation/changes/CHANGE-1.yaml',
      'notation: change\nid: CHANGE-1\nname: Launch product\ngoals: [GOAL-1]\n',
    );
    write(
      root,
      'canon/elements/05_implementation/actions/ACTION-1.yaml',
      'notation: action\nid: ACTION-1\nname: Market research\nchanges: [CHANGE-1]\n',
    );
    write(
      root,
      'canon/views/dgca/strategy.dgca.transitrix.yaml',
      [
        'notation: dgca',
        'spec_version: "0.1"',
        'id: DGCA-STRAT-1',
        'name: Strategy chain',
        'view_config:',
        '  goals: { filter: all }',
        '  factors: { surface: derived }',
        '  changes: { surface: derived }',
        '  activities: { surface: derived }',
      ].join('\n'),
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resolves the projection and validates clean, instead of FGCA-004', () => {
    const { findings, skipped } = runViewValidate(root);
    expect(skipped.some((s) => s.notation === 'dgca')).toBe(false);
    const dgcaFindings = findings.filter((f) => f.notation === 'dgca');
    expect(dgcaFindings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(dgcaFindings.some((f) => f.ruleId === 'FGCA-004')).toBe(false);
  });
});

// A canon-projection Goals Tree (view_config, no inline goals[]) had no
// resolution path anywhere in Studio — `runViewValidate` never resolved
// goals projections, and calling parseCanonicalGoals on the raw view_config
// doc fails GOALS-004 ("goals must be a non-empty array"). `runViewValidate`
// now resolves the projection against canon/elements/01_motivation/goals/**
// first, mirroring the action/dgca fixes.
describe('repo-scope views sweep — goals canon-projection form', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tx-views-goals-projection-'));
    write(
      root,
      'canon/elements/01_motivation/goals/GOAL-REVENUE-1.yaml',
      'notation: goal\nid: GOAL-REVENUE-1\nname: Triple revenue\ntype: Strategy\nlevel: 0\n',
    );
    write(
      root,
      'canon/elements/01_motivation/goals/GOAL-EU-1.yaml',
      'notation: goal\nid: GOAL-EU-1\nname: Launch in EU\ntype: Strategic Goal\nlevel: 1\nparent: GOAL-REVENUE-1\n',
    );
    write(
      root,
      'canon/views/goals/strategy.goals.transitrix.yaml',
      [
        'notation: goals',
        'spec_version: "0.1"',
        'id: GOALS-STRAT-1',
        'name: Strategy Goals Tree',
        'view_config:',
        '  scope:',
        '    root_goal: GOAL-REVENUE-1',
        '  goal_types:',
        '    - { name: Strategy, level: 0 }',
        '    - { name: Strategic Goal, level: 1 }',
      ].join('\n'),
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resolves the projection and validates clean, instead of GOALS-004', () => {
    const { findings, skipped } = runViewValidate(root);
    expect(skipped.some((s) => s.notation === 'goals')).toBe(false);
    const goalsFindings = findings.filter((f) => f.notation === 'goals');
    expect(goalsFindings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(goalsFindings.some((f) => f.ruleId === 'GOALS-004')).toBe(false);
  });
});

// loadRepoModel's readDoc() previously parsed canon YAML with plain
// yaml.load(), never coercing bare (unquoted) ISO date scalars — js-yaml
// parses those into native Date objects, not strings. The resolvers'
// str() checks are typeof-string, so a Date-valued valid_from/valid_to was
// silently treated as absent, disabling view_config.scope.valid_at filtering
// for any canon element authored with an unquoted date (the ordinary way to
// write one). This only affects the CLI (repo-validate.ts); the VS Code
// preview's canon-loader.ts already coerced dates.
describe('repo-scope views sweep — unquoted canon element dates (valid_at filtering)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tx-views-unquoted-dates-'));
    // Deliberately unquoted dates — js-yaml's default schema parses these as
    // native Date objects, exactly the shape adopters write without knowing
    // to quote them.
    write(
      root,
      'canon/elements/05_implementation/actions/ACTION-EXPIRED-1.yaml',
      'notation: action\nid: ACTION-EXPIRED-1\nname: Expired task\ntype: Task\nvalid_from: 2026-01-01\nvalid_to: 2026-02-01\n',
    );
    write(
      root,
      'canon/elements/05_implementation/actions/ACTION-ACTIVE-1.yaml',
      'notation: action\nid: ACTION-ACTIVE-1\nname: Active task\ntype: Task\nvalid_from: 2026-01-01\nvalid_to: null\n',
    );
    write(
      root,
      'canon/views/action/schedule.action.transitrix.yaml',
      [
        'notation: action',
        'spec_version: "0.1"',
        'id: ACTION_SCHED-1',
        'name: Schedule',
        'view_config:',
        '  scope:',
        '    valid_at: "2026-07-15"',
      ].join('\n'),
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('excludes an action whose unquoted valid_to has already closed by valid_at', () => {
    const { findings } = runViewValidate(root);
    // ACT-013 ("structurally orphan") only fires when >1 activity is present
    // in the resolved doc. If the date-coercion bug were present, the
    // already-closed ACTION-EXPIRED-1 would still be silently included
    // alongside ACTION-ACTIVE-1, and both (having no predecessors/successors/
    // goals) would be flagged as orphans. Correctly excluded, only
    // ACTION-ACTIVE-1 remains — a single activity never triggers ACT-013.
    expect(findings.some((f) => f.message.includes('ACTION-EXPIRED-1'))).toBe(false);
    expect(findings.some((f) => f.ruleId === 'ACT-013')).toBe(false);
  });

  it('runRepoValidate (which loads the canon model once and passes it through) still applies the same filtering', () => {
    const result = runRepoValidate(root);
    expect(result.views.some((f) => f.message.includes('ACTION-EXPIRED-1'))).toBe(false);
  });
});
