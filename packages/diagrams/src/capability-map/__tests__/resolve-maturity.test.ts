import { describe, it, expect } from 'vitest';
import { resolveCapabilityAttributes, withResolvedAttributes, withResolvedCapabilityMap } from '../resolve-maturity.js';
import type { CapabilityMapHeader, CapabilityNode } from '../types.js';

const SIDECAR_V1 = {
  target: 'CAPABILITY-V1',
  attribute_versions: {
    owner_role: [{ valid_from: '2026-05-26', value: 'ROLE-OPS-1' }],
    current_maturity: [
      { valid_from: '2026-05-26', value: 2 },
      { valid_from: '2026-08-01', value: 3 },
    ],
    target_maturity: [{ valid_from: '2026-05-26', value: 5 }],
    target_date: [{ valid_from: '2026-05-26', value: '2027-01-01' }],
  },
};

const NOT_A_SIDECAR = { notation: 'capability', id: 'CAPABILITY-V1', name: 'Order Management' };

describe('resolveCapabilityAttributes', () => {
  it('resolves current_maturity/target_maturity/owner_role/target_date from a sidecar at a date', () => {
    const byId = resolveCapabilityAttributes([SIDECAR_V1, NOT_A_SIDECAR], '2026-08-05');
    expect(byId.get('CAPABILITY-V1')).toEqual({
      owner_role: 'ROLE-OPS-1',
      current_maturity: 3,
      target_maturity: 5,
      target_date: '2027-01-01',
    });
  });

  it('resolves the earlier value before a later entry takes effect', () => {
    const byId = resolveCapabilityAttributes([SIDECAR_V1], '2026-06-01');
    expect(byId.get('CAPABILITY-V1')?.current_maturity).toBe(2);
  });

  it('ignores docs that are not shaped like a sidecar', () => {
    const byId = resolveCapabilityAttributes([NOT_A_SIDECAR, null, 'not an object', 42], '2026-08-05');
    expect(byId.size).toBe(0);
  });

  it('omits a capability entirely when it has no matching sidecar', () => {
    const byId = resolveCapabilityAttributes([], '2026-08-05');
    expect(byId.has('CAPABILITY-V1')).toBe(false);
  });
});

describe('withResolvedAttributes', () => {
  const node: CapabilityNode = { id: 'CAPABILITY-V1', name: 'Order Management', current_maturity: 1 };

  it('merges resolved values onto a node, leaving an inline value untouched', () => {
    const resolved = resolveCapabilityAttributes([SIDECAR_V1], '2026-08-05');
    const merged = withResolvedAttributes(node, resolved);
    // current_maturity is already inline (1) — the fallback never overrides it.
    expect(merged).toMatchObject({ current_maturity: 1, owner_role: 'ROLE-OPS-1', target_maturity: 5, target_date: '2027-01-01' });
    // Never mutates the source node.
    expect(node.owner_role).toBeUndefined();
  });

  it('returns the same node unchanged when there is no resolution for it', () => {
    const resolved = resolveCapabilityAttributes([], '2026-08-05');
    expect(withResolvedAttributes(node, resolved)).toBe(node);
  });

  it('recurses into children', () => {
    const parent: CapabilityNode = {
      id: 'CAPABILITY-V1',
      name: 'Order Management',
      current_maturity: 1,
      children: [{ id: 'CAPABILITY-V1.1', name: 'Order Capture', current_maturity: 2 }],
    };
    const childSidecar = {
      target: 'CAPABILITY-V1.1',
      attribute_versions: { owner_role: [{ valid_from: '2026-01-01', value: 'ROLE-SALES-1' }] },
    };
    const resolved = resolveCapabilityAttributes([childSidecar], '2026-08-05');
    const merged = withResolvedAttributes(parent, resolved);
    expect(merged.children?.[0]).toMatchObject({ owner_role: 'ROLE-SALES-1' });
  });
});

describe('withResolvedCapabilityMap', () => {
  const map: CapabilityMapHeader = {
    id: 'CAPMAP-1',
    name: 'Enterprise Capability Map',
    assessment_date: '2026-08-01',
    capabilities: [{ id: 'CAPABILITY-V1', name: 'Order Management', current_maturity: 1 }],
  };

  it('returns the same map unchanged when nothing resolved', () => {
    const resolved = resolveCapabilityAttributes([], '2026-08-05');
    expect(withResolvedCapabilityMap(map, resolved)).toBe(map);
  });

  it('merges resolved attributes across the top-level tree', () => {
    const resolved = resolveCapabilityAttributes([SIDECAR_V1], '2026-08-05');
    const merged = withResolvedCapabilityMap(map, resolved);
    expect(merged.capabilities[0]).toMatchObject({ owner_role: 'ROLE-OPS-1', target_maturity: 5 });
    // Never mutates the source map.
    expect(map.capabilities[0].owner_role).toBeUndefined();
  });
});
