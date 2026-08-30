// `transitrix impact` — names which derived views a *staged* canon/elements/**
// change makes stale (transitrix-hq#89, "a change to the model names what it
// just made untrue"). First slice: the three canon-projection view notations
// with a static resolver (goals, dgca/fgca, action) checked against the
// staged (git index) content of canon/elements/**. Everything else under
// views/** (normative layout) or canon/views/** (legacy, supported for transition)
// — inline-form views, blocks, applications, capability-map,
// compliance-impact, coverage-metric, bpmn/process-blueprint — is reported as
// "coverage not determined", never silently treated as unaffected (the
// epic's acceptance requirement 6).
//
// Second slice: document (`.ttrs`) coverage, unblocked now that
// @transitrix/document-renderer is vendored on `main` (originally for the
// `.ttrs` preview, extension/src/ttrs-preview.ts). This reads a document's
// model-object references (`{{ ID }}` / `{{ ID.field }}` / an instruction
// slot's `inputs:` list) directly off the parse AST rather than running Pass
// 1's full resolution — Pass 1 needs a `renderDate` and a resolvable
// repository index to classify a reference as ok/unresolved/etc., none of
// which this check has any use for: it only wants *which ids a document
// cites*, not whether they currently resolve. A document whose AST contains
// `each`/`trace`/a row `.field` (parsed as `unimplemented` — this pass does
// not know which ids such a construct would touch) is reported as
// coverage-not-determined, same honesty rule as an unresolvable view.

import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { coerceDatesToIsoStrings } from '@transitrix/diagrams/yaml-normalize.js';
import { resolveGoals, isGoalsViewDoc } from '@transitrix/diagrams/goals/resolver.js';
import { resolveFGCA, isFGCAViewDoc } from '@transitrix/diagrams/fgca';
import { resolveAction, isActionViewDoc } from '@transitrix/diagrams/activities';
import { loadRepoModel, loadViewDocs, loadDocumentSources } from './repo-validate.js';
import { loadNotationYaml, notationOf } from './validate-notation.js';
import { DOCUMENT_SOURCE_EXTENSION } from './validate-document-source.js';
import { renderDocumentToDisk } from './render-document.js';
// Vendored from methodology — see scripts/vendor-methodology-document-renderer.mjs
// and tests/document-renderer-vendor.test.ts for the integrity check that
// keeps this import target trustworthy. Only the syntax half (parseRecipe)
// is needed here; this check never resolves a reference against a repository.
import {
  parseRecipe,
  type RecipeNode,
  type RecipeReferenceNode,
  type RecipeInstructNode,
} from '../vendor/methodology/document-renderer/parse-recipe.mjs';

export interface ImpactFinding {
  file: string;
  notation: string;
}

export interface ImpactResult {
  /** Staged canon/elements/** ids (added, modified or deleted) this run checked against. */
  changedIds: string[];
  /** Views a resolver could check, and that read at least one changed id. */
  affected: ImpactFinding[];
  /** Views under views/** (normative layout) whose derivation this cannot yet resolve —
   *  reported explicitly rather than assumed unaffected. */
  notDetermined: ImpactFinding[];
}

function isYamlPath(p: string): boolean {
  return /\.ya?ml$/i.test(p);
}

/** True when `data` is a plain object carrying `key` at the top level —
 *  used to recognize a goals/dgca/fgca/action view's *inline* form (element
 *  data authored directly in the file, mutually exclusive with
 *  `view_config` per each notation's spec). An inline-form document has no
 *  `canon/elements/**` dependency by definition — it stays inline until a
 *  second document shares it, at which point promotion moves it to
 *  `view_config` — so it is definitively unaffected by any staged element
 *  change, not merely undetermined. */
function hasKey(data: unknown, key: string): boolean {
  return typeof data === 'object' && data !== null && !Array.isArray(data) && key in (data as Record<string, unknown>);
}

/** The staged (index) content of `relPath`, or `undefined` when it has none
 *  (deleted in the index, or nothing staged). */
