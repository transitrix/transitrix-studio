import { describe, it, expect } from 'vitest';
import { parseAddress, formatAddress, getLevel, getParentAddress, getFirstFreeAddress, isAddressTaken } from '../address.js';
import type { Capability } from '../dsm-schema.js';

function cap(id: number, address: string, backlog = false): Capability {
  return { id, name: `Cap ${id}`, address, backlog };
}

describe('parseAddress / formatAddress', () => {
  it('round-trips X.Y.Z', () => {
    for (const addr of ['1.0.0', '1.2.0', '1.2.3', '0.0.0', '42.7.19']) {
      expect(formatAddress(parseAddress(addr))).toBe(addr);
    }
  });

  it('throws on malformed input', () => {
    expect(() => parseAddress('1.2')).toThrow();
    expect(() => parseAddress('1.2.3.4')).toThrow();
    expect(() => parseAddress('a.b.c')).toThrow();
  });
});

describe('getLevel', () => {
  it('classifies each address shape', () => {
    expect(getLevel('1.0.0')).toBe(1);
    expect(getLevel('1.2.0')).toBe(2);
    expect(getLevel('1.2.3')).toBe(3);
    expect(getLevel('0.0.0')).toBe('backlog');
  });
});

describe('getParentAddress', () => {
  it('walks up one level at a time', () => {
    expect(getParentAddress('1.2.3')).toBe('1.2.0');
    expect(getParentAddress('1.2.0')).toBe('1.0.0');
    expect(getParentAddress('1.0.0')).toBeNull();
  });
});

describe('getFirstFreeAddress / isAddressTaken', () => {
  it('finds the first unused L2 slot under an L1 parent', () => {
    const caps = [cap(1, '1.0.0'), cap(2, '1.1.0'), cap(3, '1.2.0')];
    expect(getFirstFreeAddress('1.0.0', caps)).toBe('1.3.0');
  });

  it('finds the first unused L3 slot under an L2 parent', () => {
    const caps = [cap(1, '1.0.0'), cap(2, '1.1.0'), cap(3, '1.1.1')];
    expect(getFirstFreeAddress('1.1.0', caps)).toBe('1.1.2');
  });

  it('ignores backlog entries when checking occupancy', () => {
    const caps = [cap(1, '1.0.0'), cap(2, '0.0.0', true)];
    expect(isAddressTaken('1.1.0', caps)).toBe(false);
  });

  it('rejects an L3 address as a parent', () => {
    expect(() => getFirstFreeAddress('1.1.1', [])).toThrow();
  });
});
