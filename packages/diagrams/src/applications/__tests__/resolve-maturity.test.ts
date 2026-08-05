import { describe, it, expect } from 'vitest';
import { resolveApplicationAttributes, withResolvedAttributes } from '../resolve-maturity.js';
import type { Application } from '../types.js';

const SIDECAR_CRM = {
  target: 'APPLICATION-CRM-1',
  attribute_versions: {
    owner_role: [{ valid_from: '2026-05-26', value: 'ROLE-SALES-1' }],
    vendor: [{ valid_from: '2026-05-26', value: 'Salesforce' }],
    maturity: [
      { valid_from: '2026-05-26', value: 2 },
      { valid_from: '2026-08-01', value: 3 },
    ],
  },
};

const NOT_A_SIDECAR = { notation: 'application', id: 'APPLICATION-CRM-1', name: 'CRM System' };

describe('resolveApplicationAttributes', () => {
  it('resolves owner_role/vendor/maturity from a sidecar at a date', () => {
    const byAppId = resolveApplicationAttributes([SIDECAR_CRM, NOT_A_SIDECAR], '2026-08-05');
    expect(byAppId.get('APPLICATION-CRM-1')).toEqual({
      owner_role: 'ROLE-SALES-1',
      vendor: 'Salesforce',
      maturity: 3,
    });
  });

  it('resolves the earlier value before a later entry takes effect', () => {
    const byAppId = resolveApplicationAttributes([SIDECAR_CRM], '2026-06-01');
    expect(byAppId.get('APPLICATION-CRM-1')?.maturity).toBe(2);
  });

  it('ignores docs that are not shaped like a sidecar', () => {
    const byAppId = resolveApplicationAttributes([NOT_A_SIDECAR, null, 'not an object', 42], '2026-08-05');
    expect(byAppId.size).toBe(0);
  });

  it('omits an app entirely when it has no matching sidecar', () => {
    const byAppId = resolveApplicationAttributes([], '2026-08-05');
    expect(byAppId.has('APPLICATION-CRM-1')).toBe(false);
  });
});

describe('withResolvedAttributes', () => {
  const app: Application = { app_id: 'APPLICATION-CRM-1', name: 'CRM System', type: 'application', status: 'Active' };

  it('merges resolved values onto an application with none inline', () => {
    const resolved = resolveApplicationAttributes([SIDECAR_CRM], '2026-08-05');
    const merged = withResolvedAttributes(app, resolved);
    expect(merged).toMatchObject({ owner_role: 'ROLE-SALES-1', vendor: 'Salesforce', maturity: 3 });
    // Never mutates the source row.
    expect(app.maturity).toBeUndefined();
  });

  it('returns the same app unchanged when there is no resolution for it', () => {
    const resolved = resolveApplicationAttributes([], '2026-08-05');
    expect(withResolvedAttributes(app, resolved)).toBe(app);
  });
});
