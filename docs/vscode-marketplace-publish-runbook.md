# Release runbook — VS Code Marketplace

How to publish Transitrix Studio's VS Code extension to the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=transitrix.transitrix-studio)
so VS Code users can install it from within their editor.

Publishing a GitHub Release triggers `.github/workflows/vscode-marketplace-publish.yml`,
which runs `vsce publish` across the platform matrix in parallel. The Open VSX
publish (for Cursor, VSCodium, Windsurf) is a separate workflow;
see [`openvsx-publish-runbook.md`](openvsx-publish-runbook.md).

## What gets published

Per-platform VSIXs built on matching OS/arch runners so each carries the
correct `@resvg/resvg-js-*` native binary. A universal (no `--target`) VSIX
claims all-platform compatibility while carrying only one binary — do not
publish one to the Marketplace.

| Target | Runner |
|--------|--------|
| `win32-x64` | `windows-latest` |
| `darwin-arm64` | `macos-latest` |
| `linux-x64` | `ubuntu-latest` |
| `linux-arm64` | `ubuntu-24.04-arm` |

`win32-arm64` is not in the matrix (no GA GitHub-hosted Windows ARM runner).
`darwin-x64` (Intel macOS) is not in the matrix (macos-13 Intel runner is
chronically unschedulable on this account; Apple Silicon covers current Macs).

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
runtime and fails all matrix jobs loudly if it is absent or empty, so a
missing or expired token is never a silent skip.

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
every GitHub Release (`release: types: [published]`) and publishes four
platform VSIXs in parallel. The workflow also exposes a `workflow_dispatch`
trigger for manual re-runs without creating a new release.

Each runner:
1. Checks out the release tag.
2. Verifies `VSCE_PAT` is set (exits with a clear error if not).
3. Runs `npm run extension:prep` to lay down the platform-correct
   `@resvg/resvg-js-*` binary into `extension/node_modules`.
4. Packages the VSIX with `vsce package --target <target>`.
5. Publishes with `vsce publish --pat "$VSCE_PAT" --packagePath <vsix>`.

## Manual fallback

To publish a single target by hand — for example to fill a CI gap or
re-publish a failed job — build the VSIX on a matching machine and publish:

```bash
# from the repo root on the matching OS/arch
npm run extension:prep
cd extension && npx vsce package --target win32-x64 --out ../output/
cd .. && npx vsce publish --pat "$VSCE_PAT" --packagePath output/transitrix-studio-<version>-win32-x64.vsix
```

Replace `win32-x64` and the filename with the target and version being published.

You can also trigger the full matrix manually via the **workflow_dispatch**
button in the repository's Actions tab.

## Post-publish verification

After each publish (CI or manual), verify via the gallery API that every
matrix target is listed for the new version — not only `win32-x64`:

```bash
curl -s \
  "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json;api-version=7.1-preview.1" \
  -d '{"filters":[{"criteria":[{"filterType":7,"value":"transitrix.transitrix-studio"}]}],"flags":514}' \
  | jq '[.results[0].extensions[0].versions[] | {version:.version, targetPlatform:.targetPlatform}]'
```

The output should list the new version once per target platform (`win32-x64`,
`darwin-arm64`, `linux-x64`, `linux-arm64`). If only `win32-x64` appears,
the other runners did not publish — check the workflow run logs.

End-to-end install check in VS Code:
1. Open VS Code → *Extensions* panel.
2. Search for **Transitrix Studio** — the listing should show the new version.
3. Click *Install* (or *Update*); open a `*.bpmn.transitrix.yaml` file;
   the preview panel should open automatically.

## Relates

- [`packaging.md`](packaging.md) — VSIX packaging (the artefact this workflow publishes).
- [`openvsx-publish-runbook.md`](openvsx-publish-runbook.md) — the parallel Open VSX publish.
- [`release-runbook.md`](release-runbook.md) — npm package publish (`@transitrix/diagrams`, `@transitrix/cli`).
