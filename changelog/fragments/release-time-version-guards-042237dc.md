### Changed

- **Package version bumps are checked at release time, not on every PR.** A PR
  touching `packages/diagrams/src` no longer has to bump
  `packages/diagrams/package.json` or `packages/cli/package.json`, so two such
  PRs opened from the same base commit no longer collide on those version
  fields. `npm-publish.yml` now gates both publish steps on a `version-guards`
  job (`scripts/check-release-versions.mjs`) that compares the release against
  the previous `v*` tag and fails it, naming the package, when
  `@transitrix/diagrams` would ship under a version that doesn't carry its
  source changes, or when `@transitrix/diagrams` moved and `@transitrix/cli`
  did not.
