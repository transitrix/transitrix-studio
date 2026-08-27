// Document-source (`.ttrs`) file naming, placement and kind checks.
//
// A `.ttrs` document source is prose with `{{ … }}` directives rather than a
// YAML mapping, so it never reaches the per-notation dispatch in
// validate-notation.ts — that keys off a parsed `notation:` field. The rules a
// `.ttrs` file still shares with every other notation are the file-level ones:
// one notation has exactly one extension, and a notation's files live in that
// notation's folder (CONTRACT.md §3, rule `HDR-003`). Those are checked here,
// from the path and the front matter alone, with no template parse.
//
// Kinds — `mrd`, `srs`, `sdd`, … — are the middle segment of the filename and
// are NOT notations of their own: one notation, one extension, one registered
// folder, with the kind as a value inside it. There is deliberately no closed
// kind list here; the check is that the filename's kind and the header's `kind:`
// agree, not that the kind is drawn from a registry this repo would have to keep
// in step with the methodology's.
//
// Pure — takes paths and text, returns findings. The walk that feeds it lives in
// repo-validate.ts.

import yaml from 'js-yaml';

/** The one canonical extension for a document source. */
export const DOCUMENT_SOURCE_EXTENSION = '.ttrs';

/** The near-miss: one keystroke away, and a different, widely used format. */
export const DOCUMENT_SOURCE_NEAR_MISS_EXTENSION = '.trs';

/** The normative registered folder for document sources. */
export const DOCUMENT_SOURCE_FOLDER = 'views/documents';

/** The legacy folder path, supported during transition. */
const DOCUMENT_SOURCE_FOLDER_LEGACY = 'canon/views/documents';

/** `<basename>.<kind>.ttrs` — exactly two dots, the middle segment is the kind. */
const DOCUMENT_SOURCE_FILENAME = /^[^.]+\.([a-z0-9-]+)\.ttrs$/;

/** A finding in the shape repo-validate.ts's ViewFinding needs, minus the
 *  `notation` field the caller fills in. */
export interface DocumentSourceFinding {
  file: string;
  ruleId: string;
  severity: 'error';
  message: string;
}

function toPosix(rel: string): string {
  return rel.replace(/\\/g, '/');
}

function basenameOf(rel: string): string {
  return toPosix(rel).split('/').pop() ?? rel;
}

/** True for a path this module owns — a document source or its near-miss.
 *  Used by the repo walk to decide what to hand over. */
export function isDocumentSourcePath(rel: string): boolean {
  const base = basenameOf(rel).toLowerCase();
  return (
    base.endsWith(DOCUMENT_SOURCE_EXTENSION) || base.endsWith(DOCUMENT_SOURCE_NEAR_MISS_EXTENSION)
  );
}

/** The kind in `<basename>.<kind>.ttrs`, or `undefined` when the filename does
 *  not have that shape. */
export function kindFromFilename(rel: string): string | undefined {
  return DOCUMENT_SOURCE_FILENAME.exec(basenameOf(rel))?.[1];
}

/** Read the `kind:` field out of the YAML front matter. Returns `undefined`
 *  when there is no front matter, when it does not parse, or when `kind:` is
 *  absent or not a string — the caller reports each of those as `TTRS-001`
 *  rather than guessing a kind. */
export function kindFromHeader(text: string): string | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(text);
  if (!m) return undefined;
  let front: unknown;
  try {
    front = yaml.load(m[1]);
  } catch {
    return undefined;
  }
  if (!front || typeof front !== 'object' || Array.isArray(front)) return undefined;
  const kind = (front as Record<string, unknown>).kind;
  return typeof kind === 'string' && kind.length > 0 ? kind : undefined;
}

/** Extension and placement — everything decidable from the path alone.
 *
 *  `HDR-003` is the extension/content-match rule every notation is already held
 *  to; a document source participates in it on the same terms. The `.trs`
 *  near-miss is reported in words under that same rule, never as an unknown
 *  file: a bare "unrecognised extension" sends the author looking for the wrong
 *  problem. */
