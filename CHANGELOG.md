# Changelog

## [0.4.19] — 2026-05-21

### Added
- Notation coverage: process map, scenarios, and capability map (TX-020).
- Product portfolio preview.
- Application portfolio preview.
- `build-extension.bat` for packaging the VS Code extension.

### Changed
- Repository layout cleanup — archived legacy components, deduped backends, relocated webview (TX-037).
- Test execution unified — root `npm test` runs both core and diagrams suites; CI covers notation modules.

### Fixed
- FGA and Goals parsers aligned with canonical spec shapes.
- CI metrics-diff thresholds aligned with relaxed regression tests.

### Security
- **TX-R001** — reject shell metacharacters in `svgbobCommand` in the blocks backend to prevent command injection. `parseBlocksCompileJson` now validates the command via an allowlist (alphanumerics, hyphens, dots, path separators) and rejects whitespace, control characters, and shell metacharacters (`; | & $ ` ( ) < > ! " ' { } [ ] # ~ \`). Covered by `tests/blocks-backend.test.ts`.

## [0.4.0] — 2026-05-09

### Added
- Goals tree viewer for `*.goals.transitrix.yaml` files (VS Code webview + web UI tab).
- `@transitrix/diagrams` shared library (`packages/diagrams`) with goals and FGCA modules.
- esbuild extension bundling — VSIX is now self-contained, no `node_modules` needed.
- `extension/icon.png` (128×128).

### Changed
- Brand renamed to **Transitrix Studio** (was: Cervin / LiteEA BAT).
- Root package renamed to `transitrix-studio`; repository URLs updated to `github.com/transitrix/transitrix-studio`.
- All user-visible command titles updated to `Transitrix: …` prefix.
- `README.md` rewritten in English.
- `extension/README.md` rewritten as Marketplace listing page.
- Initial public release on the Microsoft VS Code Marketplace.

### Deferred (planned for v0.5)
- File extension migration (`.cervin.yaml` → `.bpmn.transitrix.yaml`).
- CLI binary rename (`cervin` → `transitrix-studio` or `tstudio`).
- Internal command ID rename (`cervin.*` → `transitrixStudio.*`).
