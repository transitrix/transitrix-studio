import { describe, it, expect } from 'vitest';
import { validateRepoModel } from '../validate-repo.js';
import type { RepoDoc, RepoModelInput } from '../types.js';

function el(path: string, data: Record<string, unknown> | null): RepoDoc {
  return { path, data };
}

const RELEASE_PATH = 'canon/elements/05_implementation/releases/RELEASE-PAYMENTS-GATEWAY-2.yaml';

function release(overrides: Record<string, unknown> = {}): RepoDoc {
  return el(RELEASE_PATH, {
    notation: 'release',
    id: 'RELEASE-PAYMENTS-GATEWAY-2',
    name: 'Payments Gateway 2.4.0',
    zone: 'canon',
    of: 'APPLICATION-PAYMENTS-GATEWAY-1',
    version: '2.4.0',
    valid_from: '2026-07-15',
    valid_to: null,
    ...overrides,
  });
}

function model(elements: RepoDoc[]): RepoModelInput {
  return { elements, relations: [] };
}

function candidateFindings(input: RepoModelInput) {
  return validateRepoModel(input).filter((f) => f.ruleId === 'ELEM-CANDIDATE-FIELD-001');
}

describe('checkCandidateFields — ELEM-CANDIDATE-FIELD-001', () => {
  it('flags extraction_confidence on an admitted RELEASE element', () => {
    const findings = candidateFindings(model([release({ extraction_confidence: 'high' })]));
    expect(findings.length).toBe(1);
    expect(findings[0].id).toBe('RELEASE-PAYMENTS-GATEWAY-2');
    expect(findings[0].message).toContain('extraction_confidence');
  });

  it('names derived_from and OBSERVATION as the provenance pattern that belongs there', () => {
    const [finding] = candidateFindings(model([release({ extraction_confidence: 'low' })]));
    expect(finding.message).toContain('derived_from');
    expect(finding.message).toContain('OBSERVATION');
  });

  it('is blocking — no severity set, so it defaults to error', () => {
    const [finding] = candidateFindings(model([release({ extraction_confidence: 'medium' })]));
    expect(finding.severity).toBeUndefined();
  });

  // The spec generalises §7.29 past RELEASE ("neither does any other canon
  // element, of any TYPE"), so candidate selection is the admission marker,
  // never a notation list.
  it.each([
    ['requirement', 'canon/elements/01_motivation/requirements/REQUIREMENT-AUDIT-1.yaml', 'REQUIREMENT-AUDIT-1'],
    ['capability', 'canon/elements/02_business/capabilities/CAPABILITY-V1.yaml', 'CAPABILITY-V1'],
    ['application', 'canon/elements/03_application/applications/APPLICATION-OMS-1.yaml', 'APPLICATION-OMS-1'],
    ['term', 'canon/elements/02_business/terms/TERM-CHARGEBACK-1.yaml', 'TERM-CHARGEBACK-1'],
  ])('flags it on a %s element too', (notation, path, id) => {
    const findings = candidateFindings(
      model([el(path, { notation, id, name: 'x', zone: 'canon', extraction_confidence: 'high' })]),
    );
    expect(findings.length).toBe(1);
    expect(findings[0].id).toBe(id);
  });

  it('flags a falsy-but-present value — presence is the defect, not the value', () => {
    expect(candidateFindings(model([release({ extraction_confidence: null })])).length).toBe(1);
    expect(candidateFindings(model([release({ extraction_confidence: '' })])).length).toBe(1);
  });

  it('produces no finding for an admitted element without the field', () => {
    expect(candidateFindings(model([release()]))).toEqual([]);
  });

  it('leaves the correct provenance pattern alone — derived_from citing an OBSERVATION', () => {
    const findings = candidateFindings(
      model([release({ derived_from: ['OBSERVATION-REPO-TAG-SURVEY-1'] })]),
    );
    expect(findings).toEqual([]);
  });

  // The field is legitimate on an ingest candidate and merely not meaningful in
  // the field/codex zones — only the admitted form is a defect.
  it.each(['field', 'codex', 'candidate'])('says nothing about a zone: %s artefact', (zone) => {
    const findings = candidateFindings(
      model([
        el('canon/field/observations/OBSERVATION-REPO-TAG-SURVEY-1.yaml', {
          id: 'OBSERVATION-REPO-TAG-SURVEY-1',
          zone,
          extraction_confidence: 'high',
        }),
      ]),
    );
    expect(findings).toEqual([]);
  });

  it('ignores a sidecar, which carries neither zone nor id', () => {
    const findings = candidateFindings(
      model([
        release(),
        el('canon/elements/05_implementation/releases/RELEASE-PAYMENTS-GATEWAY-2.history.yaml', {
          target: 'RELEASE-PAYMENTS-GATEWAY-2',
          attribute_versions: {},
          extraction_confidence: 'high',
        }),
      ]),
    );
    expect(findings).toEqual([]);
  });

  it('falls back to the file path when the offending element has no id', () => {
    const [finding] = candidateFindings(
      model([el(RELEASE_PATH, { notation: 'release', zone: 'canon', extraction_confidence: 'high' })]),
    );
    expect(finding.id).toBe('');
    expect(finding.message).toContain(RELEASE_PATH);
  });
});
