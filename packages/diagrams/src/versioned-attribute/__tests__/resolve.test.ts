import { describe, it, expect } from 'vitest';
import { resolveAttributeValue, resolveAttributes } from '../resolve.js';
import type { VersionedAttributeSidecar } from '../types.js';

describe('resolveAttributeValue — CONTRACT.md §9.2', () => {
  const entries = [
    { valid_from: '2024-01-01', value: 1 },
    { valid_from: '2025-06-01', value: 2 },
    { valid_from: '2026-09-15', value: 3 },
  ];

  it('picks the entry with the largest valid_from <= atDate', () => {
    expect(resolveAttributeValue(entries, '2024-06-01')).toBe(1);
    expect(resolveAttributeValue(entries, '2025-06-01')).toBe(2);
    expect(resolveAttributeValue(entries, '2026-12-31')).toBe(3);
  });

  it('returns undefined before the first entry takes effect', () => {
    expect(resolveAttributeValue(entries, '2023-01-01')).toBeUndefined();
  });

  it('returns undefined for an empty or missing array', () => {
    expect(resolveAttributeValue([], '2026-01-01')).toBeUndefined();
    expect(resolveAttributeValue(undefined, '2026-01-01')).toBeUndefined();
  });

  it('resolves a gap marker (value: null) as currently unset', () => {
    const withGap = [
      { valid_from: '2024-01-01', value: 'ROLE-OPS-1' },
      { valid_from: '2026-04-01', value: null },
      { valid_from: '2026-07-01', value: 'ROLE-OPS-2' },
    ];
    expect(resolveAttributeValue(withGap, '2026-05-01')).toBeNull();
    expect(resolveAttributeValue(withGap, '2026-08-01')).toBe('ROLE-OPS-2');
  });

  it('is insensitive to input array order', () => {
    const shuffled = [...entries].reverse();
    expect(resolveAttributeValue(shuffled, '2025-06-01')).toBe(2);
  });
});

describe('resolveAttributes', () => {
  const sidecar: VersionedAttributeSidecar = {
    target: 'CAPABILITY-V1',
    attribute_versions: {
      current_maturity: [
        { valid_from: '2024-01-01', value: 1 },
        { valid_from: '2025-06-01', value: 2 },
      ],
      owner_role: [{ valid_from: '2024-01-01', value: 'ROLE-OPS-1' }],
    },
  };

  it('resolves every attribute at the given date', () => {
    expect(resolveAttributes(sidecar, '2025-12-01')).toEqual({
      current_maturity: 2,
      owner_role: 'ROLE-OPS-1',
    });
  });

  it('omits an attribute that has not yet taken effect', () => {
    expect(resolveAttributes(sidecar, '2023-01-01')).toEqual({});
  });

  it('returns an empty object for a missing sidecar', () => {
    expect(resolveAttributes(null, '2026-01-01')).toEqual({});
    expect(resolveAttributes(undefined, '2026-01-01')).toEqual({});
  });
});
