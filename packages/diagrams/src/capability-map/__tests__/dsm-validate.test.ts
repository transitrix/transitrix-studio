import { describe, it, expect } from 'vitest';
import { validateCapabilityMapData } from '../dsm-validate.js';
import type { CapabilityMap } from '../dsm-schema.js';

function validMap(): CapabilityMap {
  return {
    organisation: 'Acme Corp',
    set_id: 'v1.0',
    capabilities: [
      { id: 1, name: 'Customer Acquisition', address: '1.0.0' },
      { id: 2, name: 'Lead Qualification', address: '1.1.0' },
      { id: 3, name: 'Inbound Lead Scoring', address: '1.1.1' },
    ],
  };
}

describe('validateCapabilityMapData', () => {
  it('accepts a well-formed map', () => {
    expect(validateCapabilityMapData(validMap()).valid).toBe(true);
  });

  it('flags a duplicate id', () => {
    const map = validMap();
    map.capabilities[1].id = 1;
    const result = validateCapabilityMapData(map);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'DUPLICATE_ID')).toBe(true);
  });

  it('flags a malformed address', () => {
    const map = validMap();
    map.capabilities[0].address = 'not-an-address';
    const result = validateCapabilityMapData(map);
    expect(result.errors.some((e) => e.code === 'INVALID_ADDRESS_FORMAT')).toBe(true);
  });

  it('flags a too-deep address as MAX_DEPTH_EXCEEDED, not INVALID_ADDRESS_FORMAT', () => {
    const map = validMap();
    map.capabilities[0].address = '1.2.3.4';
    const result = validateCapabilityMapData(map);
    expect(result.errors.some((e) => e.code === 'MAX_DEPTH_EXCEEDED')).toBe(true);
    expect(result.errors.some((e) => e.code === 'INVALID_ADDRESS_FORMAT')).toBe(false);
  });

  it('flags a duplicate on-diagram address', () => {
    const map = validMap();
    map.capabilities[1].address = '1.0.0';
    const result = validateCapabilityMapData(map);
    expect(result.errors.some((e) => e.code === 'DUPLICATE_ADDRESS')).toBe(true);
  });

  it('warns on a missing parent by address', () => {
    const map = validMap();
    map.capabilities[1].address = '9.1.0'; // no capability at 9.0.0
    const result = validateCapabilityMapData(map);
    expect(result.warnings.some((w) => w.code === 'MISSING_PARENT_BY_ADDRESS')).toBe(true);
  });

  it('does not flag a backlog entry\'s address as a duplicate or requiring a parent', () => {
    const map = validMap();
    map.capabilities.push({ id: 4, name: 'Parked idea', address: '0.0.0', backlog: true });
    const result = validateCapabilityMapData(map);
    expect(result.valid).toBe(true);
  });
});
