// Loader for the vendored methodology vocabulary artefact.
//
// The artefact is the authored source for every closed set the methodology
// defines; this repo vendors a tagged copy under `vendor/methodology/` (see the
// README there) and never reads a sibling checkout or fetches at runtime.
//
// Everything here **fails closed**. A missing file, an unparseable one, a
// missing or mismatched pin, a hash that does not match, or a section that is
// absent or the wrong shape throws. There is no fallback vocabulary and no
// "could not evaluate, so pass" path: a consumer that cannot read the artefact
// must fail, or the drift check silently stops checking.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as parseYaml } from 'js-yaml';

/** `vendor/methodology/VENDORED.json` — where the copy came from, and its hash. */
export interface VendorPin {
  source_repo: string;
  source_ref: string;
  source_path: string;
  methodology_version: string;
  sha256: string;
  vendored_on: string;
}

/** The closed sets the artefact carries, flattened to what the check compares. */
export interface VocabularyArtefact {
  methodologyVersion: string;
  /** Live element TYPEs — `element_types`. */
  elementTypes: string[];
  /** Retired TYPE names still accepted through their alias window. */
  deprecatedElementTypes: string[];
  relationTypes: string[];
  deprecatedRelationTypes: string[];
  /** `<owner>.<field>` (or a bare axis name) → its closed set. */
  valueVocabularies: Map<string, string[]>;
  ruleCodes: string[];
}

export const VENDOR_DIR = fileURLToPath(new URL('../../vendor/methodology/', import.meta.url));

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

class ArtefactError extends Error {}

function fail(message: string): never {
  throw new ArtefactError(message);
}

/** SHA-256 over LF-normalised bytes, so a CRLF checkout on Windows does not
 *  read as a tampered artefact while a real content change still does. */
export function hashArtefact(bytes: Buffer | string): string {
  const text = (typeof bytes === 'string' ? bytes : bytes.toString('utf8')).replace(/\r\n/g, '\n');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function readPin(dir: string): VendorPin {
  const path = join(dir, 'VENDORED.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    fail(`vendor pin not found: ${path}. The vocabulary artefact must be vendored and pinned.`);
  }

  let pin: unknown;
  try {
    pin = JSON.parse(raw);
  } catch (err) {
    fail(`vendor pin is not valid JSON: ${path} (${(err as Error).message})`);
  }
  if (typeof pin !== 'object' || pin === null) fail(`vendor pin is not an object: ${path}`);

  const p = pin as Record<string, unknown>;
  for (const field of ['source_repo', 'source_ref', 'source_path', 'methodology_version', 'sha256', 'vendored_on']) {
    const value = p[field];
    if (typeof value !== 'string' || value.trim() === '') {
      fail(`vendor pin is missing \`${field}\`: ${path}. An unpinned artefact is a failure, never a pass.`);
    }
  }
  if (!SEMVER_RE.test(p.methodology_version as string)) {
    fail(`vendor pin \`methodology_version\` is not semver-shaped: ${String(p.methodology_version)}`);
  }
  if (!/^[0-9a-f]{64}$/.test(p.sha256 as string)) {
    fail(`vendor pin \`sha256\` is not a SHA-256 digest: ${String(p.sha256)}`);
  }
  return pin as VendorPin;
}

function requireMapping(doc: Record<string, unknown>, section: string, path: string): Record<string, unknown> {
  const value = doc[section];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`vocabulary artefact section \`${section}\` is missing or not a mapping: ${path}`);
  }
  const mapping = value as Record<string, unknown>;
  if (Object.keys(mapping).length === 0) {
    fail(`vocabulary artefact section \`${section}\` is empty: ${path}`);
  }
  return mapping;
}

/**
 * Reads, verifies and flattens the vendored artefact. `dir` defaults to the
 * repository's own `vendor/methodology/`; the fixtures pass their own.
 */
export function loadVendoredVocabulary(dir: string = VENDOR_DIR): { pin: VendorPin; artefact: VocabularyArtefact } {
  const pin = readPin(dir);
  const path = join(dir, 'vocabulary.yaml');

  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    fail(`vocabulary artefact not found: ${path} (pinned at ${pin.source_repo}@${pin.source_ref})`);
  }

  const actual = hashArtefact(bytes);
  if (actual !== pin.sha256) {
    fail(
      `vocabulary artefact does not match its pin.\n` +
        `  expected sha256 ${pin.sha256}\n` +
        `  actual   sha256 ${actual}\n` +
        `The vendored copy is verbatim; re-vendor with scripts/vendor-methodology-vocabulary.mjs rather than editing it.`,
    );
  }

  let doc: unknown;
  try {
    doc = parseYaml(bytes.toString('utf8'));
  } catch (err) {
    fail(`vocabulary artefact is not parseable YAML: ${path} (${(err as Error).message})`);
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    fail(`vocabulary artefact is not a YAML mapping: ${path}`);
  }
  const root = doc as Record<string, unknown>;

  const declared = root.methodology_version;
  if (typeof declared !== 'string' || !SEMVER_RE.test(declared)) {
    fail(`vocabulary artefact carries no semver \`methodology_version\`: ${path}`);
  }
  if (declared !== pin.methodology_version) {
    fail(
      `vocabulary artefact version ${declared} does not match the vendor pin ${pin.methodology_version}: ${path}`,
    );
  }

  const valueVocabularies = new Map<string, string[]>();
  for (const [key, entry] of Object.entries(requireMapping(root, 'value_vocabularies', path))) {
    const values = (entry as Record<string, unknown> | null)?.values;
    if (!Array.isArray(values) || values.length === 0) {
      fail(`vocabulary artefact \`value_vocabularies.${key}\` carries no \`values\` list: ${path}`);
    }
    valueVocabularies.set(
      key,
      values.map((v) => String(v)),
    );
  }

  return {
    pin,
    artefact: {
      methodologyVersion: declared,
      elementTypes: Object.keys(requireMapping(root, 'element_types', path)),
      deprecatedElementTypes: Object.keys(requireMapping(root, 'deprecated_element_types', path)),
      relationTypes: Object.keys(requireMapping(root, 'relation_types', path)),
      deprecatedRelationTypes: Object.keys(requireMapping(root, 'deprecated_relation_types', path)),
      valueVocabularies,
      ruleCodes: Object.keys(requireMapping(root, 'rule_codes', path)),
    },
  };
}
