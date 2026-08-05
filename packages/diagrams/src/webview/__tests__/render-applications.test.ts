import { describe, it, expect } from 'vitest';
import { renderApplicationsHtml } from '../render-applications.js';
import { resolveApplicationAttributes } from '../../applications/resolve-maturity.js';
import type { ApplicationsCatalogueHeader } from '../../applications/types.js';

const CATALOGUE: ApplicationsCatalogueHeader = {
  id: 'APP-CAT-001',
  name: 'Enterprise Applications',
  updated_at: '2026-05-14',
  applications: [
    { app_id: 'APPLICATION-CRM-1', name: 'CRM System', type: 'application', status: 'Active' },
  ],
};

const SIDECAR = {
  target: 'APPLICATION-CRM-1',
  attribute_versions: {
    owner_role: [{ valid_from: '2026-05-26', value: 'ROLE-SALES-1' }],
    vendor: [{ valid_from: '2026-05-26', value: 'Salesforce' }],
    maturity: [{ valid_from: '2026-05-26', value: 2 }],
  },
};

describe('renderApplicationsHtml — sidecar resolution', () => {
  it('renders blank cells when no resolution is supplied (unchanged behaviour)', () => {
    const html = renderApplicationsHtml(CATALOGUE);
    expect(html).not.toContain('resolved as of');
    expect(html).toContain('cell-empty');
    expect(html).not.toContain('ROLE-SALES-1');
  });

  it('fills owner/vendor/maturity from a resolved sidecar and states the as-of date', () => {
    const byAppId = resolveApplicationAttributes([SIDECAR], '2026-08-05');
    const html = renderApplicationsHtml(CATALOGUE, { asOf: '2026-08-05', byAppId });
    expect(html).toContain('ROLE-SALES-1');
    expect(html).toContain('Salesforce');
    expect(html).toContain('resolved as of 2026-08-05');
  });

  it('never mutates the source catalogue object', () => {
    const byAppId = resolveApplicationAttributes([SIDECAR], '2026-08-05');
    renderApplicationsHtml(CATALOGUE, { asOf: '2026-08-05', byAppId });
    expect(CATALOGUE.applications[0].maturity).toBeUndefined();
  });
});
