// Candidate-only fields on admitted canon — `ADMIT-009`.
//
// `ELEMENT_PRIMITIVES.md` §7.29 (methodology v3.6.0) states it normatively for
// `RELEASE` and then generalises it to every TYPE:
//
//   > `RELEASE` has no `extraction_confidence` field — and neither does any
//   > other canon element, of any TYPE. `extraction_confidence` is a review
//   > flag on an ingest candidate (`candidate.extraction_confidence`,
//   > vocabulary.yaml); it is surfaced in the review queue, drives
//   > reviewer-authority routing (CONTRACT.md §6.2), and is never persisted
//   > into canon. An admitted element carrying it is a defect in whatever
//   > wrote it, not a precedent to follow.
//
// Nothing enforced that mechanically. The ingest pipeline that produces the
// field lives in `methodology`'s `packages/ingest-cli` and only ever writes
// *candidates*; admission into `canon/elements/**` happens in an adopter's own
// tooling, which is `@transitrix/cli validate`'s side of the fence — so this is
// where the rule has to bite.
//
// **Why the check keys on `zone`, not on the folder.** `extraction_confidence`
// is legitimate on a candidate and meaningless — but not a defect — elsewhere;
// only the *admitted* form is wrong. `zone: canon` is the admission marker
// every standalone element carries (`ELEMENT_PRIMITIVES.md` §3, required
// envelope field, `ELEM-001`), and it is the discriminator against the two
// zones that may legitimately carry harvest metadata: `zone: field`, whose
// provenance contract owns `source_quality` (CONTRACT.md §5/§11.2), and
// `zone: codex`. Sidecars (`*.history.yaml`, `*.runstate.yaml`) carry no
// `zone` and no `id`, so they fall out for free — the same "no id -> not an
// element" split `docId` already makes for every sibling check in this folder.
//
// **Rule code.** Studio-authored as `ELEM-CANDIDATE-FIELD-001` (in the shape
// methodology already uses for a named element-envelope rule outside the
// numbered run — `ELEM-ALIAS-001`, `ELEM-FORMER-ID-001` — deliberately not
// `ELEM-006`, since the numbered `ELEM-*` run is methodology's to extend and
// squatting the next free number would collide with whatever it registers
// there next). Renamed to `ADMIT-009` (transitrix/methodology#505, merged
// 2026-08-19) now that methodology has registered a code of its own for
// §7.29 — no functional change, this is that alias.

import { docId } from './validate-repo.js';
import type { RepoDoc, RepoFinding, RepoModelInput } from './types.js';

const PScope: RepoFinding['scope'] = 'repo';

/**
 * Fields that belong to an ingest candidate and are never persisted into
 * canon. Each entry names the field and the provenance pattern that replaces
 * it, so the finding points at the correct shape rather than only failing
 * closed. One entry today; the list is the extension point if methodology
 * closes another candidate-side field out of canon the same way.
 */
const CANDIDATE_ONLY_FIELDS: readonly { field: string; instead: string }[] = [
  {
    field: 'extraction_confidence',
    instead:
      "cite the evidence through 'derived_from' (ELEMENT_PRIMITIVES.md §3) — " +
      'an OBSERVATION or another Field/Codex artefact; the review flag stays on the ' +
      'ingest candidate and is not carried across admission',
  },
];

/** True when the doc is an admitted canon element — `zone: canon` per
 *  `ELEMENT_PRIMITIVES.md` §3. Deliberately narrow: a doc with no `zone`
 *  (a sidecar) or a non-canon zone (`field`, `codex`) is not admitted canon
 *  and this rule says nothing about it. */
function isAdmittedCanonElement(doc: RepoDoc): boolean {
  return doc.data?.['zone'] === 'canon';
}

/**
 * `ADMIT-009` — a candidate-only field present on an admitted (`zone: canon`)
 * element, of any TYPE. Appends findings; pure, deterministic order.
 */
export function checkCandidateFields(input: RepoModelInput, findings: RepoFinding[]): void {
  for (const doc of input.elements) {
    if (!doc.data) continue;
    if (!isAdmittedCanonElement(doc)) continue;

    const id = docId(doc) ?? '';
    for (const { field, instead } of CANDIDATE_ONLY_FIELDS) {
      if (doc.data[field] === undefined) continue;
      findings.push({
        scope: PScope,
        id,
        ruleId: 'ADMIT-009',
        message:
          `ADMIT-009: admitted element '${id || doc.path}' carries '${field}', ` +
          `which is an ingest-candidate review flag and is never persisted into canon ` +
          `(ELEMENT_PRIMITIVES.md §7.29). Remove it and ${instead}.`,
      });
    }
  }
}