function gitShowStaged(root: string, relPath: string): string | undefined {
  try {
    return execFileSync('git', ['show', `:${relPath}`], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}

/** The `HEAD` content of `relPath` — used for a path staged as deleted, since
 *  its id has to come from what is being removed, not from the (empty) index. */
function gitShowHead(root: string, relPath: string): string | undefined {
  try {
    return execFileSync('git', ['show', `HEAD:${relPath}`], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}

function elementIdOf(text: string | undefined): string | undefined {
  if (!text) return undefined;
  try {
    const data = coerceDatesToIsoStrings(yaml.load(text));
    const id = data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)['id']
      : undefined;
    return typeof id === 'string' && id ? id : undefined;
  } catch {
    return undefined;
  }
}

/** Ids of every `canon/elements/**` file staged for commit — additions,
 *  modifications and deletions alike, since a removed element can make a
 *  view stale exactly as a changed one can. Reads the staged (index) blob for
 *  a live path and the `HEAD` blob for a path staged as deleted, never the
 *  working tree, so the check reflects what is actually about to be
 *  committed. Returns an empty set for anything that isn't a git repository
 *  (or has no staged changes) — the caller treats that the same as "nothing
 *  staged", not as an error. */
export function stagedCanonElementIds(root: string): Set<string> {
  let out: string;
  try {
    out = execFileSync(
      'git',
      ['diff', '--cached', '--name-status', '--diff-filter=ACMRD', '--', 'canon/elements'],
      { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    return new Set();
  }

  const ids = new Set<string>();
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const fields = trimmed.split('\t');
    const status = fields[0];
    // A rename reports as `R100\told\tnew` — the new path is what changed.
    const file = fields[fields.length - 1];
    if (!file || !isYamlPath(file)) continue;
    const text = status.startsWith('D') ? gitShowHead(root, file) : gitShowStaged(root, file);
    const id = elementIdOf(text);
    if (id) ids.add(id);
  }
  return ids;
}

/** Every element id a resolved canon-projection view actually reads, across
 *  the given top-level array fields of the resolver's output. */
function idsIn(resolved: Record<string, unknown>, ...fields: string[]): Set<string> {
  const ids = new Set<string>();
  for (const field of fields) {
    const arr = resolved[field];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const id = (item as Record<string, unknown>)['id'];
        if (typeof id === 'string' && id) ids.add(id);
      }
    }
  }
  return ids;
}

/** Which `canon/views/**` documents a staged `canon/elements/**` change makes
 *  stale. Silent (all three arrays empty) when nothing is staged under
 *  `canon/elements` — there is nothing yet to have made untrue. */
export function computeStagedImpact(root: string): ImpactResult {
  const changedIds = stagedCanonElementIds(root);
  const affected: ImpactFinding[] = [];
  const notDetermined: ImpactFinding[] = [];

  if (changedIds.size === 0) {
    return { changedIds: [], affected, notDetermined };
  }

  const model = loadRepoModel(root);
  const elements = model.elements.map((d) => d.data).filter((d): d is Record<string, unknown> => d != null);
  const relations = model.relations.map((d) => d.data).filter((d): d is Record<string, unknown> => d != null);

  for (const doc of loadViewDocs(root)) {
    let data: unknown;
    try {
      data = loadNotationYaml(doc.text);
    } catch {
      continue; // a YAML/structural error is `validate`'s concern, not impact's
    }
    const notation = notationOf(data);
    if (!notation) continue;

    let resolvedIds: Set<string> | undefined;
    let inlineForm = false;
    if (notation === 'goals') {
      if (isGoalsViewDoc(data)) {
        resolvedIds = idsIn(resolveGoals(data, { elements }), 'goals');
      } else {
        inlineForm = hasKey(data, 'goals');
      }
    } else if (notation === 'dgca' || notation === 'fgca') {
      if (isFGCAViewDoc(data)) {
        resolvedIds = idsIn(
          resolveFGCA(data, { elements, relations }),
          'factors',
          'goals',
          'changes',
          'actions',
        );
      } else {
        inlineForm = hasKey(data, 'factors') || hasKey(data, 'goals');
      }
    } else if (notation === 'action') {
      if (isActionViewDoc(data)) {
        resolvedIds = idsIn(resolveAction(data, { elements, relations }), 'actions');
      } else {
        inlineForm = hasKey(data, 'actions');
      }
    }

    if (inlineForm) continue; // self-contained by notation design — never affected, not merely undetermined

    if (!resolvedIds) {
      notDetermined.push({ file: doc.path, notation });
      continue;
    }
    if ([...changedIds].some((id) => resolvedIds!.has(id))) {
      affected.push({ file: doc.path, notation });
    }
  }

  for (const doc of loadDocumentSources(root)) {
    // The `.trs` near-miss is never a parseable document — `validate` already
    // names it as a naming defect; it has nothing for this check to read.
    if (!doc.path.toLowerCase().endsWith(DOCUMENT_SOURCE_EXTENSION)) continue;

    const { ids: referencedIds, determined } = documentReferencedIds(doc.text);
    if (!determined) {
      notDetermined.push({ file: doc.path, notation: 'documents' });
      continue;
    }
    if ([...changedIds].some((id) => referencedIds.has(id))) {
      affected.push({ file: doc.path, notation: 'documents' });
    }
  }

  return { changedIds: [...changedIds], affected, notDetermined };
}

/** The model-object ids a `.ttrs` document's parsed AST cites directly —
 *  inline references (`{{ ID }}` / `{{ ID.field }}`) and an instruction
 *  slot's own `inputs:` list — and whether that is the *whole* story.
 *  `determined` is false when the AST holds an `each`/`trace`/row-`.field`
 *  node (parsed as `unimplemented`) — this check does not know which ids such
 *  a construct would touch, so it cannot claim the document unaffected on the
 *  strength of the plain references alone (epic acceptance requirement 6). A
 *  parse error carries no reference information either — same fallback. */
function isReferenceNode(node: RecipeNode): node is RecipeReferenceNode {
  return node.type === 'reference';
}

function isInstructNode(node: RecipeNode): node is RecipeInstructNode {
  return node.type === 'instruct';
}

function documentReferencedIds(text: string): { ids: Set<string>; determined: boolean } {
  const ids = new Set<string>();
  let parsed: ReturnType<typeof parseRecipe>;
  try {
    parsed = parseRecipe(text);
  } catch {
    return { ids, determined: false };
  }
  let determined = true;
  for (const node of parsed.ast) {
    if (isReferenceNode(node)) {
      ids.add(node.id);
    } else if (isInstructNode(node)) {
      for (const input of node.inputs) ids.add(input);
    } else if (node.type === 'unimplemented') {
      determined = false;
    }
  }
  return { ids, determined };
}

/** Print the result (human or JSON). Human output is silent — no lines at
 *  all — when nothing is staged, or when everything staged resolves cleanly
 *  to no affected and no undetermined view (epic acceptance requirement 5).
 *  JSON output is unconditional: a script caller needs the empty case to be
 *  distinguishable from a run that never happened. */
export function reportImpact(result: ImpactResult, useJson: boolean): void {
  if (useJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.affected.length === 0 && result.notDetermined.length === 0) {
    return;
  }
  if (result.affected.length > 0) {
    console.log('Staged change affects:');
    for (const a of result.affected) {
      console.log(`  • ${a.file} [${a.notation}]`);
    }
    console.log();
  }
  if (result.notDetermined.length > 0) {
    console.log('Coverage not determined — derivation not yet resolvable, not claimed unaffected:');
    for (const n of result.notDetermined) {
      console.log(`  • ${n.file} [${n.notation}]`);
    }
    console.log();
  }
}

/** For each `documents` (`.ttrs`) artefact in `result.affected`, asks
 *  `confirm` whether to regenerate it and, on acceptance, runs the same
 *  render path `transitrix render` uses (transitrix-hq#186) — output is
 *  identical to invoking that command directly on the same document
 *  (transitrix-hq#182 acceptance criterion 3). `goals`/`dgca`/`fgca`/`action`
 *  view findings are skipped: no headless-rendering path exists for them
 *  (transitrix-hq#182's narrowed scope), so they get the notice `reportImpact`
 *  already prints and nothing more. Declining writes nothing — `confirm`
 *  returning `false` is a no-op, so the identical offer reappears on the next
 *  run against the same staged change (acceptance criterion 4). Never called
 *  for `--json` mode or for a `notDetermined` finding — both are the caller's
 *  responsibility to keep out of `result.affected` before this runs. */
export async function offerDocumentRegeneration(
  result: ImpactResult,
  root: string,
  confirm: (file: string) => Promise<boolean>,
): Promise<void> {
  for (const finding of result.affected) {
    if (finding.notation !== 'documents') continue;
    const accept = await confirm(finding.file);
    if (!accept) continue;

    const renderResult = await renderDocumentToDisk({ path: path.join(root, finding.file), root });
    if (renderResult.ok) {
      console.log(`  ✓ regenerated ${finding.file} → ${renderResult.markdownPath}, ${renderResult.pdfPath}, ${renderResult.runRecordPath}`);
    } else {
      console.error(`  ✗ ${finding.file}`);
      for (const e of renderResult.errors) {
        console.error(`    ${e.code}: ${e.message}`);
      }
    }
  }
}
