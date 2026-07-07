# Transitrix Studio 2.2.0

Release date: **2026-06-24** · supersedes [2.1.1](https://github.com/transitrix/transitrix-studio/releases/tag/v2.1.1)

## Highlights

- **Custom BPMN SVG preview is the default** — shared theme, zoom/pan, default-flow markers, compact layout. Legacy bpmn.io viewer: `"transitrix.bpmnRenderer": "bpmn-io"`.
- **DGCA / DGA notation** — canonical rename from FGCA / FGA (legacy keys still read in 1.x with warnings).
- **Blocks IDs**, **BPMN auto-open**, **preview-from-title-bar fix** when the webview has focus.
- **Hand-test layout polish** — pool/lane header padding, start-event inset, `transitrix.bpmn.laneGap` (default 0).

## Upgrade notes

1. **Rename FGCA/FGA files** (optional but recommended): `*.fgca.transitrix.yaml` → `*.dgca.transitrix.yaml`, `*.fga.transitrix.yaml` → `*.dga.transitrix.yaml`; update `notation:` headers accordingly.
2. **BPMN workspace settings:** if you set `transitrix.bpmn.laneGap` to `40` during 2.2.0 previews, reset to **0** for flush lanes (new default).
3. **Cursor / VS Code 2.1+:** editor title-bar preview icons may be hidden under `…` → **Configure Icon Visibility**.

## Full changelog

See [extension/CHANGELOG.md](https://github.com/transitrix/transitrix-studio/blob/main/extension/CHANGELOG.md#220--2026-06-24).

## Publish checklist (maintainer)

- [ ] Merge [#290](https://github.com/transitrix/transitrix-studio/pull/290) into `main`
- [ ] Verify CI green on `main`
- [ ] Retag this draft to `main` @ merge commit (or recreate release from `main`)
- [ ] Publish release → triggers [VS Code Marketplace multi-platform publish](https://github.com/transitrix/transitrix-studio/actions/workflows/vscode-marketplace-publish.yml)
- [ ] Smoke-test: BPMN + Blocks previews on `organizations/acme_corp/canon/views/`
