import { describe, it, expect } from 'vitest';
import { renderCapabilityMapHtml } from '../render-capability-map.js';
import { resolveCapabilityAttributes } from '../../capability-map/resolve-maturity.js';
import type { CapabilityMapHeader } from '../../capability-map/types.js';

const MAP: CapabilityMapHeader = {
  id: 'CAPMAP-1',
  name: 'Enterprise Capability Map',
  assessment_date: '2026-08-01',
  capabilities: [
    { id: 'CAPABILITY-V1', name: 'Order Management', current_maturity: 1 },
  ],
};

const SIDECAR = {
  target: 'CAPABILITY-V1',
  attribute_versions: {
    owner_role: [{ valid_from: '2026-05-26', value: 'ROLE-OPS-1' }],
    target_maturity: [{ valid_from: '2026-05-26', value: 5 }],
  },
};

describe('renderCapabilityMapHtml — sidecar resolution', () => {
  it('renders unchanged (no resolved-note, no owner) when no resolution is supplied', () => {
    const html = renderCapabilityMapHtml(MAP);
    expect(html).not.toContain('resolved as of');
    expect(html).not.toContain('ROLE-OPS-1');
  });

  it('fills owner_role/target_maturity from a resolved sidecar and states the as-of date', () => {
    const byId = resolveCapabilityAttributes([SIDECAR], '2026-08-05');
    const html = renderCapabilityMapHtml(MAP, { asOf: '2026-08-05', byId });
    expect(html).toContain('ROLE-OPS-1');
    expect(html).toContain('resolved as of 2026-08-05');
  });

  it('never mutates the source map object', () => {
    const byId = resolveCapabilityAttributes([SIDECAR], '2026-08-05');
    renderCapabilityMapHtml(MAP, { asOf: '2026-08-05', byId });
    expect(MAP.capabilities[0].owner_role).toBeUndefined();
  });
});
