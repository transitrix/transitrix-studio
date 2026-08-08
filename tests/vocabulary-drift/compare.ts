// Vocabulary drift — the comparison itself.
//
// Pure: it takes an artefact, this repo's declared surface, and the declared
// methodology version, and returns every divergence between them. No file
// access, so the fixtures drive it directly.
//
// Four kinds of divergence, each with a stable key the allowlist is written
// against:
//
//   missing           a value the artefact defines that this repo's constant
//                     does not carry
//   extra             a value this repo's constant carries that the artefact
//                     does not define
//   unbound           a closed set in the artefact that no runtime constant in
//                     this repo expresses at all — the widest kind of drift,
//                     and the one a member-by-member diff cannot see
//   version-mismatch  `transitrix.methodologyVersion` does not name the
//                     vendored artefact's version
//
// A divergence is reported, never repaired. Migration is per-module and happens
// when a module is next touched for other reasons; this check only makes the gap
// visible and keeps it from widening unnoticed.

import type { VocabularyArtefact } from './artefact.js';

/**
 * One closed set of the artefact, and where (if anywhere) this repo holds it.
 *
 * `values: null` is the honest declaration that no runtime constant carries the
 * set — not an omission. Every artefact vocabulary must appear in the surface,
 * bound or not, so a newly published one cannot pass unnoticed.
 */
export interface SurfaceBinding {
  /** Artefact vocabulary key: `element_types`, `relation_types`, `rule_codes`,
   *  or `value_vocabularies.<owner>.<field>`. */
  key: string;
  /** The values this repo's constant carries, or `null` when none does. */
  values: readonly string[] | null;
  /** Where the values live (or, when unbound, why nothing does). */
  origin: string;
}

export interface RepoSurface {
  declaredMethodologyVersion: string;
  bindings: readonly SurfaceBinding[];
}

export type Divergence =
  | { kind: 'missing'; vocabulary: string; value: string; origin: string }
  | { kind: 'extra'; vocabulary: string; value: string; origin: string }
  | { kind: 'unbound'; vocabulary: string; size: number; origin: string }
  | { kind: 'version-mismatch'; declared: string; vendored: string };

/** Stable identity of a divergence — what an allowlist entry is written against. */
export function divergenceKey(d: Divergence): string {
  switch (d.kind) {
    case 'missing':
    case 'extra':
      return `${d.vocabulary}:${d.kind}:${d.value}`;
    case 'unbound':
      return `${d.vocabulary}:unbound`;
    case 'version-mismatch':
      return 'methodology_version:mismatch';
  }
}

/** One line, readable in a CI log without the surrounding context. */
export function describeDivergence(d: Divergence): string {
  switch (d.kind) {
    case 'missing':
      return `${d.vocabulary}: artefact defines \`${d.value}\`, ${d.origin} does not carry it`;
    case 'extra':
      return `${d.vocabulary}: ${d.origin} carries \`${d.value}\`, the artefact does not define it`;
    case 'unbound':
      return `${d.vocabulary}: ${d.size} value(s) in the artefact, no constant in this repo expresses the set (${d.origin})`;
    case 'version-mismatch':
      return `methodology_version: package.json declares ${d.declared}, the vendored artefact is ${d.vendored}`;
  }
}

/** Every closed set the artefact carries, keyed as the surface keys them. */
function artefactVocabularies(a: VocabularyArtefact): Map<string, string[]> {
  const out = new Map<string, string[]>();
  // Retired names stay part of the surface: a consumer must still recognise one
  // to warn on it, so dropping it is drift in the same way adding a live TYPE is.
  out.set('element_types', [...a.elementTypes, ...a.deprecatedElementTypes]);
  out.set('relation_types', [...a.relationTypes, ...a.deprecatedRelationTypes]);
  out.set('rule_codes', [...a.ruleCodes]);
  for (const [key, values] of a.valueVocabularies) out.set(`value_vocabularies.${key}`, values);
  return out;
}

export function compareVocabulary(artefact: VocabularyArtefact, surface: RepoSurface): Divergence[] {
  const expected = artefactVocabularies(artefact);
  const bound = new Map(surface.bindings.map((b) => [b.key, b]));

  const unknown = surface.bindings.filter((b) => !expected.has(b.key));
  if (unknown.length > 0) {
    // Not drift — a broken surface. A binding for a set the artefact no longer
    // has would otherwise sit there comparing against nothing and always pass.
    throw new Error(
      `repo surface binds vocabularies the artefact does not define: ${unknown.map((b) => b.key).join(', ')}`,
    );
  }
  const unbindable = [...expected.keys()].filter((k) => !bound.has(k));
  if (unbindable.length > 0) {
    throw new Error(
      `repo surface does not account for artefact vocabularies: ${unbindable.join(', ')}. ` +
        `Add a binding (or an explicitly unbound one) in tests/vocabulary-drift/surface.ts.`,
    );
  }

  const divergences: Divergence[] = [];

  if (surface.declaredMethodologyVersion !== artefact.methodologyVersion) {
    divergences.push({
      kind: 'version-mismatch',
      declared: surface.declaredMethodologyVersion,
      vendored: artefact.methodologyVersion,
    });
  }

  for (const [key, artefactValues] of expected) {
    const binding = bound.get(key)!;
    if (binding.values === null) {
      divergences.push({ kind: 'unbound', vocabulary: key, size: artefactValues.length, origin: binding.origin });
      continue;
    }
    const repoValues = new Set(binding.values);
    for (const value of artefactValues) {
      if (!repoValues.has(value)) {
        divergences.push({ kind: 'missing', vocabulary: key, value, origin: binding.origin });
      }
    }
    const artefactSet = new Set(artefactValues);
    for (const value of binding.values) {
      if (!artefactSet.has(value)) {
        divergences.push({ kind: 'extra', vocabulary: key, value, origin: binding.origin });
      }
    }
  }

  return divergences;
}
