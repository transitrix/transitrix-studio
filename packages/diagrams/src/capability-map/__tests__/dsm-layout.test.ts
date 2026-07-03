import { describe, it, expect } from 'vitest';
import { layoutCapabilityMap } from '../dsm-layout.js';
import type { CapabilityMap } from '../dsm-schema.js';

function map(): CapabilityMap {
  return {
    organisation: 'Acme Corp',
    set_id: 'v1.0',
    capabilities: [
      { id: 1, name: 'Customer Acquisition', address: '1.0.0' },
      { id: 2, name: 'Lead Qualification', address: '1.1.0' },
      { id: 3, name: 'Inbound Lead Scoring', address: '1.1.1' },
      { id: 4, name: 'Order Management', address: '2.0.0' },
      { id: 5, name: 'Parked idea', address: '0.0.0', backlog: true },
    ],
  };
}

describe('layoutCapabilityMap', () => {
  it('lays out a virtual root plus every on-diagram capability, one column per level', () => {
    const layout = layoutCapabilityMap(map());
    expect(layout.rootNode.data).toBeNull();
    expect(layout.nodes).toHaveLength(4); // backlog entry excluded
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    expect(byId.get(1)!.x).toBe(byId.get(4)!.x); // both L1s share a column
    expect(byId.get(2)!.x).toBeGreaterThan(byId.get(1)!.x); // L2 one column further right
    expect(byId.get(3)!.x).toBeGreaterThan(byId.get(2)!.x); // L3 further still
    expect(byId.get(1)!.x).toBeGreaterThan(layout.rootNode.x); // root sits left of the L1s
  });

  it('connects the root to every L1 and each parent to its children', () => {
    const layout = layoutCapabilityMap(map());
    const edgeSet = new Set(layout.edges.map((e) => `${e.source}->${e.target}`));
    expect(edgeSet.has('root->1')).toBe(true);
    expect(edgeSet.has('root->4')).toBe(true);
    expect(edgeSet.has('1->2')).toBe(true);
    expect(edgeSet.has('2->3')).toBe(true);
  });

  it('marks a node as having hidden children when its subtree is collapsed', () => {
    const layout = layoutCapabilityMap(map(), { hideCollapsed: [2] });
    const cap2 = layout.nodes.find((n) => n.id === 2)!;
    expect(cap2.hasHiddenChildren).toBe(true);
    expect(layout.nodes.some((n) => n.id === 3)).toBe(false); // hidden subtree omitted
  });

  it('returns just the root when there are no on-diagram capabilities', () => {
    const layout = layoutCapabilityMap({ organisation: 'Empty Co', set_id: 'v1', capabilities: [] });
    expect(layout.nodes).toHaveLength(0);
    expect(layout.rootNode.data).toBeNull();
  });
});
