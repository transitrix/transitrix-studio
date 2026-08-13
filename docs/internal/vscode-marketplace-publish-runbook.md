# Release runbook — VS Code Marketplace

How to publish Transitrix Studio's VS Code extension to the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=transitrix.transitrix-studio)
so VS Code users can install it from within their editor.

Publishing a GitHub Release triggers `.github/workflows/vscode-marketplace-publish.yml`,
which builds and publishes a single universal VSIX with `vsce publish`. The
Open VSX publish (for Cursor, VSCodium, Windsurf) is a separate workflow;
see [`openvsx-publish-runbook.md`](openvsx-publish-runbook.md).

## What gets published

One universal VSIX (`vsce package`, no `--target`) built on a single Linux
runner. The extension declares no runtime `dependencies` and has no
OS/arch-specific content (`@resvg/resvg-js`, its one-time native dependency,
was removed — hold 3, transitrix-hq#141), so the same artefact installs on
every VS Code platform, including ones no runner ever built for (Intel
macOS, Windows ARM). Per-target packaging was retired in hold 4
(transitrix-hq#142); see [`packaging.md`](packaging.md).

## Prerequisites (one-time, maintainer action)

These steps are outside the agent scope and must be completed before the
first automated publish:

1. **Confirm the `transitrix` publisher identity.** Sign in to the
   [Visual Studio Marketplace manage page](https://marketplace.visualstudio.com/manage)
   with the Microsoft account that owns the `transitrix` publisher (the
   `"publisher"` field in `extension/package.json`).

2. **Create an Azure DevOps personal access token.**
   - Go to [dev.azure.com](https://dev.azure.com) → your organisation →
     User Settings → Personal Access Tokens → New Token.
   - Set **Organisation** to `All accessible organisations`.
   - Set **Expiration** — maximum 1 year. Calendar a rotation reminder
     for 2 weeks before expiry (see [§ PAT rotation](#pat-rotation) below).
   - Under **Scopes → Custom defined**, tick
     **Marketplace → Manage** (the minimum scope `vsce` needs).
   - Copy the generated token immediately — it is shown only once.

3. **Save the token as a repo Actions secret** named `VSCE_PAT`:
   - Repository → Settings → Secrets and variables → Actions → New repository secret.
   - Name: `VSCE_PAT`
   - Value: the token copied above.

The workflow's **Verify VSCE_PAT is set** step checks for the secret at
runtime and fails loudly if it is absent or empty, so a missing or expired
token is never a silent skip.

## PAT rotation

Azure DevOps PATs expire. When the token expires the next automated publish
fails immediately at the PAT-check step with a clear error message.

Rotation procedure:
1. Create a new PAT following the same steps as the initial setup (step 2 above).
2. Update the `VSCE_PAT` repo secret with the new token value.
3. Trigger a `workflow_dispatch` run of `vscode-marketplace-publish.yml` to
   confirm the new token authenticates before the next release.

## CI path (automated)

`.github/workflows/vscode-marketplace-publish.yml` runs automatically on
every GitHub Release (`release: types: [published]`) and publishes the
universal VSIX from a single job. The workflow also exposes a
`workflow_dispatch` trigger for manual re-runs without creating a new release.

The job:
1. Checks out the release tag.
2. Verifies `VSCE_PAT` is set (exits with a clear error if not).
3. Runs `npm run extension:prep` to build the extension and compiler bundles
   (no runtime dependency install — `extension/package.json` declares none).
4. Packages the VSIX with `vsce package`.
5. Publishes with `vsce publish --pat "$VSCE_PAT" --packagePath <vsix>`.

## Manual fallback

To publish by hand — for example to re-publish a failed run — build and
publish from any machine:

```bash
npm run extension:prep
cd extension && npx vsce package --out ../output/
cd .. && npx vsce publish --pat "$VSCE_PAT" --packagePath output/transitrix-studio-<version>.vsix
```

Replace the filename with the version being published.

You can also trigger the workflow manually via the **workflow_dispatch**
button in the repository's Actions tab.

## Post-publish verification

After each publish (CI or manual), verify via the gallery API that the new
version is listed:

```bash
curl -s \
  "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json;api-version=7.1-preview.1" \
  -d '{"filters":[{"criteria":[{"filterType":7,"value":"transitrix.transitrix-studio"}]}],"flags":514}' \
  | jq '[.results[0].extensions[0].versions[] | {version:.version, targetPlatform:.targetPlatform}]'
```

`targetPlatform` should be empty/`universal` for the new version — a
non-empty value would mean a `--target` build slipped back in.

End-to-end install check in VS Code:
1. Open VS Code → *Extensions* panel.
2. Search for **Transitrix Studio** — the listing should show the new version.
3. Click *Install* (or *Update*); open a `*.bpmn.transitrix.yaml` file;
   the preview panel should open automatically.

## Relates

- [`packaging.md`](packaging.md) — VSIX packaging (the artefact this workflow publishes).
- [`openvsx-publish-runbook.md`](openvsx-publish-runbook.md) — the parallel Open VSX publish.
- [`release-runbook.md`](release-runbook.md) — npm package publish (`@transitrix/diagrams`, `@transitrix/cli`).
