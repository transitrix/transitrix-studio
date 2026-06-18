---
adr: "0003"
status: Accepted
date: 2026-06-18
scope: transitrix-studio
tags: [diagrams, schema-version, methodology-version, ci-guard, sv-1]
---

# ADR 0003 — `@transitrix/diagrams` schema-version contract (SV-1)

## Context

`@transitrix/diagrams` (`packages/diagrams/`) is a shared rendering and
validation library used by the VS Code extension, the IntelliJ plugin, and
future consumers. Its validation rules, layout logic, and element schemas track
the **methodology release** they implement (the methodology's canonical
`methodology_version`).

After `@transitrix/diagrams@1.0.0` was published to npm (2026-06-13), a
contract is needed so no consumer can silently drift past the methodology
version the installed build conforms to.

## Decisions

### 1. Export `SCHEMA_VERSION` from the library

A named constant `SCHEMA_VERSION` is exported from
`packages/diagrams/src/schema-version.ts` and re-exported via the package
entry point (`src/index.ts`).

The value is the methodology release string this library build conforms to
(e.g. `'0.5.0'`). It is updated here — never inferred or derived at runtime —
every time the library is updated to track a new methodology release.

### 2. Declare `transitrix.methodologyVersion` in the root `package.json`

The Studio project root `package.json` carries a `transitrix` metadata object:

```json
"transitrix": {
  "methodologyVersion": "0.5.0"
}
```

This is the project-level manifest pin. It gives tooling, scripts, and humans a
single place to inspect which methodology release the whole Studio build targets
without importing the library.

### 3. Unit test keeps the two in lockstep (SV-1 PR1)

`tests/schema-version.test.ts` (covered by `npm test`) asserts:

- `package.json` declares `transitrix.methodologyVersion` as a string.
- `SCHEMA_VERSION === transitrix.methodologyVersion`.
- Both match the semver pattern `\d+\.\d+\.\d+`.

This makes a silent drift a test failure, not a silent divergence.

### 4. CI guard against methodology SoT is a separate step (SV-1 PR2)

A second CI step — asserting both values equal the methodology's published
`MANIFEST.md` `methodology_version` — is tracked separately. It requires
fetching the methodology repo's canonical version at build time, which has
different CI implications and is intentionally not bundled here.

### 5. DSM contract is SV-2 (separate ADR in the DSM repo)

The DSM repository will carry its own CI guard asserting that its pinned
`@transitrix/diagrams` version matches a declared supported methodology range.
That guard cross-references this ADR. It lands with the DSM agent, not here.

## Consequences

- `SCHEMA_VERSION` is a public API surface of `@transitrix/diagrams`; any
  semver change to the methodology version it implements is a version bump of
  the library too.
- Studio's CI fails if the constant and the manifest pin diverge — manual bumps
  stay in sync or the build breaks immediately.
- Consumers that import `SCHEMA_VERSION` can assert compatibility at startup or
  in their own CI without parsing the library's source.
