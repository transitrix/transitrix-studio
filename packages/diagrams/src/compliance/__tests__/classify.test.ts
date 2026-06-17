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
});
