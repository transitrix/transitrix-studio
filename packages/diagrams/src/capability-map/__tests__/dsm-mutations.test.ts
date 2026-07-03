import { describe, it, expect } from 'vitest';
import { reparent, addChild, deleteWithDescendants, moveBranchToBacklog, restoreFromBacklog, normaliseAddresses } from '../dsm-mutations.js';
import type { CapabilityMap } from '../dsm-schema.js';

function baseMap(): CapabilityMap {
  return {
    organisation: 'Acme Corp',
    set_id: 'v1.0',
    capabilities: [
      { id: 1, name: 'Customer Acquisition', address: '1.0.0' },
      { id: 2, name: 'Lead Qualification', address: '1.1.0' },
      { id: 3, name: 'Inbound Lead Scoring', address: '1.1.1' },
      { id: 4, name: 'Order Management', address: '2.0.0' },
    ],
  };
}

describe('reparent', () => {
  it('moves an L3 under a different L2 (no cascade)', () => {
    const map = baseMap();
    const r = reparent(map, 3, 4); // Inbound Lead Scoring (L3) -> Order Management (L1)... newLevel would be 2
    expect(r.ok).toBe(true);
    const moved = r.result!.capabilities.find((c) => c.id === 3)!;
    expect(moved.address).toBe('2.1.0'); // now an L2 under capability 4
  });

  it('promotes an L2 to L1 and cascades its L3 children to L2 (spec §9)', () => {
    const map = baseMap();
    const r = reparent(map, 2, 0); // Lead Qualification (L2, id 2) -> virtual root
    expect(r.ok).toBe(true);
    const promoted = r.result!.capabilities.find((c) => c.id === 2)!;
    const child = r.result!.capabilities.find((c) => c.id === 3)!;
    expect(promoted.address).toBe('3.0.0'); // first free L1 slot (1 and 2 taken)
    expect(child.address).toBe('3.1.0'); // cascaded from L3 to L2 under the new L1
  });

  it('refuses a demotion that would push a grandchild past L3', () => {
    const map = baseMap();
    // Capability 1 (L1) has descendant 2 (L2) and 3 (L3, a grandchild).
    // Demoting 1 under 4 (making 1 an L2) would need 3 to become L4.
    const r = reparent(map, 1, 4);
    expect(r.ok).toBe(false);
  });

  it('refuses reparenting onto its own descendant (cycle)', () => {
    const map = baseMap();
    const r = reparent(map, 2, 3); // Lead Qualification onto its own child
    expect(r.ok).toBe(false);
  });

  it('refuses reparenting onto itself', () => {
    const map = baseMap();
    expect(reparent(map, 1, 1).ok).toBe(false);
  });

  it('leaves the original map untouched', () => {
    const map = baseMap();
    reparent(map, 3, 4);
    expect(map.capabilities.find((c) => c.id === 3)!.address).toBe('1.1.1');
  });
});

describe('addChild', () => {
  it('assigns the first free address under the parent', () => {
    const map = baseMap();
    const r = addChild(map, 1, { name: 'New L2' });
    expect(r.ok).toBe(true);
    const added = r.result!.capabilities.find((c) => c.name === 'New L2')!;
    expect(added.address).toBe('1.2.0');
    expect(added.backlog).toBe(false);
  });

  it('assigns a new L1 address when parentId is 0 (root)', () => {
    const map = baseMap();
    const r = addChild(map, 0, { name: 'New L1' });
    expect(r.ok).toBe(true);
    expect(r.result!.capabilities.find((c) => c.name === 'New L1')!.address).toBe('3.0.0');
  });

  it('refuses adding a child under an L3 (would exceed max depth)', () => {
    const map = baseMap();
    const r = addChild(map, 3, { name: 'Too deep' });
    expect(r.ok).toBe(false);
  });
});

describe('deleteWithDescendants', () => {
  it('removes the capability and every descendant', () => {
    const map = baseMap();
    const r = deleteWithDescendants(map, 2); // Lead Qualification + its L3 child
    expect(r.ok).toBe(true);
    const ids = r.result!.capabilities.map((c) => c.id);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(3);
    expect(ids).toContain(1);
    expect(ids).toContain(4);
  });
});

describe('moveBranchToBacklog / restoreFromBacklog', () => {
  it('moves a branch to the backlog and back', () => {
    const map = baseMap();
    const toBacklog = moveBranchToBacklog(map, 2);
    expect(toBacklog.ok).toBe(true);
    const backlogged = toBacklog.result!.capabilities.filter((c) => c.id === 2 || c.id === 3);
    expect(backlogged.every((c) => c.backlog && c.address === '0.0.0')).toBe(true);

    const restored = restoreFromBacklog(toBacklog.result!, 2, 4);
    expect(restored.ok).toBe(true);
    const cap2 = restored.result!.capabilities.find((c) => c.id === 2)!;
    expect(cap2.backlog).toBe(false);
    expect(cap2.address).toBe('2.1.0');
    // Restoring the parent doesn't automatically restore its backlogged
    // children — matches deleteWithDescendants/addChild's scope (this
    // mutation acts on the single named id only).
    expect(restored.result!.capabilities.find((c) => c.id === 3)!.backlog).toBe(true);
  });
});

describe('normaliseAddresses', () => {
  it('moves a capability with an unresolvable parent address to the backlog', () => {
    const map: CapabilityMap = {
      organisation: 'Acme Corp',
      set_id: 'v1.0',
      capabilities: [
        { id: 1, name: 'Customer Acquisition', address: '1.0.0' },
        { id: 2, name: 'Dangling L2', address: '9.1.0' }, // no capability at 9.0.0
      ],
    };
    const result = normaliseAddresses(map);
    const dangling = result.capabilities.find((c) => c.id === 2)!;
    expect(dangling.backlog).toBe(true);
    expect(dangling.address).toBe('0.0.0');
  });

  it('leaves a well-formed hierarchy unchanged', () => {
    const map = baseMap();
    const result = normaliseAddresses(map);
    expect(result.capabilities).toEqual(map.capabilities);
  });
});
