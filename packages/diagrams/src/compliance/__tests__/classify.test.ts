import { describe, it, expect } from 'vitest';
import { emptyCanon, ingestComplianceDoc } from '../classify.js';

describe('ingestComplianceDoc', () => {
  it('buckets each artefact kind by notation / zone', () => {
    const canon = emptyCanon();
    expect(ingestComplianceDoc(canon, { notation: 'product', id: 'PRODUCT-1', name: 'P' })).toBe('PRODUCT-1');
    expect(ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQUIREMENT-1', name: 'R', severity: 'high', derived_from: ['LAW-1'], admitted_at: '2026-05-28' })).toBe('REQUIREMENT-1');
    expect(ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-1', about: 'REQUIREMENT-1', subject: 'PRODUCT-1', status: 'compliant', evidence: [{ kind: 'note', text: 'x' }], admitted_at: '2026-05-28' })).toBe('ASSERTION-1');
    expect(ingestComplianceDoc(canon, { id: 'LAW-1', name: 'Law', type: 'LAW', zone: 'codex', jurisdiction: 'ge' })).toBe('LAW-1');

    expect(canon.products).toEqual([{ id: 'PRODUCT-1', name: 'P' }]);
    expect(canon.requirements[0]).toMatchObject({ id: 'REQUIREMENT-1', severity: 'high', derived_from: ['LAW-1'] });
    expect(canon.assertions[0]).toMatchObject({ id: 'ASSERTION-1', status: 'compliant', evidenceCount: 1 });
    expect(canon.codex[0]).toMatchObject({ id: 'LAW-1', type: 'LAW', jurisdiction: 'ge' });
    expect(canon.subjects).toEqual([]);
  });

  it('ingests capability, process, application, system into canon.subjects', () => {
    const canon = emptyCanon();
    expect(ingestComplianceDoc(canon, { notation: 'capability', id: 'CAPABILITY-V2', name: 'CRM' })).toBe('CAPABILITY-V2');
    expect(ingestComplianceDoc(canon, { notation: 'process', id: 'PROCESS-CS-1', name: 'Support' })).toBe('PROCESS-CS-1');
    expect(ingestComplianceDoc(canon, { notation: 'application', id: 'APP-ERP-1', name: 'ERP System' })).toBe('APP-ERP-1');
    expect(ingestComplianceDoc(canon, { notation: 'system', id: 'SYSTEM-IAM-1', name: 'IAM' })).toBe('SYSTEM-IAM-1');
    expect(canon.subjects).toEqual([
      { id: 'CAPABILITY-V2', name: 'CRM' },
      { id: 'PROCESS-CS-1', name: 'Support' },
      { id: 'APP-ERP-1', name: 'ERP System' },
      { id: 'SYSTEM-IAM-1', name: 'IAM' },
    ]);
    expect(canon.products).toEqual([]);
  });

  it('falls back to id when name is absent for subjects', () => {
    const canon = emptyCanon();
    ingestComplianceDoc(canon, { notation: 'capability', id: 'CAPABILITY-X-1' });
    expect(canon.subjects[0]).toEqual({ id: 'CAPABILITY-X-1', name: 'CAPABILITY-X-1' });
  });

  it('captures owner_to_confirm on pending_owner assertions', () => {
    const canon = emptyCanon();
    ingestComplianceDoc(canon, {
      notation: 'assertion', id: 'ASSERTION-PO-1',
      about: 'REQUIREMENT-1', subject: 'PRODUCT-1',
      status: 'pending_owner', owner_to_confirm: 'alice@example.com',
    });
    expect(canon.assertions[0]).toMatchObject({
      id: 'ASSERTION-PO-1',
      status: 'pending_owner',
      owner_to_confirm: 'alice@example.com',
    });
  });

  it('returns null for non-artefacts, missing id, and malformed assertions', () => {
    const canon = emptyCanon();
    expect(ingestComplianceDoc(canon, { notation: 'goals', id: 'X-1' })).toBeNull();
    expect(ingestComplianceDoc(canon, { notation: 'product' })).toBeNull(); // no id
    expect(ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-2', about: 'R' })).toBeNull(); // missing subject/status
    expect(ingestComplianceDoc(canon, null)).toBeNull();
    expect(ingestComplianceDoc(canon, 'str')).toBeNull();
    expect(canon.products).toEqual([]);
    expect(canon.subjects).toEqual([]);
  });

  // transitrix-hq#218 — two documents claiming the same product id rendered as
  // two identical matrix columns because canon.products.push had no dedup.
  it('drops a second document that reuses an already-ingested id in the same bucket', () => {
    const canon = emptyCanon();
    expect(ingestComplianceDoc(canon, { notation: 'product', id: 'PRODUCT-1', name: 'First' })).toBe('PRODUCT-1');
    expect(ingestComplianceDoc(canon, { notation: 'product', id: 'PRODUCT-1', name: 'Duplicate' })).toBeNull();
    expect(canon.products).toEqual([{ id: 'PRODUCT-1', name: 'First' }]);
    expect(canon.duplicateIds).toEqual(['PRODUCT-1']);
  });

  it('does not flag a repeated id across different buckets as a duplicate', () => {
    const canon = emptyCanon();
    ingestComplianceDoc(canon, { notation: 'product', id: 'SAME-1', name: 'P' });
    ingestComplianceDoc(canon, { notation: 'capability', id: 'SAME-1', name: 'C' });
    expect(canon.products).toEqual([{ id: 'SAME-1', name: 'P' }]);
    expect(canon.subjects).toEqual([{ id: 'SAME-1', name: 'C' }]);
    expect(canon.duplicateIds).toEqual([]);
  });
});

describe('lossless requirement-chain intake', () => {
  it('retains raw malformed verification fields, source path and duplicates across legacy buckets', () => {
    const canon = emptyCanon();
    const doc = { id: 'VERIFICATION-RAW-1', notation: 'verification', protocol: null, outcome: ['invalid'], evidence: 'invalid',
      verified_on: 'RELEASE-RAW-1', valid_from: false, valid_to: null };
    ingestComplianceDoc(canon, doc, 'canon/verification.yaml');
    expect(canon.verifications).toEqual([]);
    expect(canon.records[0]).toMatchObject({ id: doc.id, type: 'VERIFICATION', sourcePath: 'canon/verification.yaml', raw: doc });
    doc.protocol = null;
    ingestComplianceDoc(canon, { ...doc, notation: 'product' }, 'canon/duplicate.yaml');
    expect(canon.records).toHaveLength(2);
  });
  it('retains Field descriptors, REL fields, release predecessors and malformed-document findings', () => {
    const canon = emptyCanon();
    const docs = [
      { id: 'OBSERVATION-RAW-1', zone: 'field', source_document: { title: 'Research', uri: 'https://example.org', revision: '1' } },
      { id: 'REL-RAW-1', type: 'product_scope', from: 'REQUIREMENT-RAW-1', to: 'PRODUCT-RAW-1', valid_from: 'invalid' },
      { id: 'RELEASE-RAW-2', of: 'PRODUCT-RAW-1', predecessor: 'RELEASE-RAW-1' },
    ];
    docs.forEach(d => ingestComplianceDoc(canon, d));
    expect(canon.records.map(r => r.raw)).toEqual(docs);
    ingestComplianceDoc(canon, null, 'broken.yaml');
    expect(canon.findings).toContainEqual(expect.objectContaining({ owner: 'broken.yaml', code: 'INTAKE' }));
  });
});
