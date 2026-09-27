export type CheckStatus = 'consistent' | 'inconsistent' | 'unverifiable' | 'not-applicable';
export interface ProvenanceResult {
  contract_version: 'document-provenance/1';
  status: 'consistent' | 'inconsistent' | 'incomplete';
  incomplete: boolean;
  coverage: Record<CheckStatus, number>;
  checks: Array<{
    id: string; scope: string; status: CheckStatus; reason: string;
    expected: string | boolean | null; observed: string | boolean | null;
    evidence: string[]; basis: string;
  }>;
}
export interface ProvenanceAdapter {
  /** Authorize the entire immutable selection before any reads or diagnostics. */
  authorize?: () => unknown | Promise<unknown>;
  /** Observations must come from a trusted observer, never from recorded claims. */
  load?: () => unknown | Promise<unknown>;
}
export const PROVENANCE_VERSION: 'document-provenance/1';
export function checkDocumentProvenance(adapter?: ProvenanceAdapter): Promise<ProvenanceResult>;
