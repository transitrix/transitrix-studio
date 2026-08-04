import { describe, it, expect } from 'vitest';
import { parseSidecar, validateAttributeArray, validateSidecar } from '../validate.js';

describe('parseSidecar', () => {
  it('parses a well-formed sidecar', () => {
    const parsed = parseSidecar({
      target: 'CAPABILITY-V1',
      attribute_versions: {
        current_maturity: [{ valid_from: '2024-01-01', value: 1 }],
      },
    });
    expect(parsed).toEqual({
      target: 'CAPABILITY-V1',
      attribute_versions: {
        current_maturity: [{ valid_from: '2024-01-01', value: 1 }],
      },
    });
  });

  it('returns null when target is missing or not a string', () => {
    expect(parseSidecar({ attribute_versions: {} })).toBeNull();
    expect(parseSidecar({ target: 42, attribute_versions: {} })).toBeNull();
    expect(parseSidecar({ target: '', attribute_versions: {} })).toBeNull();
  });

  it('returns null when attribute_versions is missing or the wrong shape', () => {
    expect(parseSidecar({ target: 'CAPABILITY-V1' })).toBeNull();
    expect(parseSidecar({ target: 'CAPABILITY-V1', attribute_versions: [] })).toBeNull();
    expect(parseSidecar({ target: 'CAPABILITY-V1', attribute_versions: 'x' })).toBeNull();
  });

  it('returns null for a non-object / null doc', () => {
    expect(parseSidecar(null)).toBeNull();
    expect(parseSidecar(undefined)).toBeNull();
  });

  it('drops malformed entries within an attribute array rather than failing the whole sidecar', () => {
    const parsed = parseSidecar({
      target: 'CAPABILITY-V1',
      attribute_versions: {
        current_maturity: [{ valid_from: '2024-01-01', value: 1 }, { value: 2 }, 'not-an-entry'],
      },
    });
    expect(parsed?.attribute_versions.current_maturity).toEqual([{ valid_from: '2024-01-01', value: 1 }]);
  });
});

describe('validateAttributeArray — VERSIONED-002 (duplicate valid_from)', () => {
  it('flags two entries sharing the same valid_from', () => {
    const findings = validateAttributeArray('current_maturity', [
      { valid_from: '2024-01-01', value: 1 },
      { valid_from: '2024-01-01', value: 2 },
    ]);
    expect(findings.map((f) => f.code)).toContain('VERSIONED-002');
  });
});

describe('validateAttributeArray — VERSIONED-003 (sort order, warning)', () => {
  it('flags an unsorted array as a warning', () => {
    const findings = validateAttributeArray('current_maturity', [
      { valid_from: '2025-06-01', value: 2 },
      { valid_from: '2024-01-01', value: 1 },
    ]);
    const f = findings.find((x) => x.code === 'VERSIONED-003');
    expect(f?.severity).toBe('warning');
  });

  it('does not flag an already-sorted array', () => {
    const findings = validateAttributeArray('current_maturity', [
      { valid_from: '2024-01-01', value: 1 },
      { valid_from: '2025-06-01', value: 2 },
    ]);
    expect(findings.map((f) => f.code)).not.toContain('VERSIONED-003');
  });
});

describe('validateAttributeArray — VERSIONED-005 (outside target lifecycle)', () => {
  it('flags an entry before the target valid_from', () => {
    const findings = validateAttributeArray(
      'current_maturity',
      [{ valid_from: '2020-01-01', value: 1 }],
      '2024-01-01',
      null,
    );
    expect(findings.map((f) => f.code)).toContain('VERSIONED-005');
  });

  it('flags an entry after the target valid_to', () => {
    const findings = validateAttributeArray(
      'current_maturity',
      [{ valid_from: '2027-01-01', value: 1 }],
      '2024-01-01',
      '2026-01-01',
    );
    expect(findings.map((f) => f.code)).toContain('VERSIONED-005');
  });

  it('does not flag entries within the window, and skips the check when bounds are unknown', () => {
    const withinWindow = validateAttributeArray(
      'current_maturity',
      [{ valid_from: '2025-01-01', value: 1 }],
      '2024-01-01',
      '2026-01-01',
    );
    expect(withinWindow).toHaveLength(0);

    const noBounds = validateAttributeArray('current_maturity', [{ valid_from: '2099-01-01', value: 1 }]);
    expect(noBounds.map((f) => f.code)).not.toContain('VERSIONED-005');
  });

  it('a null valid_to (still-open primitive) never bounds the upper end', () => {
    const findings = validateAttributeArray(
      'current_maturity',
      [{ valid_from: '2099-01-01', value: 1 }],
      '2024-01-01',
      null,
    );
    expect(findings.map((f) => f.code)).not.toContain('VERSIONED-005');
  });
});

describe('validateSidecar', () => {
  it('runs the array checks over every attribute in the sidecar', () => {
    const findings = validateSidecar(
      {
        target: 'CAPABILITY-V1',
        attribute_versions: {
          current_maturity: [
            { valid_from: '2024-01-01', value: 1 },
            { valid_from: '2024-01-01', value: 2 },
          ],
          owner_role: [{ valid_from: '2020-01-01', value: 'ROLE-OPS-1' }],
        },
      },
      '2024-01-01',
      null,
    );
    expect(findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(['VERSIONED-002', 'VERSIONED-005']),
    );
  });

  it('produces no findings for a clean sidecar', () => {
    const findings = validateSidecar(
      {
        target: 'CAPABILITY-V1',
        attribute_versions: {
          current_maturity: [
            { valid_from: '2024-01-01', value: 1 },
            { valid_from: '2025-06-01', value: 2 },
          ],
        },
      },
      '2024-01-01',
      null,
    );
    expect(findings).toHaveLength(0);
  });
});
