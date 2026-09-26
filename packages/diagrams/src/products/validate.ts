import { schemaFinding } from '../schema-finding.js';
import type { ProductsCatalogueFile, ProductType, ProductStatus } from './types.js';
import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';

export type { ValidationError, ValidationWarning, ValidationResult };

const VALID_TYPES = new Set<ProductType>(['digital_product', 'service', 'platform', 'bundle']);
const VALID_STATUSES = new Set<ProductStatus>(['Draft', 'Active', 'Deprecated']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateProductsCatalogue(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: [schemaFinding('products inline', '$', 'mapping', input)], warnings };
  }

  const raw = input as Record<string, unknown>;

  // PROD-001: notation header
  if (!('notation' in raw)) {
    errors.push({ code: 'PROD-001', message: 'Missing required field: notation' });
  } else if (raw['notation'] !== 'products') {
    errors.push({ code: 'PROD-001', message: `notation must be "products", got "${raw['notation']}"` });
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  if (('view_config' in raw || 'view' in raw) && !('products_catalogue' in raw)) {
    return { valid: true, errors, warnings: [{ code: 'NOTATION-SKIP-001',
      message: 'products projection form is unsupported and remains unvalidated.' }] };
  }

  // PROD-002: catalogue header fields
  const cat = (raw['products_catalogue'] ?? {}) as Record<string, unknown>;
  if (!raw['products_catalogue'] || typeof raw['products_catalogue'] !== 'object' || Array.isArray(raw['products_catalogue'])) {
    errors.push(schemaFinding('products inline', 'products_catalogue', 'mapping', raw['products_catalogue']));
    return { valid: false, errors, warnings };
  }
  if (!cat['id'] || typeof cat['id'] !== 'string' || !(cat['id'] as string).trim()) {
    errors.push(schemaFinding('products inline', 'products_catalogue.id', 'nonempty string', cat['id']));
  }
  if (!cat['name'] || typeof cat['name'] !== 'string' || !(cat['name'] as string).trim()) {
    errors.push(schemaFinding('products inline', 'products_catalogue.name', 'nonempty string', cat['name']));
  }
  if (!cat['updated_at'] || typeof cat['updated_at'] !== 'string') {
    errors.push(schemaFinding('products inline', 'products_catalogue.updated_at', 'YYYY-MM-DD string', cat['updated_at']));
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // Schema: updated_at format
  if (!DATE_RE.test(cat['updated_at'] as string)) {
    errors.push(schemaFinding('products inline', 'products_catalogue.updated_at', 'YYYY-MM-DD string', cat['updated_at']));
  }

  const products = cat['products'];
  if (!Array.isArray(products)) {
    errors.push(schemaFinding('products inline', 'products_catalogue.products', 'array', cat['products']));
    return { valid: false, errors, warnings };
  }

  // Schema: unique product_id
  const seenIds = new Set<string>();

  for (let i = 0; i < products.length; i++) {
    const rawProduct = products[i];
    const idx = `products[${i}]`;

    if (!rawProduct || typeof rawProduct !== 'object' || Array.isArray(rawProduct)) {
      errors.push(schemaFinding('products inline', `${idx}`, 'mapping', rawProduct));
      continue;
    }
    const p = rawProduct as Record<string, unknown>;

    // Schema: required per-product fields
    if (!p['product_id'] || typeof p['product_id'] !== 'string' || !(p['product_id'] as string).trim()) {
      errors.push(schemaFinding('products inline', `${idx}.product_id`, 'nonempty string', p['product_id']));
    } else {
      const pid = p['product_id'] as string;
      if (seenIds.has(pid)) {
        errors.push(schemaFinding('products inline', `${idx}.product_id`, 'unique identifier', p['product_id']));
      }
      seenIds.add(pid);
    }

    if (!p['name'] || typeof p['name'] !== 'string' || !(p['name'] as string).trim()) {
      errors.push(schemaFinding('products inline', `${idx}.name`, 'nonempty string', p['name']));
    }
    if (!p['type']) {
      errors.push(schemaFinding('products inline', `${idx}.type`, `one of ${[...VALID_TYPES].join(", ")}`, p['type']));
    }
    if (!p['status']) {
      errors.push(schemaFinding('products inline', `${idx}.status`, `one of ${[...VALID_STATUSES].join(", ")}`, p['status']));
    }

    // Schema: type enum
    if (p['type'] && !VALID_TYPES.has(p['type'] as ProductType)) {
      errors.push(schemaFinding('products inline', `${idx}.type`, `one of ${[...VALID_TYPES].join(", ")}`, p['type']));
    }

    // Schema: status enum
    if (p['status'] && !VALID_STATUSES.has(p['status'] as ProductStatus)) {
      errors.push(schemaFinding('products inline', `${idx}.status`, `one of ${[...VALID_STATUSES].join(", ")}`, p['status']));
    }

    // Schema: maturity range
    if (p['maturity'] !== undefined) {
      const m = p['maturity'];
      if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > 5) {
        errors.push(schemaFinding('products inline', `${idx}.maturity`, 'integer in 1–5', p['maturity']));
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
