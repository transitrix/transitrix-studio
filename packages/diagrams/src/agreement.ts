// Agreement axis — methodology CONTRACT.md §6.3 / §6.3.1 (AGREE-001..003).
//
// A closed three-value axis (`draft` | `agreed` | `disputed`) carried by
// REQUIREMENT, CONSTRAINT, and NEED — independent of admission (§6.1),
// recording whether the accountable party has committed to the statement.
// Absent ⇒ `agreed` (back-compat; a human-authored element that predates
// this axis needs no change).
//
// Ported from methodology's reference implementation
// (`scripts/check-agreement.mjs`'s `checkAgreement`/`looksLikeTool`) so a
// repo carrying the field validates identically here — same closed
// vocabulary, same tool-id heuristic, same "AGREE-003 wins over AGREE-002
// when both would fire" precedence.

import type { ValidationError } from './validation-types.js';

export const AGREEMENT_VALUES = ['draft', 'agreed', 'disputed'] as const;
export type AgreementValue = (typeof AGREEMENT_VALUES)[number];

/** Same convention as `ADMIT-007`'s footgun-catcher: an npm-scoped name, or
 *  a hyphenated `*-cli` / `*-reviewer[-…]` / `*-bot` / `*-scanner` id, reads
 *  as a tool; anything else reads as a human handle. Not a security
 *  boundary — catches the common mistake of a tool defaulting or
 *  copy-pasting `agreed`. */
const TOOL_ID_RE = /^@|-cli$|-reviewer(?:-\w+)?$|-bot$|-scanner$/i;

export function looksLikeTool(id: unknown): boolean {
  return TOOL_ID_RE.test(String(id ?? ''));
}

/**
 * AGREE-001..003 over an element's already-extracted `agreement` /
 * `agreed_by` fields. Returns an empty list when `agreement` is absent
 * (back-compat — absent ⇒ `agreed`, nothing to check) or when the fields
 * are well-formed.
 *
 * AGREE-002 and AGREE-003 can both describe an `agreement: agreed` record
 * with no `agreed_by` — this reports AGREE-003 only, the same choice
 * `check-agreement.mjs` makes (CONTRACT.md §6.3.1 permits either or both).
 */
export function checkAgreement(record: Record<string, unknown>): ValidationError[] {
  const agreement = record.agreement;
  if (agreement === undefined) return [];

  if (typeof agreement !== 'string' || !(AGREEMENT_VALUES as readonly string[]).includes(agreement)) {
    return [{
      code: 'AGREE-001',
      message: `agreement "${String(agreement)}" must be one of ${AGREEMENT_VALUES.join(', ')}.`,
      path: 'agreement',
    }];
  }

  const agreedBy = record.agreed_by;
  if (typeof agreedBy !== 'string' || agreedBy.trim() === '') {
    return [{
      code: 'AGREE-003',
      message: 'agreed_by is required whenever agreement is present.',
      path: 'agreed_by',
    }];
  }

  if (agreement === 'agreed' && looksLikeTool(agreedBy)) {
    return [{
      code: 'AGREE-002',
      message: `agreement: agreed but agreed_by "${agreedBy}" identifies a tool — a tool must never write "agreed".`,
      path: 'agreed_by',
    }];
  }

  return [];
}
