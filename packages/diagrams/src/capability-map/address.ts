import type { Capability } from './dsm-schema.js';

/** 'X.Y.Z' -> [X, Y, Z]. Throws on malformed input — callers on untrusted
 *  data should validate with validateCapabilityMapData first. */
export function parseAddress(address: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(address.trim());
  if (!m) throw new Error(`parseAddress: expected 'X.Y.Z', got "${address}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function formatAddress(triple: [number, number, number]): string {
  return triple.join('.');
}

/** X.0.0 -> L1, X.Y.0 -> L2, X.Y.Z -> L3, 0.0.0 -> backlog. */
export function getLevel(address: string): 1 | 2 | 3 | 'backlog' {
  const [x, y, z] = parseAddress(address);
  if (x === 0) return 'backlog';
  if (y === 0) return 1;
  if (z === 0) return 2;
  return 3;
}

/** '1.2.3' -> '1.2.0'; '1.2.0' -> '1.0.0'; '1.0.0' -> null (L1 has no parent). */
export function getParentAddress(address: string): string | null {
  const [x, y, z] = parseAddress(address);
  if (z !== 0) return formatAddress([x, y, 0]);
  if (y !== 0) return formatAddress([x, 0, 0]);
  return null;
}

/** First address under `parent` (an L1 or L2 address) not already taken. */
export function getFirstFreeAddress(parent: string, capabilities: Capability[]): string {
  const [x, y] = parseAddress(parent);
  const level = getLevel(parent);
  if (level !== 1 && level !== 2) {
    throw new Error(`getFirstFreeAddress: parent must be an L1 or L2 address, got "${parent}" (${level})`);
  }
  for (let n = 1; n < 1000; n++) {
    const candidate = level === 1 ? formatAddress([x, n, 0]) : formatAddress([x, y, n]);
    if (!isAddressTaken(candidate, capabilities)) return candidate;
  }
  throw new Error(`getFirstFreeAddress: no free address under "${parent}" (searched 1..999)`);
}

export function isAddressTaken(address: string, capabilities: Capability[]): boolean {
  return capabilities.some((c) => !c.backlog && c.address === address);
}
