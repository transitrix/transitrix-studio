# Changelog

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
