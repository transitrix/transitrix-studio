import type { Capability, CapabilityMap, MutationResult, ValidationError } from './dsm-schema.js';
import { parseAddress, getLevel, getParentAddress, getFirstFreeAddress, isAddressTaken } from './address.js';

function cloneMap(map: CapabilityMap): CapabilityMap {
  return {
    organisation: map.organisation,
    set_id: map.set_id,
    capabilities: map.capabilities.map((c) => ({
      ...c,
      maturity: c.maturity ? c.maturity.map((m) => ({ ...m })) : undefined,
    })),
  };
}

function nextId(map: CapabilityMap): number {
  return Math.max(0, ...map.capabilities.map((c) => c.id)) + 1;
}

function refusalError(message: string): MutationResult<CapabilityMap> {
  const err: ValidationError = { code: 'MUTATION_REFUSED', message };
  return { ok: false, error: err };
}

/** True when `addr` sits anywhere under `ancestorAddr` in the address hierarchy. */
function isDescendantAddress(addr: string, ancestorAddr: string): boolean {
  const [ax, ay, az] = parseAddress(addr);
  const [px, py, pz] = parseAddress(ancestorAddr);
  if (px !== ax) return false;
  if (py === 0) return ay !== 0 || az !== 0; // ancestor is L1 — any L2/L3 under the same X
  if (pz === 0) return ay === py && az !== 0; // ancestor is L2 — only L3s under the same X.Y
  return false; // ancestor is L3 — no descendants possible (max depth)
}

/** First unused top-level (L1) address — the "parent" for a promote-to-L1 reparent. */
function firstFreeL1(capabilities: Capability[]): string {
  for (let x = 1; x < 1000; x++) {
    const candidate = `${x}.0.0`;
    if (!isAddressTaken(candidate, capabilities)) return candidate;
  }
  throw new Error('firstFreeL1: no free top-level address (searched 1..999)');
}

/**
 * Move `sourceId` under `targetId` (or under the virtual root when
 * `targetId` is 0 — the sentinel matching the goals module's `parent_id: 0`
 * convention, since the root isn't itself a Capability with an id).
 *
 * Recomputes addresses for the whole moved branch (§5.1). The depth check is
 * expressed once, generically, as "every descendant's new level must stay in
 * 1..3" — this covers both directions the spec discusses explicitly (L2→L1
 * promotion, where descendants move one level shallower) and the symmetric,
 * unspecified case (L1→L2 demotion, where descendants move one level
 * deeper) without needing separate per-direction rules: an L1 with L3
 * grandchildren refuses demotion to L2 because that would need a 4th level,
 * caught by the same check.
 */
export function reparent(map: CapabilityMap, sourceId: number, targetId: number): MutationResult<CapabilityMap> {
  const clone = cloneMap(map);
  const source = clone.capabilities.find((c) => c.id === sourceId);
  if (!source || source.backlog) return refusalError(`Capability ${sourceId} not found (use restoreFromBacklog for backlog items)`);
  if (sourceId === targetId) return refusalError('Cannot reparent to self');

  const target = targetId === 0 ? null : clone.capabilities.find((c) => c.id === targetId);
  if (targetId !== 0 && (!target || target.backlog)) return refusalError(`Target capability ${targetId} not found`);

  if (target && isDescendantAddress(target.address, source.address)) {
    return refusalError('Cannot reparent: target is a descendant of the source (would create a cycle)');
  }

  const sourceLevel = getLevel(source.address);
  if (sourceLevel === 'backlog') return refusalError(`Capability ${sourceId} has no on-diagram address`);
  const targetLevel = target ? getLevel(target.address) : 0;
  const newLevel = (typeof targetLevel === 'number' ? targetLevel : 0) + 1;
  if (newLevel > 3) return refusalError('Reparent would exceed max depth (L3)');

  const levelDelta = newLevel - sourceLevel;
  const originalSourceAddress = source.address;

  // Snapshot descendants + their original address/level BEFORE anything is
  // reassigned — both for the depth check and to resolve old-parent links
  // while walking the branch top-down below.
  const descendants = clone.capabilities
    .filter((c) => !c.backlog && c.id !== sourceId && isDescendantAddress(c.address, originalSourceAddress))
    .map((c) => ({ cap: c, originalAddress: c.address, originalLevel: getLevel(c.address) as 1 | 2 | 3 }));

  for (const d of descendants) {
    const newDescLevel = d.originalLevel + levelDelta;
    if (newDescLevel > 3 || newDescLevel < 1) {
      return refusalError(`Reparent would push descendant ${d.cap.id} to level ${newDescLevel}, outside 1..3`);
    }
  }

  const oldAddressToId = new Map<string, number>(clone.capabilities.filter((c) => !c.backlog).map((c) => [c.address, c.id]));
  const newAddressById = new Map<number, string>();

  source.address = target ? getFirstFreeAddress(target.address, clone.capabilities) : firstFreeL1(clone.capabilities);
  newAddressById.set(sourceId, source.address);

  // Shallowest-first so each descendant's old parent has already been
  // re-addressed (or is the source itself) by the time we reach it.
  descendants.sort((a, b) => a.originalLevel - b.originalLevel);
  for (const d of descendants) {
    const oldParentAddress = getParentAddress(d.originalAddress);
    const oldParentId = oldParentAddress ? oldAddressToId.get(oldParentAddress) : undefined;
    const newParentAddress = oldParentId != null ? newAddressById.get(oldParentId) : undefined;
    if (!newParentAddress) {
      return refusalError(`Reparent could not resolve the new parent address for descendant ${d.cap.id}`);
    }
    const newAddress = getFirstFreeAddress(newParentAddress, clone.capabilities);
    d.cap.address = newAddress;
    newAddressById.set(d.cap.id, newAddress);
  }

  return { ok: true, result: clone };
}