export function checkDocumentSourcePath(rel: string): DocumentSourceFinding[] {
  const file = toPosix(rel);
  const base = basenameOf(file);

  if (base.toLowerCase().endsWith(DOCUMENT_SOURCE_NEAR_MISS_EXTENSION)) {
    return [
      {
        file,
        ruleId: 'HDR-003',
        severity: 'error',
        message:
          `Ends "${DOCUMENT_SOURCE_NEAR_MISS_EXTENSION}" — the document-source extension is ` +
          `"${DOCUMENT_SOURCE_EXTENSION}" ("${DOCUMENT_SOURCE_NEAR_MISS_EXTENSION}" is a ` +
          `different, widely used format, one keystroke away). Did you mean ` +
          `"${base.slice(0, -DOCUMENT_SOURCE_NEAR_MISS_EXTENSION.length)}${DOCUMENT_SOURCE_EXTENSION}"? ` +
          `Rename it, or move it out of the tree if it really is a ` +
          `${DOCUMENT_SOURCE_NEAR_MISS_EXTENSION} file.`,
      },
    ];
  }

  const findings: DocumentSourceFinding[] = [];

  if (!DOCUMENT_SOURCE_FILENAME.test(base)) {
    findings.push({
      file,
      ruleId: 'HDR-003',
      severity: 'error',
      message:
        `Not named <basename>.<kind>${DOCUMENT_SOURCE_EXTENSION} — the middle segment is the ` +
        `document kind (e.g. product.mrd${DOCUMENT_SOURCE_EXTENSION}).`,
    });
  }

  const folder = file.slice(0, file.length - base.length).replace(/\/$/, '');
  const isValidFolder = folder === DOCUMENT_SOURCE_FOLDER || folder === DOCUMENT_SOURCE_FOLDER_LEGACY;
  if (!isValidFolder) {
    findings.push({
      file,
      ruleId: 'HDR-003',
      severity: 'error',
      message:
        `A "${DOCUMENT_SOURCE_EXTENSION}" document source belongs in ` +
        `${DOCUMENT_SOURCE_FOLDER}/ (or the legacy ${DOCUMENT_SOURCE_FOLDER_LEGACY}/ during transition), ` +
        `not ${folder === '' ? 'the repository root' : `${folder}/`}.`,
    });
  }

  return findings;
}

/** The header half: the filename's kind and the front matter's `kind:` must
 *  agree (`TTRS-013`). Kept distinct from the `HDR-003` findings above so a
 *  disagreement over the kind never reads as a wrong extension — they have
 *  different fixes. */
export function checkDocumentSourceKind(rel: string, text: string): DocumentSourceFinding[] {
  const file = toPosix(rel);
  const filenameKind = kindFromFilename(file);
  // No kind in the filename means checkDocumentSourcePath has already said so;
  // there is nothing to compare the header against.
  if (filenameKind === undefined) return [];

  const headerKind = kindFromHeader(text);
  if (headerKind === undefined) {
    return [
      {
        file,
        ruleId: 'TTRS-001',
        severity: 'error',
        message:
          'Header: no YAML front matter, or no string "kind:" field in it. A document source ' +
          'declares its kind in the header as well as in its filename.',
      },
    ];
  }

  if (headerKind !== filenameKind) {
    return [
      {
        file,
        ruleId: 'TTRS-013',
        severity: 'error',
        message:
          `Header says kind: ${headerKind}, but the filename's kind segment is ` +
          `"${filenameKind}". They must agree — change whichever one is wrong.`,
      },
    ];
  }

  return [];
}

/** Both halves, for one file. */
export function validateDocumentSource(rel: string, text: string): DocumentSourceFinding[] {
  const pathFindings = checkDocumentSourcePath(rel);
  return [...pathFindings, ...checkDocumentSourceKind(rel, text)];
}
