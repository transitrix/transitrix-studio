// Canonical typed-ID grammar + cross-reference resolution catalogue.
//
// Every element ID and cross-reference in the Transitrix canon follows the
// grammar in methodology `notations/IDS_AND_REFERENCES.md` §1:
//
//     <TYPE>-[<middle segment(s)>-]<INTEGER>
//
//   - TYPE: uppercase, starts with a letter, may contain digits and `_`
//     (multi-word TYPEs like INTERNAL_STANDARD / PROCESS_BLUEPRINT).
//   - middle: optional, notation-specific segments.
//   - INTEGER: terminal positive integer, no leading zeros.
//
// CAPABILITY is the one exception (§2): its terminal is a V/H diagram address
// (CAPABILITY-V1.2) rather than a plain integer. Compliance artefacts only
// *resolve* capability ids (they never own one), so the catalogue handles
// them; the strict integer-terminal grammar below is used only for an
// artefact's own id (REQUIREMENT-… / ASSERTION-…).

/** TYPE prefix of a typed id — the segment before the first hyphen. */
const TYPE_PREFIX_RE = /^([A-Z][A-Z0-9_]*)-/;

/** Full integer-terminal canonical id. Middle segments may be mixed-case
 *  (real canon ids such as INTERNAL_STANDARD-coding-conventions-1 exist). */
const CANONICAL_ID_RE = /^[A-Z][A-Z0-9_]*(?:-[A-Za-z0-9]+)*-[1-9][0-9]*$/;

/** Extracts the TYPE prefix of a typed id, or null when `id` is not a typed
 *  reference (`PRODUCT-MOBILE-1` → `PRODUCT`, `CAPABILITY-V2` → `CAPABILITY`). */
export function typeOfId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const m = TYPE_PREFIX_RE.exec(id);
  return m ? m[1] : null;
}

/** True when `id` is a well-formed integer-terminal canonical id. */
export function isCanonicalId(id: unknown): id is string {
  return typeof id === 'string' && CANONICAL_ID_RE.test(id);
}

/** True when `id` is a well-formed canonical id whose TYPE is exactly `type`. */
export function isCanonicalIdOfType(id: unknown, type: string): boolean {
  return isCanonicalId(id) && typeOfId(id) === type;
}

/**
 * A read-only view of an organisation's admitted canon, used to resolve typed
 * cross-references during validation. Phase 1 validators accept it optionally:
 * with no catalogue they perform shape + prefix-TYPE checks only; given one,
 * they additionally enforce the resolution rules (REQ-002, ASSERT-002/004/005…)
 * that depend on whether a referenced artefact actually exists.
 *
 * The compliance previews (Phase 2+) build a catalogue by scanning the repo.
 */
export interface CanonCatalog {
  /** TYPE of an admitted artefact with this id, or undefined if not admitted. */
  typeOf(id: string): string | undefined;
}
