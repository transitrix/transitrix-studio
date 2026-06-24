import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { coerceDatesToIsoStrings } from '@transitrix/diagrams/yaml-normalize.js';

// Shared filesystem layer for the canon/ element + relation store.
//
// Every Studio preview that reads canonical data (VP-* series) uses the same
// approach: walk up from the active file to the nearest ancestor directory
// named `canon/`, then recursively load canon/elements/** and
// canon/relations/**. This module owns that shared FS half; the per-notation
// resolvers in `@transitrix/diagrams` own the semantic half.
//
// Two tiers of exports:
//   1. vscode.Uri-based public API (findCanonRoot, loadCanon, isUnderCanon)
//   2. Pure path-string helpers (*Path variants) — used internally and in
//      unit tests (no vscode runtime needed).

/** A raw YAML document loaded from canon/elements/**. */
export interface CanonElement {
  notation: string;
  id: string;
  [key: string]: unknown;
}

/** A raw YAML document loaded from canon/relations/**. */
export interface CanonRelation {
  notation: 'relation';
  id: string;
  type: string;
  from: string;
  to: string;
  [key: string]: unknown;
}

/** Raw docs loaded from a canon/ tree. */
export interface CanonDocs {
  elements: unknown[];
  relations: unknown[];
  warnings: string[];
}

/** Indexed view over a CanonDocs store for efficient lookups. */
export interface CanonIndex {
  /** Elements by id. */
  elementById: Map<string, CanonElement>;
  /** Elements grouped by notation type. */
  elementsByNotation: Map<string, CanonElement[]>;
  /** All typed relations. */
  relations: CanonRelation[];
}

// ── Path-pure helpers (no vscode runtime — directly unit-testable) ─────────

/**
 * Walk up from `filePath` up to 16 ancestor levels looking for a directory
 * literally named `canon`. Returns the absolute path of that directory, or
 * undefined when no such ancestor exists.
 */
export function findCanonRootPath(filePath: string): string | undefined {
  let dir = path.dirname(filePath);
  for (let i = 0; i < 16; i++) {
    if (path.basename(dir) === 'canon') return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Returns true when `savedFilePath` is inside the `elements/`, `relations/`,
 * or `views/activities/` subtrees of `canonRootPath`.
 * The `views/activities/` subtree is the secondary fallback for activity
 * elements (§6.1) — changes there trigger an activity-card re-render too.
 */
export function isUnderCanonPath(canonRootPath: string, savedFilePath: string): boolean {
  const elementsRoot = path.join(canonRootPath, 'elements');
  const relationsRoot = path.join(canonRootPath, 'relations');
  const viewActivitiesRoot = path.join(canonRootPath, 'views', 'activities');
  const savedDir = path.dirname(savedFilePath);
  return (
    savedDir.startsWith(elementsRoot) ||
    savedDir.startsWith(relationsRoot) ||
    savedDir.startsWith(viewActivitiesRoot)
  );
}

// ── vscode.Uri wrappers ────────────────────────────────────────────────────

/**
 * Walk up from `fileUri` to find the nearest ancestor directory named `canon/`.
 */
export function findCanonRoot(fileUri: vscode.Uri): vscode.Uri | undefined {
  const p = findCanonRootPath(fileUri.fsPath);
  return p ? vscode.Uri.file(p) : undefined;
}

/**
 * Returns true when `savedUri` is inside the `elements/` or `relations/`
 * subtrees of `canonRoot`. Use to gate multi-document re-renders: only
 * re-render when the saved file touches the owning canon store.
 */
export function isUnderCanon(canonRoot: vscode.Uri, savedUri: vscode.Uri): boolean {
  return isUnderCanonPath(canonRoot.fsPath, savedUri.fsPath);
}

// ── FS loader ─────────────────────────────────────────────────────────────

/**
 * Extract individual activity objects from an activities VIEW document
 * (`notation: activities`). Each item in the top-level `activities:` array is
 * returned as a synthetic element with `notation: 'activity'` added, so the
 * activity-card resolver's `collectByNotation` can find them.
 * Files that are NOT activities-view documents are returned as-is (they may
 * be standalone `notation: activity` element files placed under views/).
 *
 * Used for the `canon/views/activities/**` secondary fallback (§6.1).
 */
export function extractViewActivities(doc: unknown): unknown[] {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return [doc];
  const d = doc as Record<string, unknown>;
  if (d['notation'] !== 'activities') return [doc]; // standalone element — return as-is
  const arr = d['activities'];
  if (!Array.isArray(arr)) return []; // malformed view — nothing to extract
  return arr.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({ notation: 'activity', ...(item as Record<string, unknown>) }));
}

/** Recursively read + parse every `*.yaml` document under `root` into `out`. */
export async function readYamlDocsUnder(
  root: vscode.Uri,
  out: unknown[],
  warnings: string[],
): Promise<void> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(root);
  } catch {
    return; // missing subtree (e.g. no relations/ yet) is not an error
  }
  for (const [name, type] of entries) {
    const child = vscode.Uri.joinPath(root, name);
    if (type === vscode.FileType.Directory) {
      await readYamlDocsUnder(child, out, warnings);
    } else if (type === vscode.FileType.File && name.endsWith('.yaml')) {
      try {
        const bytes = await vscode.workspace.fs.readFile(child);
        out.push(coerceDatesToIsoStrings(yaml.load(Buffer.from(bytes).toString('utf-8')) as unknown));
      } catch (e) {
        warnings.push(`Skipped ${name}: ${(e as Error).message ?? 'parse error'}`);
      }
    }
  }
}

