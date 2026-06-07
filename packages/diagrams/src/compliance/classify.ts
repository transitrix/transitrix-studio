// Canon-artefact classification (vkgeorgia/strategy#84). The single authority
// for "what is a compliance artefact" — used by both the Studio extension scan
// (webview previews) and the CLI scan (`export-compliance`), so the recognition
// rules live once. Pure: takes a parsed YAML document, no IO.

import type { AssertionStatus } from '../assertion/types.js';
import type { IndexAssertion, IndexRequirement } from './types.js';

export interface ComplianceProduct {
  id: string;
  name: string;
}
export interface ComplianceCodexDoc {
  id: string;
  name: string;
  type?: string;
  jurisdiction?: string;
}

/** The bucketed result of scanning a repo for compliance canon. */
export interface ComplianceCanon {
  products: ComplianceProduct[];
  requirements: IndexRequirement[];
  assertions: IndexAssertion[];
  codex: ComplianceCodexDoc[];
}

export function emptyCanon(): ComplianceCanon {
  return { products: [], requirements: [], assertions: [], codex: [] };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const strArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

/**
 * Classifies one parsed YAML document and, if it is a compliance artefact,
 * pushes its projection into `canon`. Products / requirements / assertions are
 * identified by their `notation` tag; codex source documents by `zone: codex`.
 * Returns the artefact id when ingested (so the caller can record its path), or
 * null when the document is not a (well-formed) compliance artefact.
 */
export function ingestComplianceDoc(canon: ComplianceCanon, doc: unknown): string | null {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const d = doc as Record<string, unknown>;
  const id = str(d.id);
  if (!id) return null;

  if (d.notation === 'product') {
    canon.products.push({ id, name: str(d.name) ?? id });
    return id;
  }
  if (d.notation === 'requirement') {
    canon.requirements.push({
      id,
      name: str(d.name) ?? id,
      severity: str(d.severity),
      derived_from: strArray(d.derived_from),
      admitted_at: str(d.admitted_at),
    });
    return id;
  }
  if (d.notation === 'assertion') {
    const about = str(d.about);
    const subject = str(d.subject);
    const status = str(d.status) as AssertionStatus | undefined;
    if (!about || !subject || !status) return null;
    canon.assertions.push({
      id, about, subject, status,
      assessed_at: str(d.assessed_at),
      next_review_at: str(d.next_review_at),
      evidenceCount: Array.isArray(d.evidence) ? d.evidence.length : 0,
      admitted_at: str(d.admitted_at),
    });
    return id;
  }
  if (d.zone === 'codex') {
    canon.codex.push({ id, name: str(d.name) ?? id, type: str(d.type), jurisdiction: str(d.jurisdiction) });
    return id;
  }
  return null;
}
