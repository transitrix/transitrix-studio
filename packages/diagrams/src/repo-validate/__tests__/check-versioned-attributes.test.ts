import { describe, it, expect } from 'vitest';
import { validateRepoModel } from '../validate-repo.js';
import type { RepoDoc, RepoModelInput } from '../types.js';

function el(path: string, data: Record<string, unknown> | null): RepoDoc {
  return { path, data };
}

const CAPABILITY_PATH = 'canon/elements/02_business/capabilities/CAPABILITY-V1.yaml';
const SIDECAR_PATH = 'canon/elements/02_business/capabilities/CAPABILITY-V1.history.yaml';

function capability(overrides: Record<string, unknown> = {}): RepoDoc {
  return el(CAPABILITY_PATH, {
    notation: 'capability',
    id: 'CAPABILITY-V1',
    name: 'Order Management',
    valid_from: '2024-01-01',
    valid_to: null,
    ...overrides,
  });
}

function sidecar(attributeVersions: Record<string, unknown>): RepoDoc {
  return el(SIDECAR_PATH, { target: 'CAPABILITY-V1', attribute_versions: attributeVersions });
}

function model(elements: RepoDoc[]): RepoModelInput {
  return { elements, relations: [] };
}

describe('checkVersionedAttributes — VERSIONED-004 (inline time_varying field)', () => {
  it('flags current_maturity present inline on a capability element', () => {
    const findings = validateRepoModel(model([capability({ current_maturity: 3 })]));
    expect(findings.map((f) => f.ruleId)).toContain('VERSIONED-004');
    expect(findings[0].message).toContain('current_maturity');
  });

  it('flags owner_role and target_date inline the same way', () => {
    const findings = validateRepoModel(model([capability({ owner_role: 'ROLE-OPS-1', target_date: '2027-01-01' })]));
    const flagged = findings.filter((f) => f.ruleId === 'VERSIONED-004').map((f) => f.message);
    expect(flagged.some((m) => m.includes('owner_role'))).toBe(true);
    expect(flagged.some((m) => m.includes('target_date'))).toBe(true);
  });

  it('does not flag target_maturity — not yet time_varying on the merged spec', () => {
    const findings = validateRepoModel(model([capability({ target_maturity: 3 })]));
    expect(findings.filter((f) => f.ruleId === 'VERSIONED-004')).toEqual([]);
  });

  it('produces no findings for a capability with no inline time_varying fields', () => {
    expect(validateRepoModel(model([capability()]))).toEqual([]);
  });

  it('only applies the capability field list to capability-notation elements', () => {
    const findings = validateRepoModel(
      model([el('canon/elements/03_application/applications/APPLICATION-OMS-1.yaml', {
        notation: 'application',
        id: 'APPLICATION-OMS-1',
        name: 'OMS',
        current_maturity: 3,
      })]),
    );
    expect(findings.filter((f) => f.ruleId === 'VERSIONED-004')).toEqual([]);
  });
});

describe('checkVersionedAttributes — VERSIONED-001 (sidecar target resolution)', () => {
  it('flags a sidecar whose target does not resolve to an admitted primitive', () => {
    const findings = validateRepoModel(model([sidecar({ current_maturity: [{ valid_from: '2024-01-01', value: 1 }] })]));
    expect(findings.map((f) => f.ruleId)).toContain('VERSIONED-001');
  });

  it('does not flag a sidecar whose target resolves', () => {
    const findings = validateRepoModel(
      model([capability(), sidecar({ current_maturity: [{ valid_from: '2024-01-01', value: 1 }] })]),
    );
    expect(findings).toEqual([]);
  });
});

describe('checkVersionedAttributes — VERSIONED-002/003/005 (sidecar array shape)', () => {
  it('flags a duplicate valid_from within one attribute', () => {
    const findings = validateRepoModel(
      model([
        capability(),
        sidecar({
          current_maturity: [
            { valid_from: '2024-01-01', value: 1 },
            { valid_from: '2024-01-01', value: 2 },
          ],
        }),
      ]),
    );
    expect(findings.map((f) => f.ruleId)).toContain('VERSIONED-002');
  });

  it('warns (not errors) on an unsorted attribute array', () => {
    const findings = validateRepoModel(
      model([
        capability(),
        sidecar({
          current_maturity: [
            { valid_from: '2025-01-01', value: 2 },
            { valid_from: '2024-01-01', value: 1 },
          ],
        }),
      ]),
    );
    const f = findings.find((x) => x.ruleId === 'VERSIONED-003');
    expect(f?.severity).toBe('warning');
  });

  it('flags an entry dated before the target primitive existed', () => {
    const findings = validateRepoModel(
      model([
        capability({ valid_from: '2024-01-01' }),
        sidecar({ current_maturity: [{ valid_from: '2020-01-01', value: 1 }] }),
      ]),
    );
    expect(findings.map((f) => f.ruleId)).toContain('VERSIONED-005');
  });

  it('a still-open primitive (valid_to: null) never bounds the upper end', () => {
    const findings = validateRepoModel(
      model([
        capability({ valid_from: '2024-01-01', valid_to: null }),
        sidecar({ current_maturity: [{ valid_from: '2099-01-01', value: 1 }] }),
      ]),
    );
    expect(findings.filter((f) => f.ruleId === 'VERSIONED-005')).toEqual([]);
  });
});

describe('checkVersionedAttributes — acme_corp-shaped worked example stays clean', () => {
  it('the CAPABILITY-V1 + sidecar pairing from organizations/acme_corp produces zero findings', () => {
    const findings = validateRepoModel(
      model([
        capability({ target_maturity: 3, valid_from: '2024-01-01', valid_to: null }),
        sidecar({
          current_maturity: [
            { valid_from: '2024-01-01', value: 1 },
            { valid_from: '2025-06-01', value: 2 },
            { valid_from: '2026-09-15', value: 3 },
          ],
          owner_role: [
            { valid_from: '2024-01-01', value: 'ROLE-OPS-1' },
            { valid_from: '2026-07-01', value: 'ROLE-OPS-2' },
          ],
          target_date: [
            { valid_from: '2024-01-01', value: '2027-06-30' },
            { valid_from: '2026-04-01', value: '2026-12-31' },
          ],
        }),
      ]),
    );
    expect(findings).toEqual([]);
  });
});
