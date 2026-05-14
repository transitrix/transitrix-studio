import { describe, it, expect } from 'vitest';
import { validateApplicationsCatalogue } from '../validate.js';

const VALID_CATALOGUE = {
  notation: 'applications',
  applications_catalogue: {
    id: 'APP-CAT-001',
    name: 'Enterprise Applications',
    updated_at: '2026-05-14',
    applications: [
      { app_id: 'APP-001', name: 'Order System', type: 'application', status: 'Active', maturity: 3 },
      { app_id: 'INT-001', name: 'Event Bus', type: 'integration', status: 'Draft' },
    ],
  },
};

describe('validateApplicationsCatalogue', () => {
  it('passes on valid input', () => {
    const r = validateApplicationsCatalogue(VALID_CATALOGUE);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('APP-001: rejects non-object input', () => {
    expect(validateApplicationsCatalogue(null).valid).toBe(false);
    expect(validateApplicationsCatalogue(null).errors[0].code).toBe('APP-001');
  });

  it('APP-001: rejects missing notation', () => {
    const { notation: _, ...rest } = VALID_CATALOGUE;
    const r = validateApplicationsCatalogue(rest);
    expect(r.errors.some(e => e.code === 'APP-001')).toBe(true);
  });

  it('APP-001: rejects wrong notation value', () => {
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, notation: 'products' });
    expect(r.errors.some(e => e.code === 'APP-001')).toBe(true);
  });

  it('APP-002: rejects missing applications_catalogue', () => {
    const r = validateApplicationsCatalogue({ notation: 'applications' });
    expect(r.errors.some(e => e.code === 'APP-002')).toBe(true);
  });

  it('APP-002: rejects missing id', () => {
    const cat = { ...VALID_CATALOGUE.applications_catalogue, id: '' };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-002' && e.message.includes('id'))).toBe(true);
  });

  it('APP-002: rejects missing name', () => {
    const cat = { ...VALID_CATALOGUE.applications_catalogue, name: '  ' };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-002' && e.message.includes('name'))).toBe(true);
  });

  it('APP-002: rejects missing updated_at', () => {
    const { updated_at: _, ...cat } = VALID_CATALOGUE.applications_catalogue;
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-002' && e.message.includes('updated_at'))).toBe(true);
  });

  it('APP-002: rejects non-array applications', () => {
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: 'bad' };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-002')).toBe(true);
  });

  it('APP-003: rejects missing app_id', () => {
    const apps = [{ name: 'X', type: 'application', status: 'Active' }];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-003' && e.message.includes('app_id'))).toBe(true);
  });

  it('APP-003: rejects missing name', () => {
    const apps = [{ app_id: 'A1', name: '', type: 'application', status: 'Active' }];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-003' && e.message.includes('name'))).toBe(true);
  });

  it('APP-003: rejects missing type', () => {
    const apps = [{ app_id: 'A1', name: 'X', status: 'Active' }];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-003' && e.message.includes('type'))).toBe(true);
  });

  it('APP-003: rejects missing status', () => {
    const apps = [{ app_id: 'A1', name: 'X', type: 'application' }];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-003' && e.message.includes('status'))).toBe(true);
  });

  it('APP-004: rejects invalid type', () => {
    const apps = [{ app_id: 'A1', name: 'X', type: 'hardware', status: 'Active' }];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-004')).toBe(true);
  });

  it('APP-004: accepts all valid types', () => {
    for (const type of ['application', 'integration', 'platform', 'data_store']) {
      const apps = [{ app_id: 'A1', name: 'X', type, status: 'Active' }];
      const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
      const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
      expect(r.errors.some(e => e.code === 'APP-004')).toBe(false);
    }
  });

  it('APP-005: rejects invalid status', () => {
    const apps = [{ app_id: 'A1', name: 'X', type: 'application', status: 'Unknown' }];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-005')).toBe(true);
  });

  it('APP-005: accepts all four valid statuses', () => {
    for (const status of ['Draft', 'Active', 'Deprecated', 'Decommissioning']) {
      const apps = [{ app_id: 'A1', name: 'X', type: 'application', status }];
      const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
      const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
      expect(r.errors.some(e => e.code === 'APP-005')).toBe(false);
    }
  });

  it('APP-006: rejects maturity < 1', () => {
    const apps = [{ app_id: 'A1', name: 'X', type: 'application', status: 'Active', maturity: 0 }];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-006')).toBe(true);
  });

  it('APP-006: rejects maturity > 5', () => {
    const apps = [{ app_id: 'A1', name: 'X', type: 'application', status: 'Active', maturity: 6 }];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-006')).toBe(true);
  });

  it('APP-006: rejects non-integer maturity', () => {
    const apps = [{ app_id: 'A1', name: 'X', type: 'application', status: 'Active', maturity: 3.5 }];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-006')).toBe(true);
  });

  it('APP-006: accepts valid maturity range 1-5', () => {
    for (const maturity of [1, 2, 3, 4, 5]) {
      const apps = [{ app_id: 'A1', name: 'X', type: 'application', status: 'Active', maturity }];
      const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
      const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
      expect(r.errors.some(e => e.code === 'APP-006')).toBe(false);
    }
  });

  it('APP-007: rejects malformed updated_at', () => {
    const cat = { ...VALID_CATALOGUE.applications_catalogue, updated_at: '14/05/2026' };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-007')).toBe(true);
  });

  it('APP-007: accepts YYYY-MM-DD format', () => {
    const cat = { ...VALID_CATALOGUE.applications_catalogue, updated_at: '2026-01-01' };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-007')).toBe(false);
  });

  it('APP-008: rejects duplicate app_id', () => {
    const apps = [
      { app_id: 'A1', name: 'X', type: 'application', status: 'Active' },
      { app_id: 'A1', name: 'Y', type: 'platform', status: 'Draft' },
    ];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-008')).toBe(true);
  });

  it('APP-009: rejects invalid integration direction', () => {
    const apps = [{
      app_id: 'A1', name: 'X', type: 'application', status: 'Active',
      integrations: [{ target: 'A2', direction: 'sideways' }],
    }];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.errors.some(e => e.code === 'APP-009')).toBe(true);
  });

  it('APP-009: accepts valid integration directions', () => {
    for (const direction of ['inbound', 'outbound', 'bidirectional']) {
      const apps = [{
        app_id: 'A1', name: 'X', type: 'application', status: 'Active',
        integrations: [{ target: 'A2', direction }],
      }];
      const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
      const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
      expect(r.errors.some(e => e.code === 'APP-009')).toBe(false);
    }
  });

  it('APP-009: accepts integration without direction', () => {
    const apps = [{
      app_id: 'A1', name: 'X', type: 'application', status: 'Active',
      integrations: [{ target: 'A2', protocol: 'REST' }],
    }];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.valid).toBe(true);
  });

  it('accepts empty applications array', () => {
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: [] };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.valid).toBe(true);
  });

  it('accepts application with all optional fields', () => {
    const apps = [{
      app_id: 'A1', name: 'Full App', type: 'application', status: 'Active',
      domain: 'Sales', owner_role: 'ROLE-001', vendor: 'Salesforce', maturity: 4,
      description: 'CRM system', capabilities: ['CAP-001'], products: ['PROD-001'],
      integrations: [{ target: 'A2', direction: 'outbound', protocol: 'REST', description: 'sends events' }],
    }];
    const cat = { ...VALID_CATALOGUE.applications_catalogue, applications: apps };
    const r = validateApplicationsCatalogue({ ...VALID_CATALOGUE, applications_catalogue: cat });
    expect(r.valid).toBe(true);
  });
});
