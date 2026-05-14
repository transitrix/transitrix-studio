import type { ProductsCatalogueFile, ProductType, ProductStatus } from './types.js';

export interface ValidationError { code: string; message: string; }
export interface ValidationWarning { code: string; message: string; }
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

const VALID_TYPES = new Set<ProductType>(['digital_product', 'service', 'platform', 'bundle']);
const VALID_STATUSES = new Set<ProductStatus>(['Draft', 'Active', 'Deprecated']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateProductsCatalogue(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'PROD-001', message: 'Input must be an object' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  // PROD-001: notation header
  if (!('notation' in raw)) {
    errors.push({ code: 'PROD-001', message: 'Missing required field: notation' });
  } else if (raw['notation'] !== 'products') {
    errors.push({ code: 'PROD-001', message: `notation must be "products", got "${raw['notation']}"` });
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // PROD-002: catalogue header fields
  const cat = (raw['products_catalogue'] ?? {}) as Record<string, unknown>;
  if (!raw['products_catalogue'] || typeof raw['products_catalogue'] !== 'object') {
    errors.push({ code: 'PROD-002', message: 'Missing required field: products_catalogue' });
    return { valid: false, errors, warnings };
  }
  if (!cat['id'] || typeof cat['id'] !== 'string' || !(cat['id'] as string).trim()) {
    errors.push({ code: 'PROD-002', message: 'products_catalogue.id is required' });
  }
  if (!cat['name'] || typeof cat['name'] !== 'string' || !(cat['name'] as string).trim()) {
    errors.push({ code: 'PROD-002', message: 'products_catalogue.name is required' });
  }
  if (!cat['updated_at'] || typeof cat['updated_at'] !== 'string') {
    errors.push({ code: 'PROD-002', message: 'products_catalogue.updated_at is required' });
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // PROD-007: updated_at format
  if (!DATE_RE.test(cat['updated_at'] as string)) {
    errors.push({ code: 'PROD-007', message: `products_catalogue.updated_at must be YYYY-MM-DD, got "${cat['updated_at']}"` });
  }

  const products = cat['products'];
  if (!Array.isArray(products)) {
    errors.push({ code: 'PROD-002', message: 'products_catalogue.products must be an array' });
    return { valid: false, errors, warnings };
  }

  // PROD-008: unique product_id
  const seenIds = new Set<string>();

  for (let i = 0; i < products.length; i++) {
    const p = products[i] as Record<string, unknown>;
    const idx = `products[${i}]`;

    // PROD-003: required per-product fields
    if (!p['product_id'] || typeof p['product_id'] !== 'string' || !(p['product_id'] as string).trim()) {
      errors.push({ code: 'PROD-003', message: `${idx}: product_id is required` });
    } else {
      const pid = p['product_id'] as string;
      if (seenIds.has(pid)) {
        errors.push({ code: 'PROD-008', message: `Duplicate product_id: "${pid}"` });
      }
      seenIds.add(pid);
    }

    if (!p['name'] || typeof p['name'] !== 'string' || !(p['name'] as string).trim()) {
      errors.push({ code: 'PROD-003', message: `${idx}: name is required` });
    }
    if (!p['type']) {
      errors.push({ code: 'PROD-003', message: `${idx}: type is required` });
    }
    if (!p['status']) {
      errors.push({ code: 'PROD-003', message: `${idx}: status is required` });
    }

    // PROD-004: type enum
    if (p['type'] && !VALID_TYPES.has(p['type'] as ProductType)) {
      errors.push({ code: 'PROD-004', message: `${idx}: type "${p['type']}" must be one of: digital_product, service, platform, bundle` });
    }

    // PROD-005: status enum
    if (p['status'] && !VALID_STATUSES.has(p['status'] as ProductStatus)) {
      errors.push({ code: 'PROD-005', message: `${idx}: status "${p['status']}" must be one of: Draft, Active, Deprecated` });
    }

    // PROD-006: maturity range
    if (p['maturity'] !== undefined) {
      const m = p['maturity'];
      if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > 5) {
        errors.push({ code: 'PROD-006', message: `${idx}: maturity must be an integer 1–5, got "${m}"` });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
