# Releasing

Migration notes for adopters upgrading across major changes.

---

## Release train guard (CLI + diagrams)

`@transitrix/cli` bundles diagrams source at prepack time; it does not install
`@transitrix/diagrams` as a runtime npm dependency. When diagrams changes are
user-visible in CLI paths (`validate --scope=repo`, notation validators, export),
publish the CLI in the same release train after the diagrams bump.

Before tagging a release, ensure:

1. `packages/cli/package.json` is bumped (for example `2.2.0` -> `2.3.0`) when
   bundled diagrams behavior changed.
2. `npm run build --workspace packages/cli` regenerates `packages/cli/dist/`.
3. `node scripts/verify-cli-bundle-alignment.mjs` passes (it checks bundled
   metadata against `packages/diagrams/package.json`).

The npm publish workflow enforces this alignment and fails on skew.

---

## Extension 3.0 — legacy identifier sunset (2026-07)

Transitrix Studio extension **3.0.0** removes the last user-facing Cervin compatibility
shims that lingered after CLI/runtime 2.0.0.

### What changed

- The extension no longer activates for, syntax-highlights, or previews `*.cervin.yaml` files.
- `cervin-yaml` language alias and `.cervin.yaml` language registration removed.
- `cervin.*` VS Code settings fallbacks removed — only `transitrix.*` keys are read.
- `cervin.openPreview` / `cervin.export*` command aliases removed.

### Migration steps

1. Rename BPMN files: `*.cervin.yaml` → `*.bpmn.transitrix.yaml`.
2. Update `settings.json`: `cervin.fileExtensions` / `cervin.exportEnabled` → `transitrix.*`.
3. Update keybindings/macros: `cervin.openPreview` → `transitrix.openPreview` (and export commands).
4. If you had `"[cervin-yaml]"` formatter rules, change to `"[transitrix-yaml]"`.

See [extension/CHANGELOG.md](extension/CHANGELOG.md) — 3.0.0 section — for the full list.

---

## 2.x — deprecated notation aliases removed (2.7.x, 2026-06)

The deprecated notation shims that had been carried for backwards compatibility
since the methodology renames are fully removed in the 2.7.x release line.

### FGCA/FGA → DGCA/DGA

The `fgca` and `fga` notation keys and file extensions have been renamed to
`dgca` and `dga` (Driver-Goal-Change-Activity / Driver-Goal-Activity), reflecting
the "Driver" terminology that replaced "Factor" across the methodology.

**Current state (2.7.x+):** the legacy names are removed. The CLI validators
reject `notation: fgca` / `notation: fga` with errors. The VS Code extension no
longer activates for `*.fgca.transitrix.yaml` / `*.fga.transitrix.yaml` files.

#### Migration steps

1. Rename files: `*.fgca.transitrix.yaml` → `*.dgca.transitrix.yaml`,
   `*.fga.transitrix.yaml` → `*.dga.transitrix.yaml`.

2. Update the `notation:` header inside each file:

   ```yaml
   # before
   notation: fgca

   # after
   notation: dgca
   ```

   Same for `fga` → `dga`.

3. Update document `id:` prefixes if you follow the `FGCA-*` / `FGA-*`
   convention — rename to `DGCA-*` / `DGA-*`. (Not required; the validator
   accepts any string `id`.)

4. Update VS Code settings keys if you have workspace-level overrides.
   The old keys are deprecated and will be removed in a future 2.x patch:
   - `transitrix.spacing.fgca.*` → `transitrix.spacing.dgca.*`
   - `transitrix.spacing.fga.*` → `transitrix.spacing.dga.*`
   - `transitrix.curvature.fgca` → `transitrix.curvature.dgca`
   - `transitrix.curvature.fga` → `transitrix.curvature.dga`
   - `transitrix.scope.fgca.*` → `transitrix.scope.dgca.*`
   - `transitrix.scope.fga.*` → `transitrix.scope.dga.*`
   - `transitrix.view.fgca` → `transitrix.view.dgca`
   - `transitrix.view.fga` → `transitrix.view.dga`

5. Update any scripts or CI commands that reference `fgca`/`fga` notation
   names in `transitrix validate` invocations.

---

### activities/activity-card → action/action-card

The `activities` and `activity-card` notation keys and file extensions have been
renamed to `action` and `action-card`. The `activities-tree` extension is now
`actions-tree`.

**Current state (2.7.x+):** the legacy names are removed. The CLI validators
reject `notation: activities` / `notation: activity-card` with errors. The VS
Code extension no longer activates for `*.activities.transitrix.yaml`,
`*.activity-card.transitrix.yaml`, or `*.activities-tree.transitrix.yaml` files.

#### Migration steps

1. Rename files:
   - `*.activities.transitrix.yaml` → `*.action.transitrix.yaml`
   - `*.activity-card.transitrix.yaml` → `*.action-card.transitrix.yaml`
   - `*.activities-tree.transitrix.yaml` → `*.actions-tree.transitrix.yaml`

2. Update the `notation:` header inside each file:

   ```yaml
   # before
   notation: activities      # or: activity-card

   # after
   notation: action          # or: action-card
   ```

3. Update the root key in YAML files that used the old key:

   ```yaml
   # before
   activities:
     - id: ACT-001
       ...

   # after
   actions:
     - id: ACTION-001
       ...
   ```

   Same for `activity_card:` → `action_card:`.

4. Update VS Code settings keys if you have workspace-level overrides.
   The old keys are deprecated and will be removed in a future 2.x patch:
   - `transitrix.spacing.activities.*` → `transitrix.spacing.action.*`
   - `transitrix.curvature.activities` → `transitrix.curvature.action`
   - `transitrix.entryCurvature.activities` → `transitrix.entryCurvature.action`

5. Update any scripts or CI commands that reference `activities` /
   `activity-card` notation names in `transitrix validate` invocations.

---

## 1.x → 2.0

### Cervin → Transitrix rename (breaking at 2.0.0)

All `cervin` compatibility shims introduced in 1.x are removed in 2.0.0.
See [CHANGELOG.md](CHANGELOG.md) — 2.0.0 section — for the full list of removed
items and drop-in replacements.

Summary of what changed:

- `cervin` CLI binary → `transitrix`
- `cervin.*` VS Code settings → `transitrix.*`
- `cervin.*` VS Code commands → `transitrix.*`
- `.cervinrc` project config → `.transitrixrc` (identical JSON schema)
- `"[cervin-yaml]"` in settings.json → `"[transitrix-yaml]"`
