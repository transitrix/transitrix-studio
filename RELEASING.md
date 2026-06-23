# Releasing

Migration notes for adopters upgrading across major changes.

---

## 1.x → 2.0 (planned)

### FGCA/FGA → DGCA/DGA notation rename (breaking at 2.0)

The `fgca` and `fga` notation keys, file extensions, and UI strings have been
renamed to `dgca` and `dga` to reflect the "Driver" terminology that replaced
"Factor" across the methodology.

**1.x behaviour (current):** both old and new names are accepted. A deprecation
warning is emitted when the legacy `notation: fgca` or `notation: fga` key is
encountered.

**2.0:** legacy keys will be dropped. Migrate before upgrading.

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

4. Update VS Code settings keys if you have workspace-level overrides:
   - `transitrix.spacing.fgca.*` → `transitrix.spacing.dgca.*`
   - `transitrix.spacing.fga.*` → `transitrix.spacing.dga.*`
   - `transitrix.curvature.fgca` → `transitrix.curvature.dgca`
   - `transitrix.curvature.fga` → `transitrix.curvature.dga`
   - `transitrix.scope.fgca.*` → `transitrix.scope.dgca.*`
   - `transitrix.scope.fga.*` → `transitrix.scope.dga.*`
   - `transitrix.view.fgca` → `transitrix.view.dgca`
   - `transitrix.view.fga` → `transitrix.view.dga`

5. Update any scripts or CI commands that reference `fgca`/`fga` notation
   names in `cervin validate` / `transitrix validate` invocations.
