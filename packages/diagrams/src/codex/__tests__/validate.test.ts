import { describe, it, expect } from 'vitest';
import {
  validateCodex,
  isCodexDoc,
  folderJurisdictionFromPath,
} from '../validate.js';

const VALID_EXTERNAL = {
  zone: 'codex',
  id: 'LAW-GDPR-1',
  name: 'General Data Protection Regulation',
  type: 'LAW',
  jurisdiction: 'eu',
  effective_date: '2018-05-25',
  admitted_at: '2026-06-01',
  admitted_by: 'legal.team',
  gate_checks: { uniqueness: 'pass' },
};

const VALID_INTERNAL = {
  zone: 'codex',
  id: 'INTERNAL_STANDARD-coding-conventions-1',
  name: 'Engineering Coding Conventions',
  type: 'INTERNAL_STANDARD',
  issuing_authority: 'VP Engineering',
  effective_date: '2026-01-01',
  admitted_at: '2026-05-27',
  admitted_by: 'vp.engineering',
  gate_checks: { source_authority: 'VP Engineering' },
};

describe('validateCodex', () => {
  it('accepts a valid external artefact', () => {
    const r = validateCodex(VALID_EXTERNAL, { folderJurisdiction: 'eu' });
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts a valid internal artefact', () => {
    expect(validateCodex(VALID_INTERNAL).valid).toBe(true);
  });

  it('CODEX-001 rejects non-mapping input', () => {
    expect(validateCodex(null).errors.some((e) => e.code === 'CODEX-001')).toBe(true);
  });

  it('CODEX-001 rejects wrong zone', () => {
    const r = validateCodex({ ...VALID_EXTERNAL, zone: 'canon' });
    expect(r.errors.some((e) => e.code === 'CODEX-001' && e.path === 'zone')).toBe(true);
  });

  it('CODEX-002 rejects type/id prefix mismatch', () => {
    const r = validateCodex({ ...VALID_EXTERNAL, type: 'REGULATION' });
    expect(r.errors.some((e) => e.code === 'CODEX-002')).toBe(true);
  });

  it('CODEX-003 requires jurisdiction on external artefacts', () => {
    const r = validateCodex({ ...VALID_EXTERNAL, jurisdiction: '' });
    expect(r.errors.some((e) => e.code === 'CODEX-003' && e.path === 'jurisdiction')).toBe(true);
  });

  it('CODEX-005 enforces folder jurisdiction match', () => {
    const r = validateCodex(VALID_EXTERNAL, { folderJurisdiction: 'ge' });
    expect(r.errors.some((e) => e.code === 'CODEX-005')).toBe(true);
  });

  it('CODEX-004 requires issuing_authority on internal artefacts', () => {
    const r = validateCodex({ ...VALID_INTERNAL, issuing_authority: '' });
    expect(r.errors.some((e) => e.code === 'CODEX-004')).toBe(true);
  });
});

describe('isCodexDoc', () => {
  it('detects zone: codex', () => {
    expect(isCodexDoc({ zone: 'codex', id: 'LAW-1' })).toBe(true);
    expect(isCodexDoc({ zone: 'canon' })).toBe(false);
  });
});

describe('folderJurisdictionFromPath', () => {
  it('parses codex/external/<jurisdiction>/ paths', () => {
    expect(folderJurisdictionFromPath('codex/external/eu/LAW-GDPR-1.yaml')).toBe('eu');
    expect(folderJurisdictionFromPath('codex/internal/POLICY-1.yaml')).toBeUndefined();
  });
});
