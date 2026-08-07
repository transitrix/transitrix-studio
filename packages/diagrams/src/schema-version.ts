/**
 * SCHEMA_VERSION — the methodology release whose notation schemas and validation
 * rules this `@transitrix/diagrams` build conforms to (SV-1).
 *
 * Source of truth: the methodology `methodology_version`, declared in an adopter
 * repository's `transitrix.yaml` per the methodology `notations/MANIFEST.md`
 * (single source of truth for a repo's conformance).
 *
 * This is the release this build *targets*, not the newest release that exists —
 * the methodology may be ahead. Raise it only together with the vocabulary and
 * rule coverage that release requires, so the two never disagree. Individual
 * hardcoded vocabulary literals may still lag the declared release; the
 * per-module drift check is what makes such a gap visible, not this constant.
 *
 * This constant is kept in lockstep with the project manifest's
 * `transitrix.methodologyVersion` (`package.json`); the
 * `tests/schema-version.test.ts` unit test asserts the two are equal.
 */
export const SCHEMA_VERSION = '3.1.0';