/**
 * Load the canon element + relation store for the owning canon/ root of `fileUri`.
 * Returns an empty store with a warning when no canon/ root is found.
 */
export async function loadCanon(fileUri: vscode.Uri): Promise<CanonDocs> {
  const elements: unknown[] = [];
  const relations: unknown[] = [];
  const warnings: string[] = [];

  const canonRoot = findCanonRoot(fileUri);
  if (!canonRoot) {
    warnings.push(
      'Could not locate a canon/ root above this file — element and relation references cannot resolve.',
    );
    return { elements, relations, warnings };
  }

  await readYamlDocsUnder(vscode.Uri.joinPath(canonRoot, 'elements'), elements, warnings);
  await readYamlDocsUnder(vscode.Uri.joinPath(canonRoot, 'relations'), relations, warnings);

  // Secondary fallback (§6.1): if the org keeps activities in view files under
  // canon/views/activities/, extract individual activity items and add them to
  // the element pool so the resolver can find them. A warning is emitted for
  // each view-sourced activity found — the canonical home is canon/elements/.
  const viewActivityDocs: unknown[] = [];
  await readYamlDocsUnder(
    vscode.Uri.joinPath(canonRoot, 'views', 'activities'),
    viewActivityDocs,
    warnings,
  );
  for (const doc of viewActivityDocs) {
    const extracted = extractViewActivities(doc);
    for (const act of extracted) {
      elements.push(act);
      const a = act as Record<string, unknown>;
      if (typeof a['id'] === 'string') {
        warnings.push(
          `Activity "${a['id']}" resolved via canon/views/activities/ (secondary fallback) — ` +
          `move the element to canon/elements/ for canonical storage.`,
        );
      }
    }
  }

  if (elements.length === 0) {
    warnings.push('No element documents found under canon/elements — element references cannot resolve.');
  }
  return { elements, relations, warnings };
}

// ── Index & lookup helpers ─────────────────────────────────────────────────

function isElement(doc: unknown): doc is CanonElement {
  if (doc === null || typeof doc !== 'object') return false;
  const r = doc as Record<string, unknown>;
  return typeof r['notation'] === 'string' && r['notation'] !== 'relation' && typeof r['id'] === 'string';
}

function isRelation(doc: unknown): doc is CanonRelation {
  if (doc === null || typeof doc !== 'object') return false;
  const r = doc as Record<string, unknown>;
  return (
    r['notation'] === 'relation' &&
    typeof r['id'] === 'string' &&
    typeof r['type'] === 'string' &&
    typeof r['from'] === 'string' &&
    typeof r['to'] === 'string'
  );
}

/**
 * Build a lookup index over a loaded CanonDocs store.
 * Malformed documents are silently skipped — callers should check `docs.warnings`.
 */
export function buildCanonIndex(docs: CanonDocs): CanonIndex {
  const elementById = new Map<string, CanonElement>();
  const elementsByNotation = new Map<string, CanonElement[]>();
  const relations: CanonRelation[] = [];

  for (const doc of docs.elements) {
    if (!isElement(doc)) continue;
    elementById.set(doc.id, doc);
    const bucket = elementsByNotation.get(doc.notation) ?? [];
    bucket.push(doc);
    elementsByNotation.set(doc.notation, bucket);
  }
  for (const doc of docs.relations) {
    if (!isRelation(doc)) continue;
    relations.push(doc);
  }

  return { elementById, elementsByNotation, relations };
}

/** All relations of a given type (e.g. `'activity_goal'`). */
export function relationsOfType(index: CanonIndex, type: string): CanonRelation[] {
  return index.relations.filter(r => r.type === type);
}

/** All relations where `from === sourceId`. */
export function relationsFrom(index: CanonIndex, sourceId: string): CanonRelation[] {
  return index.relations.filter(r => r.from === sourceId);
}

/** All relations where `to === targetId`. */
export function relationsTo(index: CanonIndex, targetId: string): CanonRelation[] {
  return index.relations.filter(r => r.to === targetId);
}
