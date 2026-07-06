// CanonCatalog builder — repo-scope cross-reference resolution (#518 Phase C3).
//
// Scans admitted YAML documents and builds the `{ typeOf }` catalogue that
// `validateRequirement` / `validateAssertion` accept for REQ-002 and
// ASSERT-002..005 resolution.

import { typeOfId, type CanonCatalog } from '../typed-id.js';
import { emptyCanon, ingestComplianceDoc, type ComplianceCanon } from './classify.js';

export interface ScannedYamlDoc {
  path: string;
  data: unknown;
}

export interface ComplianceScanResult {
  complianceCanon: ComplianceCanon;
  catalog: CanonCatalog;
  /** First path where each admitted id was seen (for gap-dashboard warnings). */
  pathById: Map<string, string>;
}

function strId(doc: unknown): string | undefined {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return undefined;
  const id = (doc as Record<string, unknown>).id;
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : undefined;
}

/** Admit one parsed document into the id → TYPE map. */
export function admitDocumentToCatalog(map: Map<string, string>, doc: unknown): string | undefined {
  const id = strId(doc);
  if (!id) return undefined;

  const fromPrefix = typeOfId(id);
  if (fromPrefix) {
    map.set(id, fromPrefix);
    return id;
  }

  if (doc !== null && typeof doc === 'object' && !Array.isArray(doc)) {
    const d = doc as Record<string, unknown>;
    if (d.zone === 'codex') {
      const explicit = typeof d.type === 'string' ? d.type.trim().toUpperCase() : undefined;
      if (explicit) {
        map.set(id, explicit);
        return id;
      }
    }
  }
  return undefined;
}

/** Build a read-only `CanonCatalog` from a populated id → TYPE map. */
export function catalogFromMap(map: Map<string, string>): CanonCatalog {
  return { typeOf: (id: string) => map.get(id) };
}

/** Ingest compliance projections and admit cross-reference targets from a batch
 *  of already-parsed YAML documents (no IO). */
export function buildComplianceScan(docs: ScannedYamlDoc[]): ComplianceScanResult {
  const complianceCanon = emptyCanon();
  const catalogMap = new Map<string, string>();
  const pathById = new Map<string, string>();

  for (const { path, data } of docs) {
    const ingested = ingestComplianceDoc(complianceCanon, data);
    if (ingested) pathById.set(ingested, path);
    const admitted = admitDocumentToCatalog(catalogMap, data);
    if (admitted && !pathById.has(admitted)) pathById.set(admitted, path);
  }

  return {
    complianceCanon,
    catalog: catalogFromMap(catalogMap),
    pathById,
  };
}
