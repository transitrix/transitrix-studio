# Changelog fragments

A PR that wants a `CHANGELOG.md` entry adds one file here instead of editing
`CHANGELOG.md`'s `## Unreleased` section directly. Two PRs that each add
their own fragment file never collide, even opened from the same base
commit and touching unrelated code — the old failure mode, where every PR
edited the same lines at the head of the same file.

## Adding one

```bash
node scripts/new-changelog-fragment.mjs <section> <slug>
# e.g.
node scripts/new-changelog-fragment.mjs Added wire-node-validator
```

This writes `changelog/fragments/<slug>-<random-suffix>.md` with a template
to fill in. `<section>` is one of `Added`, `Changed`, `Fixed`, `Removed`,
`Deprecated`, `Security`, `Packages` — the same sections `CHANGELOG.md`
already uses.

A fragment file's content is exactly the block that would otherwise have
been hand-inserted:

```markdown
### Added

- **Short bold title.** The rest of the entry, same voice and detail level
  as any existing `CHANGELOG.md` entry.
```

Multiple bullets under one header are fine if the change genuinely has more
than one line-item.

## What happens to it

Fragments are **not** meant to be assembled into `CHANGELOG.md` by every
PR. They accumulate here across PRs and are folded in as a release-prep
step (`node scripts/assemble-changelog.mjs`, see
`docs/internal/release-runbook.md`), which appends each fragment's bullets
under the matching `### <Section>` heading in `## Unreleased` — creating
the heading if it doesn't exist yet — and deletes the fragment files it
consumed. Sections are ordered the same way `CHANGELOG.md` already orders
them; already-released version sections are never touched.

Do not hand-edit `CHANGELOG.md`'s `## Unreleased` section in a regular PR —
add a fragment instead.
