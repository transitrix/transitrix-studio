// `transitrix impact` — names which derived views a *staged* canon/elements/**
// change makes stale (transitrix-hq#89, "a change to the model names what it
// just made untrue"). First slice: the three canon-projection view notations
// with a static resolver (goals, dgca/fgca, action) checked against the
// staged (git index) content of canon/elements/**. Everything else under
// canon/views/** — inline-form views, blocks, applications, capability-map,
// compliance-impact, coverage-metric, bpmn/process-blueprint — is reported as
// "coverage not determined", never silently treated as unaffected (the
// epic's acceptance requirement 6). Document (`.ttrs`) coverage is a
// separate, later slice: the Pass 1 resolver it needs is not yet merged to
// `main` (transitrix-hq#57).

import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { coerceDatesToIsoStrings } from '@transitrix/diagrams/yaml-normalize.js';
import { resolveGoals, isGoalsViewDoc } from '@transitrix/diagrams/goals/resolver.js';
import { resolveFGCA, isFGCAViewDoc } from '@transitrix/diagrams/fgca';
import { resolveAction, isActionViewDoc } from '@transitrix/diagrams/activities';
import { loadRepoModel, loadViewDocs } from './repo-validate.js';
import { loadNotationYaml, notationOf } from './validate-notation.js';

export interface ImpactFinding {
  file: string;
  notation: string;
}

export interface ImpactResult {
  /** Staged canon/elements/** ids (added, modified or deleted) this run checked against. */
  changedIds: string[];
  /** Views a resolver could check, and that read at least one changed id. */
  affected: ImpactFinding[];
  /** Views under canon/views/** whose derivation this cannot yet resolve —
   *  reported explicitly rather than assumed unaffected. */
  notDetermined: ImpactFinding[];
}

function isYamlPath(p: string): boolean {
  return /\.ya?ml$/i.test(p);
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
    if (notation === 'goals' && isGoalsViewDoc(data)) {
      resolvedIds = idsIn(resolveGoals(data, { elements }), 'goals');
    } else if ((notation === 'dgca' || notation === 'fgca') && isFGCAViewDoc(data)) {
      resolvedIds = idsIn(
        resolveFGCA(data, { elements, relations }),
        'factors',
        'goals',
        'changes',
        'actions',
      );
    } else if (notation === 'action' && isActionViewDoc(data)) {
      resolvedIds = idsIn(resolveAction(data, { elements, relations }), 'actions');
    }

    if (!resolvedIds) {
      notDetermined.push({ file: doc.path, notation });
      continue;
    }
    if ([...changedIds].some((id) => resolvedIds!.has(id))) {
      affected.push({ file: doc.path, notation });
    }
  }

  return { changedIds: [...changedIds], affected, notDetermined };
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
