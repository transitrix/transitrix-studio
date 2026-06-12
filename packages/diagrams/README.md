# @transitrix/diagrams

Shared rendering, validation, and pure mutations for Transitrix custom diagram
formats (BPMN, Goals, FGCA, Capability Map, Process Blueprint, and the rest of
the Transitrix notation family).

This package is the runtime library used by the **Transitrix Studio** VS Code
extension, the `@transitrix/cli`, and downstream tools that need to read,
validate, or render Transitrix diagrams.

## Install

```bash
npm install @transitrix/diagrams
```

`react` and `reactflow` are declared as peer dependencies — install them in the
host application if you use the React renderers; pure validation / mutation
APIs do not require them.

## What's inside

The package re-exports the per-notation modules under one entry point:

- Activities, Activity Card, Applications, Assertion, Blocks, Capability Map,
  Compliance + Compliance Matrix, Confidence, FGCA, Goals, Process Blueprint,
  Process Map, Products, Requirement, Scenarios.
- Shared primitives: `geometry`, `typed-id`, `validation-types`,
  `yaml-normalize`, `SCHEMA_VERSION`, theme tokens, repository-level validators.

See the source layout under [`src/`](./src) and the per-module `index.ts`
exports for the public surface.

## Versioning

`@transitrix/diagrams` ships on its own version line, independent of the
Transitrix Studio extension version. The first published release is `1.0.0`.

## License

MIT — see [`LICENSE`](./LICENSE).

## Links

- Monorepo: <https://github.com/transitrix/transitrix-studio>
- Issues: <https://github.com/transitrix/transitrix-studio/issues>
- Methodology spec: <https://github.com/transitrix/methodology>
