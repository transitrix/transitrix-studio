// Pure logic for the release-time version guards.
//
// Two invariants have to hold at the moment a release publishes to npm:
//
//   (a) @transitrix/diagrams must not ship under a version that doesn't carry
//       the changes made to packages/diagrams/src since the previous release.
//   (b) @transitrix/cli must move whenever @transitrix/diagrams moves —
//       scripts/build-cli-package.mjs bundles the diagrams *source* into cli's
//       published dist/ at prepack, and npm-publish.yml skips republishing a
//       version already on the registry, so a cli whose version stayed put
//       ships a stale bundled copy.
//
// Both are properties of a *release span* (previous release → this release),
// not of a single pull request, so they are evaluated here rather than on a
// per-PR diff. A PR consequently never has to touch either version field, and
// two PRs to packages/diagrams/src can no longer collide on one.

const SEMVER_TAG_RE = /^v(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

// packages/diagrams/src changes that make a diagrams version stale. Tests are
// excluded: they ship with neither package, so they cannot go stale on npm.
export function selectDiagramsSrcChanges(changedFiles) {
  return changedFiles.filter((file) => {
    if (!file.startsWith('packages/diagrams/src/')) return false;
    if (file.includes('/__tests__/')) return false;
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) return false;
    return true;
  });
}

// Newest release tag strictly older than `currentTag`, out of the tags
// reachable from the release commit. `tags` is accepted unordered; ordering is
// by semver precedence, not by tag-listing or creation order, so an
// out-of-band tag (a backport tagged after a later release) cannot be mistaken
// for the previous release.
export function pickPreviousReleaseTag(tags, currentTag) {
  const parsed = tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => tag !== currentTag)
    .map((tag) => ({ tag, parts: tag.match(SEMVER_TAG_RE) }))
    .filter(({ parts }) => parts !== null)
    .map(({ tag, parts }) => ({ tag, key: [Number(parts[1]), Number(parts[2]), Number(parts[3])] }));

  if (parsed.length === 0) return null;

  parsed.sort((a, b) => b.key[0] - a.key[0] || b.key[1] - a.key[1] || b.key[2] - a.key[2]);
  return parsed[0].tag;
}

// Returns the failures this release span carries, each naming the package it
// is about. An empty array means the release may publish.
export function evaluateReleaseVersions({
  diagramsSrcChanges,
  previousDiagramsVersion,
  releaseDiagramsVersion,
  previousCliVersion,
  releaseCliVersion,
}) {
  const failures = [];
  const diagramsMoved = previousDiagramsVersion !== releaseDiagramsVersion;

  if (diagramsSrcChanges.length > 0 && !diagramsMoved) {
    failures.push({
      package: '@transitrix/diagrams',
      message:
        `@transitrix/diagrams is releasing as ${releaseDiagramsVersion}, unchanged since the previous ` +
        `release, but ${diagramsSrcChanges.length} non-test file(s) under packages/diagrams/src changed ` +
        'in this span. Publishing would put that change on the registry under a version that does not ' +
        'carry it. Bump packages/diagrams/package.json.',
      details: diagramsSrcChanges,
    });
  }

  if (diagramsMoved && previousCliVersion === releaseCliVersion) {
    failures.push({
      package: '@transitrix/cli',
      message:
        `@transitrix/diagrams moved ${previousDiagramsVersion} → ${releaseDiagramsVersion} but ` +
        `@transitrix/cli is still ${releaseCliVersion}. @transitrix/cli bundles the @transitrix/diagrams ` +
        'source at prepack, and the publish step skips a version already on the registry — the diagrams ' +
        'change would never reach the published CLI. Bump packages/cli/package.json.',
      details: [],
    });
  }

  return failures;
}
