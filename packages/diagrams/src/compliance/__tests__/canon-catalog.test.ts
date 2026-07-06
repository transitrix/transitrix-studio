import { describe, it, expect } from 'vitest';

import {
  admitDocumentToCatalog,
  buildComplianceScan,
  catalogFromMap,
} from '../canon-catalog.js';

describe('buildComplianceScan', () => {
  it('admits codex, requirement, and assertion ids into the catalogue', () => {
    const docs = [
      {
        path: 'codex/external/ge/LAW-PERSONAL-DATA-2017-1.yaml',
        data: {
          zone: 'codex',
          id: 'LAW-PERSONAL-DATA-2017-1',
          name: 'Law',
          type: 'LAW',
        },
      },
      {
        path: 'canon/elements/01_motivation/requirements/REQUIREMENT-DATA-ERASURE-1.yaml',
        data: {
          notation: 'requirement',
          id: 'REQUIREMENT-DATA-ERASURE-1',
          name: 'Erasure',
          derived_from: ['LAW-PERSONAL-DATA-2017-1'],
        },
      },
      {
        path: 'canon/elements/02_business/products/PRODUCT-MOBILE-1.yaml',
        data: { notation: 'product', id: 'PRODUCT-MOBILE-1', name: 'Mobile' },
      },
      {
        path: 'canon/assertions/ASSERTION-MOBILE-DATA-ERASURE-1.yaml',
        data: {
          notation: 'assertion',
          id: 'ASSERTION-MOBILE-DATA-ERASURE-1',
          about: 'REQUIREMENT-DATA-ERASURE-1',
          subject: 'PRODUCT-MOBILE-1',
          status: 'compliant',
        },
      },
    ];

    const { catalog, complianceCanon, pathById } = buildComplianceScan(docs);
    expect(catalog.typeOf('LAW-PERSONAL-DATA-2017-1')).toBe('LAW');
    expect(catalog.typeOf('REQUIREMENT-DATA-ERASURE-1')).toBe('REQUIREMENT');
    expect(catalog.typeOf('PRODUCT-MOBILE-1')).toBe('PRODUCT');
    expect(complianceCanon.requirements).toHaveLength(1);
    expect(complianceCanon.assertions).toHaveLength(1);
    expect(complianceCanon.codex).toHaveLength(1);
    expect(pathById.get('REQUIREMENT-DATA-ERASURE-1')).toContain('requirements/');
  });
});

describe('admitDocumentToCatalog', () => {
  it('uses explicit codex type when the id prefix is ambiguous', () => {
    const map = new Map<string, string>();
    admitDocumentToCatalog(map, {
      zone: 'codex',
      id: 'INTERNAL_STANDARD-coding-conventions-1',
      type: 'INTERNAL_STANDARD',
    });
    const catalog = catalogFromMap(map);
    expect(catalog.typeOf('INTERNAL_STANDARD-coding-conventions-1')).toBe('INTERNAL_STANDARD');
  });
});
