// Canon-artefact classification. The single authority
// for "what is a compliance artefact" — used by both the Studio extension scan
// (webview previews) and the CLI scan (`export-compliance`), so the recognition
// rules live once. Pure: takes a parsed YAML document, no IO.

import type { AssertionStatus } from '../assertion/types.js';
import type { VerificationMethod, VerificationOutcome } from '../verification/types.js';
import type { ValidationMethod, ValidationOutcome } from '../validation/types.js';
import type { IndexAssertion, IndexRequirement, IndexVerification, IndexNeed, IndexValidation } from './types.js';

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
  /** VERIFICATION artefacts (27-verification.md) — the engineering V&V peer of `assertions`. */
  verifications: IndexVerification[];
  codex: ComplianceCodexDoc[];
  /**
   * Named elements that can serve as assertion subjects beyond `products`:
   * capabilities, processes, applications, and systems. Populated by
   * `ingestComplianceDoc` for the corresponding notation values.
   */
  subjects: ComplianceProduct[];
  /** NEED elements (ELEMENT_PRIMITIVES.md §7.28) — upstream of `requirements`.
   *  Ingested so NEED-COVERAGE-001 / NEED-VALIDATION-COVERAGE-001..002 can
   *  compute coverage over the full needs catalogue. */
  needs: IndexNeed[];
  /** VALIDATION artefacts (28-validation.md) — the validation-domain peer of
   *  `verifications`, anchored on NEED instead of REQUIREMENT. */
  validations: IndexValidation[];
  /**
   * Ids rejected by `ingestComplianceDoc` because that id was already present
   * in the same bucket (two documents claiming one id — transitrix-hq#218).
   * The second and any later document is dropped rather than silently
   * duplicating a matrix column; callers that scan a filesystem can surface
   * this list as a diagnostic.
   */
  duplicateIds: string[];
}

export function emptyCanon(): ComplianceCanon {
  return {
    products: [],
    requirements: [],
    assertions: [],
    verifications: [],
    codex: [],
    subjects: [],
    needs: [],
    validations: [],
    duplicateIds: [],
  };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const strArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

/**
 * Pushes `item` onto `list` unless `list` already holds an entry with the same
 * id, in which case the id is recorded in `canon.duplicateIds` and the item is
 * dropped — two documents claiming one id is a defect (transitrix-hq#218), not
 * a second matrix column.
 */
function pushUnique<T extends { id: string }>(canon: ComplianceCanon, list: T[], item: T): boolean {
  if (list.some(existing => existing.id === item.id)) {
    canon.duplicateIds.push(item.id);
    return false;
  }
  list.push(item);
  return true;
}

/**
 * Classifies one parsed YAML document and, if it is a compliance artefact,
 * pushes its projection into `canon`. Products / requirements / assertions are
 * identified by their `notation` tag; codex source documents by `zone: codex`.
 * Returns the artefact id when ingested (so the caller can record its path), or
 * null when the document is not a (well-formed) compliance artefact, or when
 * its id duplicates one already ingested into the same bucket (see
 * `canon.duplicateIds`).
 */
export function ingestComplianceDoc(canon: ComplianceCanon, doc: unknown): string | null {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const d = doc as Record<string, unknown>;
  const id = str(d.id);
  if (!id) return null;

  if (d.notation === 'product') {
    return pushUnique(canon, canon.products, { id, name: str(d.name) ?? id }) ? id : null;
  }
  if (
    d.notation === 'capability' ||
    d.notation === 'process' ||
    d.notation === 'application' ||
    d.notation === 'system'
  ) {
    return pushUnique(canon, canon.subjects, { id, name: str(d.name) ?? id }) ? id : null;
  }
  if (d.notation === 'requirement' || d.notation === 'constraint') {
    const origin = str(d.origin);
    const ok = pushUnique(canon, canon.requirements, {
      id,
      name: str(d.name) ?? id,
      severity: str(d.severity),
      derived_from: strArray(d.derived_from),
      admitted_at: str(d.admitted_at),
      deadline: str(d.deadline),
      origin: origin === 'legislative' || origin === 'process-product' || origin === 'project-product' ? origin : undefined,
      parent: str(d.parent),
      element_kind: d.notation,
      description: str(d.description),
      next_review_at: str(d.next_review_at),
      serves: str(d.serves),
    });
    return ok ? id : null;
  }
  if (d.notation === 'need') {
    return pushUnique(canon, canon.needs, { id, name: str(d.name) ?? id }) ? id : null;
  }
  if (d.notation === 'validation') {
    const validates = str(d.validates);
    const method = str(d.method) as ValidationMethod | undefined;
    const outcome = str(d.outcome) as ValidationOutcome | undefined;
    if (!validates || !method || !outcome) return null;
    const ok = pushUnique(canon, canon.validations, {
      id, validates, method, outcome,
      performed_at: str(d.performed_at),
      evidenceCount: Array.isArray(d.evidence) ? d.evidence.length : 0,
      admitted_at: str(d.admitted_at),
    });
    return ok ? id : null;
  }
  if (d.notation === 'assertion') {
    const about = str(d.about);
    const subject = str(d.subject);
    const status = str(d.status) as AssertionStatus | undefined;
    if (!about || !subject || !status) return null;
    const ok = pushUnique(canon, canon.assertions, {
      id, about, subject, status,
      assessed_at: str(d.assessed_at),
      next_review_at: str(d.next_review_at),
      evidenceCount: Array.isArray(d.evidence) ? d.evidence.length : 0,
      admitted_at: str(d.admitted_at),
      realised_via: strArray(d.realised_via),
      owner_to_confirm: str(d.owner_to_confirm),
    });
    return ok ? id : null;
  }
  if (d.notation === 'verification') {
    const verifies = str(d.verifies);
    const method = str(d.method) as VerificationMethod | undefined;
    const outcome = str(d.outcome) as VerificationOutcome | undefined;
    if (!verifies || !method || !outcome) return null;
    const ok = pushUnique(canon, canon.verifications, {
      id, verifies, method, outcome,
      performed_at: str(d.performed_at),
      evidenceCount: Array.isArray(d.evidence) ? d.evidence.length : 0,
      admitted_at: str(d.admitted_at),
    });
    return ok ? id : null;
  }
  if (d.zone === 'codex') {
    return pushUnique(canon, canon.codex, { id, name: str(d.name) ?? id, type: str(d.type), jurisdiction: str(d.jurisdiction) }) ? id : null;
  }
  return null;
}