export function addChild(map: CapabilityMap, parentId: number, newCap: Omit<Capability, 'id' | 'address'>): MutationResult<CapabilityMap> {
  const clone = cloneMap(map);
  const parent = parentId === 0 ? null : clone.capabilities.find((c) => c.id === parentId);
  if (parentId !== 0 && (!parent || parent.backlog)) return refusalError(`Parent capability ${parentId} not found`);

  const parentLevel = parent ? getLevel(parent.address) : 0;
  const newLevel = (typeof parentLevel === 'number' ? parentLevel : 0) + 1;
  if (newLevel > 3) return refusalError('New child would exceed max depth (L3)');

  const address = parent ? getFirstFreeAddress(parent.address, clone.capabilities) : firstFreeL1(clone.capabilities);
  const id = nextId(clone);
  clone.capabilities.push({ ...newCap, id, address, backlog: false });
  return { ok: true, result: clone };
}

export function deleteWithDescendants(map: CapabilityMap, id: number): MutationResult<CapabilityMap> {
  const clone = cloneMap(map);
  const target = clone.capabilities.find((c) => c.id === id);
  if (!target) return refusalError(`Capability ${id} not found`);

  const toDelete = new Set<number>([id]);
  if (!target.backlog) {
    for (const c of clone.capabilities) {
      if (!c.backlog && isDescendantAddress(c.address, target.address)) toDelete.add(c.id);
    }
  }
  clone.capabilities = clone.capabilities.filter((c) => !toDelete.has(c.id));
  return { ok: true, result: clone };
}

/** Moves a whole branch to the backlog. Descendants move with it (a
 *  backlogged capability's on-diagram children would otherwise dangle). */
export function moveBranchToBacklog(map: CapabilityMap, id: number): MutationResult<CapabilityMap> {
  const clone = cloneMap(map);
  const target = clone.capabilities.find((c) => c.id === id);
  if (!target) return refusalError(`Capability ${id} not found`);
  if (target.backlog) return refusalError(`Capability ${id} is already in the backlog`);

  const branch = [target, ...clone.capabilities.filter((c) => !c.backlog && isDescendantAddress(c.address, target.address))];
  for (const c of branch) {
    c.backlog = true;
    c.address = '0.0.0';
  }
  return { ok: true, result: clone };
}

export function restoreFromBacklog(map: CapabilityMap, id: number, parentId: number): MutationResult<CapabilityMap> {
  const clone = cloneMap(map);
  const target = clone.capabilities.find((c) => c.id === id);
  if (!target || !target.backlog) return refusalError(`Capability ${id} is not in the backlog`);

  const parent = parentId === 0 ? null : clone.capabilities.find((c) => c.id === parentId);
  if (parentId !== 0 && (!parent || parent.backlog)) return refusalError(`Parent capability ${parentId} not found`);
  const parentLevel = parent ? getLevel(parent.address) : 0;
  const newLevel = (typeof parentLevel === 'number' ? parentLevel : 0) + 1;
  if (newLevel > 3) return refusalError('Restore would exceed max depth (L3)');

  target.address = parent ? getFirstFreeAddress(parent.address, clone.capabilities) : firstFreeL1(clone.capabilities);
  target.backlog = false;
  return { ok: true, result: clone };
}

/**
 * Repairs addresses that don't resolve to an existing parent (MISSING_PARENT_BY_ADDRESS):
 * reassigns each such capability to the first free slot under its would-be
 * parent's level, or moves it to the backlog when no such parent exists at all.
 */
export function normaliseAddresses(map: CapabilityMap): CapabilityMap {
  const clone = cloneMap(map);
  const addressToId = new Map<string, number>(clone.capabilities.filter((c) => !c.backlog).map((c) => [c.address, c.id]));

  // Re-derive level-by-level (L1 first) so an L1 fixed up in this pass can
  // already serve as a valid parent for an L2 processed right after it.
  const byLevel = clone.capabilities
    .filter((c) => !c.backlog)
    .map((c) => ({ cap: c, level: getLevel(c.address) }))
    .filter((e): e is { cap: Capability; level: 1 | 2 | 3 } => typeof e.level === 'number')
    .sort((a, b) => a.level - b.level);

  for (const { cap, level } of byLevel) {
    if (level === 1) continue; // L1 has no parent to validate against
    const parentAddress = getParentAddress(cap.address);
    if (parentAddress && addressToId.has(parentAddress)) continue; // already fine

    // No resolvable parent: reassign to the backlog rather than guessing one.
    addressToId.delete(cap.address);
    cap.backlog = true;
    cap.address = '0.0.0';
  }

  return clone;
}
