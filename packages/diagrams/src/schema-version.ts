/**
 * SCHEMA_VERSION — the methodology release whose notation schemas and validation
 * rules this `@transitrix/diagrams` build conforms to (SV-1).
 *
 * Source of truth: the methodology `methodology_version`, declared in an adopter
 * repository's `transitrix.yaml` per the methodology `notations/MANIFEST.md`
 * (single source of truth for a repo's conformance). The current methodology
 * release is **0.5.0**.
 *
 * This constant is kept in lockstep with the project manifest's
 * `transitrix.methodologyVersion` (`package.json`); the
 * `tests/schema-version.test.ts` unit test asserts the two are equal. A CI guard
 * that additionally asserts both equal the methodology's published SoT lands
 * separately (SV-1 PR2) — do not bundle it here.
 */
export const SCHEMA_VERSION = '0.5.0';
