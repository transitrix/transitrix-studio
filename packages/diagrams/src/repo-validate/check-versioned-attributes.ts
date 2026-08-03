// Versioned-attribute sidecar checks (CONTRACT.md §9) — `VERSIONED-001..005`.
//
// A sidecar is any doc under `canon/elements/**` shaped like one (`target` +
// `attribute_versions`, no `id` — same "no id -> not an element" convention
// `docId` already uses to skip these docs everywhere else in this file's
// sibling checks). Both halves of §9.3 live here:
//   - VERSIONED-001 — a sidecar's `target` must resolve to an admitted
//     primitive in this same model.
//   - VERSIONED-002/003/005 — the sidecar's own array shape, delegated to
//     the shared `../versioned-attribute` module (needs VERSIONED-005's
//     bound: the target's own `valid_from`/`valid_to`, read from the
//     resolved target doc).
//   - VERSIONED-004 — a field declared `time_varying` present inline on its
//     primitive, instead of only in the sidecar.
//
// `TIME_VARYING_FIELDS` is deliberately narrower than the full candidate
// list in CONTRACT.md §9.4: it only enforces fields already `time_varying`
// on methodology's *currently-merged* `notations/views/05-capability-map.md`
// (`current_maturity`, `owner_role`, `target_date`). `target_maturity`
// (capability) and `maturity` (application) become time_varying only once
// methodology PR #425 (the other half of the 2026-08-02 maturity ADR)
// merges — enforcing VERSIONED-004 on those now would fail the acme_corp
// worked example (`CAPABILITY-V1.yaml` still carries `target_maturity`
// inline, correctly, under the spec merged today) against a spec that isn't
// canon yet. Extend this table once #425 lands.

import { parseSidecar, validateSidecar } from '../versioned-attribute/index.js';
import { docId } from './validate-repo.js';
import type { RepoDoc, RepoFinding, RepoModelInput } from './types.js';

const PScope: RepoFinding['scope'] = 'repo';

const TIME_VARYING_FIELDS: Record<string, string[]> = {
  capability: ['current_maturity', 'owner_role', 'target_date'],
};

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** VERSIONED-004 — a time_varying field present inline on its primitive. */
function checkInlineTimeVarying(elements: RepoDoc[], findings: RepoFinding[]): void {
  for (const doc of elements) {
    if (!doc.data) continue;
    const id = docId(doc);
    if (!id) continue; // sidecars carry no id — not a primitive
    const notation = doc.data['notation'];
    if (typeof notation !== 'string') continue;
    const fields = TIME_VARYING_FIELDS[notation];
    if (!fields) continue;

    for (const field of fields) {
      if (doc.data[field] !== undefined) {
        findings.push({
          scope: PScope,
          id,
          ruleId: 'VERSIONED-004',
          message:
            `VERSIONED-004: '${id}' declares '${field}' inline; it is time_varying and belongs in ` +
            `the sidecar '${id}.history.yaml' (CONTRACT.md §9), not on the primitive.`,
        });
      }
    }
  }
}

/** VERSIONED-001/002/003/005 — every sidecar doc found under `canon/elements/**`. */
function checkSidecars(elements: RepoDoc[], findings: RepoFinding[]): void {
  const elementById = new Map<string, RepoDoc>();
  for (const doc of elements) {
    const id = docId(doc);
    if (id) elementById.set(id, doc);
  }

  for (const doc of elements) {
    if (!doc.data || docId(doc)) continue; // sidecars have no id
    const sidecar = parseSidecar(doc.data);
    if (!sidecar) continue; // not shaped like a sidecar — ignore, same as docId's element/non-element split

    const targetDoc = elementById.get(sidecar.target);
    if (!targetDoc) {
      findings.push({
        scope: PScope,
        id: sidecar.target,
        ruleId: 'VERSIONED-001',
        message: `VERSIONED-001: sidecar '${doc.path}' target '${sidecar.target}' does not resolve to an admitted primitive.`,
      });
      continue;
    }

    const targetValidFrom = targetDoc.data ? readString(targetDoc.data, 'valid_from') : undefined;
    const validToRaw = targetDoc.data?.['valid_to'];
    const targetValidTo = validToRaw === null ? null : typeof validToRaw === 'string' ? validToRaw : undefined;

    for (const f of validateSidecar(sidecar, targetValidFrom, targetValidTo)) {
      findings.push({
        scope: PScope,
        id: sidecar.target,
        ruleId: f.code,
        severity: f.severity,
        message: `${f.code}: sidecar '${doc.path}' ${f.message}`,
      });
    }
  }
}

/** Run the versioned-attribute sidecar checks (VERSIONED-001..005) over the
 *  loaded element set and append findings. Pure, deterministic order. */
export function checkVersionedAttributes(input: RepoModelInput, findings: RepoFinding[]): void {
  checkInlineTimeVarying(input.elements, findings);
  checkSidecars(input.elements, findings);
}
