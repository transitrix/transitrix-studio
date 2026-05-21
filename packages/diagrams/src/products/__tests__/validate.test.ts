import { describe, it, expect } from 'vitest';
import { validateProductsCatalogue } from '../validate.js';

const VALID_CATALOGUE = {
  notation: 'products',
  products_catalogue: {
    id: 'cat-2026',
    name: 'Portfolio 2026',
    updated_at: '2026-05-13',
    products: [
      {
        product_id: 'prod-001',
        name: 'Analytics Platform',
        type: 'platform',
        status: 'Active',
        domain: 'Data',
        maturity: 3,
      },
      {
        product_id: 'prod-002',
        name: 'HR Service',
        type: 'service',
        status: 'Draft',
      },
    ],
  },
};

describe('validateProductsCatalogue', () => {
  it('passes on valid input', () => {
    const r = validateProductsCatalogue(VALID_CATALOGUE);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('PROD-001: rejects non-object input', () => {
    const r = validateProductsCatalogue(null);
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('PROD-001');
  });

  it('PROD-001: rejects missing notation field', () => {
    const { notation: _, ...rest } = VALID_CATALOGUE;
    const r = validateProductsCatalogue(rest);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-001')).toBe(true);
  });

  it('PROD-001: rejects wrong notation value', () => {
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, notation: 'goals' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-001')).toBe(true);
  });

  it('PROD-002: rejects missing products_catalogue', () => {
    const r = validateProductsCatalogue({ notation: 'products' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-002')).toBe(true);
  });

  it('PROD-002: rejects missing catalogue id', () => {
    const cat = { ...VALID_CATALOGUE.products_catalogue, id: '' };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-002' && e.message.includes('id'))).toBe(true);
  });

  it('PROD-002: rejects missing catalogue name', () => {
    const cat = { ...VALID_CATALOGUE.products_catalogue, name: '   ' };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-002' && e.message.includes('name'))).toBe(true);
  });

  it('PROD-002: rejects missing updated_at', () => {
    const { updated_at: _, ...cat } = VALID_CATALOGUE.products_catalogue;
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-002' && e.message.includes('updated_at'))).toBe(true);
  });

  it('PROD-002: rejects non-array products', () => {
    const cat = { ...VALID_CATALOGUE.products_catalogue, products: 'not-an-array' };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-002')).toBe(true);
  });

  it('PROD-003: rejects missing product_id', () => {
    const products = [{ name: 'X', type: 'service', status: 'Active' }];
    const cat = { ...VALID_CATALOGUE.products_catalogue, products };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-003' && e.message.includes('product_id'))).toBe(true);
  });

  it('PROD-003: rejects missing name', () => {
    const products = [{ product_id: 'p1', name: '', type: 'service', status: 'Active' }];
    const cat = { ...VALID_CATALOGUE.products_catalogue, products };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-003' && e.message.includes('name'))).toBe(true);
  });

  it('PROD-003: rejects missing type', () => {
    const products = [{ product_id: 'p1', name: 'X', status: 'Active' }];
    const cat = { ...VALID_CATALOGUE.products_catalogue, products };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-003' && e.message.includes('type'))).toBe(true);
  });

  it('PROD-003: rejects missing status', () => {
    const products = [{ product_id: 'p1', name: 'X', type: 'service' }];
    const cat = { ...VALID_CATALOGUE.products_catalogue, products };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-003' && e.message.includes('status'))).toBe(true);
  });

  it('PROD-004: rejects invalid type', () => {
    const products = [{ product_id: 'p1', name: 'X', type: 'hardware', status: 'Active' }];
    const cat = { ...VALID_CATALOGUE.products_catalogue, products };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-004')).toBe(true);
  });

  it('PROD-004: accepts all valid types', () => {
    for (const type of ['digital_product', 'service', 'platform', 'bundle']) {
      const products = [{ product_id: 'p1', name: 'X', type, status: 'Active' }];
      const cat = { ...VALID_CATALOGUE.products_catalogue, products };
      const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
      expect(r.errors.some(e => e.code === 'PROD-004')).toBe(false);
    }
  });

  it('PROD-005: rejects invalid status', () => {
    const products = [{ product_id: 'p1', name: 'X', type: 'service', status: 'Active2' }];
    const cat = { ...VALID_CATALOGUE.products_catalogue, products };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-005')).toBe(true);
  });

  it('PROD-005: accepts all valid statuses', () => {
    for (const status of ['Draft', 'Active', 'Deprecated']) {
      const products = [{ product_id: 'p1', name: 'X', type: 'service', status }];
      const cat = { ...VALID_CATALOGUE.products_catalogue, products };
      const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
      expect(r.errors.some(e => e.code === 'PROD-005')).toBe(false);
    }
  });

  it('PROD-006: rejects maturity < 1', () => {
    const products = [{ product_id: 'p1', name: 'X', type: 'service', status: 'Active', maturity: 0 }];
    const cat = { ...VALID_CATALOGUE.products_catalogue, products };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-006')).toBe(true);
  });

  it('PROD-006: rejects maturity > 5', () => {
    const products = [{ product_id: 'p1', name: 'X', type: 'service', status: 'Active', maturity: 6 }];
    const cat = { ...VALID_CATALOGUE.products_catalogue, products };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-006')).toBe(true);
  });

  it('PROD-006: rejects non-integer maturity', () => {
    const products = [{ product_id: 'p1', name: 'X', type: 'service', status: 'Active', maturity: 2.5 }];
    const cat = { ...VALID_CATALOGUE.products_catalogue, products };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-006')).toBe(true);
  });

  it('PROD-006: accepts valid maturity range 1-5', () => {
    for (const maturity of [1, 2, 3, 4, 5]) {
      const products = [{ product_id: 'p1', name: 'X', type: 'service', status: 'Active', maturity }];
      const cat = { ...VALID_CATALOGUE.products_catalogue, products };
      const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
      expect(r.errors.some(e => e.code === 'PROD-006')).toBe(false);
    }
  });

  it('PROD-007: rejects malformed updated_at', () => {
    const cat = { ...VALID_CATALOGUE.products_catalogue, updated_at: '13-05-2026' };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-007')).toBe(true);
  });

  it('PROD-007: accepts YYYY-MM-DD format', () => {
    const cat = { ...VALID_CATALOGUE.products_catalogue, updated_at: '2026-01-01' };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.errors.some(e => e.code === 'PROD-007')).toBe(false);
  });

  it('PROD-008: rejects duplicate product_id', () => {
    const products = [
      { product_id: 'p1', name: 'X', type: 'service', status: 'Active' },
      { product_id: 'p1', name: 'Y', type: 'platform', status: 'Draft' },
    ];
    const cat = { ...VALID_CATALOGUE.products_catalogue, products };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-008')).toBe(true);
  });

  it('accepts empty products array', () => {
    const cat = { ...VALID_CATALOGUE.products_catalogue, products: [] };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(true);
  });

  it('accepts optional fields when absent', () => {
    const products = [{ product_id: 'p1', name: 'X', type: 'service', status: 'Active' }];
    const cat = { ...VALID_CATALOGUE.products_catalogue, products };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(true);
  });

  // Pre-release blocker regression (orchestrator review 2026-05-21).
  it('[blocker] tolerates a null element in products[] without throwing', () => {
    const cat = { ...VALID_CATALOGUE.products_catalogue, products: [null] };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-003')).toBe(true);
  });

  it('[blocker] tolerates a string element in products[] without throwing', () => {
    const cat = { ...VALID_CATALOGUE.products_catalogue, products: ['x'] };
    const r = validateProductsCatalogue({ ...VALID_CATALOGUE, products_catalogue: cat });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PROD-003')).toBe(true);
  });
});
