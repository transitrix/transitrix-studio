# Transitrix Studio

Preview **self-contained** Transitrix diagram YAML as SVG inside Obsidian Desktop notes (Reading view).

The plugin reuses the Studio parser, validator, and SVG renderer. It does not walk the vault, call network APIs, or rewrite notes.

## Requirements

- Obsidian Desktop 1.0.0 or newer (`isDesktopOnly`)
- Restricted mode off so community plugins can load

## Supported fences

| Language | Diagram |
| --- | --- |
| `transitrix-goals` | Goals tree |
| `transitrix-dgca` | DGCA chain |
| `transitrix-dga` | DGA chain |
| `transitrix-action` | Action network (PSND) |
| `transitrix-action-card` | Action Card (shell + milestones) |
| `transitrix-blocks` | Nested blocks or grid (for example RACI) |
| `transitrix-process-blueprint` | Process Blueprint |

Example:

````markdown
```transitrix-goals
notation: goals
spec_version: "0.1"
id: GOALS-SERVICE-1
name: Reliable service
goal_types:
  - { name: Strategy, level: 0 }
goals:
  - { id: GOAL-SERVICE-1, name: Deliver reliable service, type: Strategy, level: 0 }
```
````

Open the note in **Reading view** to see the SVG. Live Preview is not supported yet.

Repository projections (`view_config`-only documents or `sources`) are rejected. Put a self-contained document in the fence.

## Settings

**Settings → Transitrix Studio**

| Setting | Effect |
| --- | --- |
| Theme | Transitrix light / dark, or follow Obsidian |
| Node size | compact / normal / wide |
| Edge style | straight / bezier / polyline (Goals, DGCA, DGA) |
| Edge curvature | 0–3 (Goals, DGCA/DGA, Action) |

Action Card uses Theme only. Changing settings refreshes open Reading-view diagrams.

## Install

### From the community catalog

Once listed in the Obsidian community catalog, install **Transitrix Studio** from
Settings → Community plugins. The public distribution repository is
[transitrix/transitrix-studio-obsidian](https://github.com/transitrix/transitrix-studio-obsidian).

### Manual install (until the plugin is in the catalog)

Obsidian Desktop only.

1. Open the [latest release](https://github.com/transitrix/transitrix-studio-obsidian/releases/latest)
   and download the three files listed under **Assets**: `main.js`,
   `manifest.json` and `styles.css`. Do not use "Source code (zip)" — it does not
   contain `main.js`.
2. In your vault, create the folder `.obsidian/plugins/transitrix-studio/`. The
   folder name must be exactly `transitrix-studio`. `.obsidian` is hidden in most
   file managers; show hidden files or create the folder from a terminal.
3. Copy the three downloaded files into that folder.
4. In Obsidian open Settings → Community plugins, turn **Restricted mode** off,
   click the refresh icon next to "Installed plugins", and enable
   **Transitrix Studio**.
5. Open a note with a `transitrix-*` fence in **Reading view**.

To update, download the three files from the newer release, overwrite the old
ones and restart Obsidian (or disable and re-enable the plugin).

Optional: the release notes list a SHA-256 for each file. Compare it with the
file you downloaded (`Get-FileHash main.js` on Windows, `shasum -a 256 main.js`
on macOS/Linux).

Demo notes with worked fences live in `demo/`.

<!-- maintainer:start -->
### Build from source (this monorepo)

From the repository root:

```sh
npm ci
npm run package:obsidian-plugin
```

Copy `output/obsidian-plugin/manifest.json`, `main.js`, and `styles.css` into
`.obsidian/plugins/transitrix-studio/` and enable **Transitrix Studio** as above.

### Release process

Build and publication are separate; nothing is published automatically.

1. **Build** — `.github/workflows/obsidian-plugin-build.yml` runs on every PR and
   push to `main` that touches the plugin, `packages/diagrams/**`, the lockfile or
   the sync script. It runs the plugin and sync tests, builds the production
   bundle, dry-runs the community mirror and uploads `main.js`, `manifest.json`,
   `styles.css` and `SHA256SUMS` as an artifact. The `main.js` digest is shown in
   the run summary. It needs no secrets and never publishes.
2. **Accept** — test that artifact in a real Obsidian Desktop.
3. **Publish** — start *Publish Obsidian plugin*
   (`.github/workflows/obsidian-plugin-publish.yml`) manually on `main` and pass
   the accepted `main.js` digest. The run needs approval for the
   `obsidian-release` environment, rebuilds, and fails if its `main.js` differs
   from the accepted digest. It then mirrors plugin sources, demos, manifest,
   `versions.json`, styles, README and LICENSE into
   `transitrix/transitrix-studio-obsidian` and creates the GitHub Release
   (assets: `main.js`, `manifest.json`, `styles.css`; notes: source commit and
   SHA-256 of each asset). The mirror is not a standalone build: `main.js`
   bundles `@transitrix/diagrams` from this monorepo.

Published versions are immutable. Assets of an existing release are never
replaced. Publishing a version that already exists only verifies it: if the new
build is byte-identical (SHA-256) to the release, nothing happens; otherwise the
run fails before anything is pushed. A changed build needs a new version.

To release a new version, bump `version` in `manifest.json` and `package.json`
together and add the same version to `versions.json` (value: `minAppVersion`).
The publish run fails closed if they disagree.

Sections between the `maintainer` markers in this README are stripped from the
community copy. One-time setup: repository secret `OBSIDIAN_PLUGIN_DEPLOY_TOKEN`
with `contents:write` on the community repo, and an `obsidian-release`
environment with required reviewers. Local dry-run (prints the asset digests,
pushes nothing):

```sh
npm run sync:obsidian-community:dry
```
<!-- maintainer:end -->

## Privacy and safety

- Diagrams render as `<img>` with a `data:image/svg+xml` URL — YAML is never injected as HTML into the note DOM.
- Invalid or oversize fences show an in-place error panel instead of crashing the note.
- Source notes are never modified.

## License

MIT — see `LICENSE` in the repository root.
