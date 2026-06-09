#!/usr/bin/env bash
# =============================================================================
# Build the Transitrix Studio VS Code extension and place the .vsix in output/
#
# macOS / Linux counterpart to build-extension.bat (Windows).
#
# Usage:
#   ./build-extension.sh                                Build a universal VSIX
#                                                       (local install only - see warning below)
#   ./build-extension.sh --bump                         Patch bump, then universal build
#   ./build-extension.sh --target darwin-arm64          Build a targeted VSIX
#   ./build-extension.sh --bump --target linux-x64      Patch bump + targeted build
#
# Supported targets (per docs/packaging.md): win32-x64, win32-arm64,
#   darwin-x64, darwin-arm64, linux-x64, linux-arm64.
#   Each must be built on a matching OS/arch (the @resvg/resvg-js native
#   binary is fetched per platform on npm install).
#
# WARNING - universal build (no --target):
#   `vsce package` without --target produces a VSIX claiming universal
#   compatibility but carrying only the build machine's resvg binary.
#   PNG export will fail on any other OS/arch. Use ONLY for local install
#   testing on the build machine - NEVER publish to the Marketplace
#   without --target. See docs/packaging.md.
# =============================================================================

set -euo pipefail

# cd to the directory containing this script (mirrors `cd /d "%~dp0"` in the .bat).
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$script_dir"

bump=0
target=""

usage() {
  echo "Usage: ./build-extension.sh [--bump] [--target <target>]"
  echo "Supported targets: win32-x64, win32-arm64, darwin-x64, darwin-arm64, linux-x64, linux-arm64"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --bump)
      bump=1
      shift
      ;;
    --target)
      if [ $# -lt 2 ] || [ -z "${2:-}" ]; then
        echo "build-extension: --target requires a value (e.g. darwin-arm64)." >&2
        exit 2
      fi
      target="$2"
      shift 2
      ;;
    --target=*)
      target="${1#--target=}"
      if [ -z "$target" ]; then
        echo "build-extension: --target requires a value (e.g. darwin-arm64)." >&2
        exit 2
      fi
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "build-extension: unknown argument \"$1\"." >&2
      usage >&2
      exit 2
      ;;
  esac
done

mkdir -p output

echo
echo "=== [1/3] extension:prep"
npm run extension:prep

if [ "$bump" = "1" ]; then
  echo
  echo "=== [2/3] bump-extension-version"
  npm run bump-extension-version
else
  echo
  echo "=== [2/3] skipping version bump (pass --bump to enable)"
fi

echo
echo "=== verify-extension-packaging"
node scripts/verify-extension-packaging.mjs

echo
if [ -n "$target" ]; then
  echo "=== [3/3] vsce package --target $target -> output/"
else
  echo "=== [3/3] vsce package -> output/"
  echo "build-extension: WARNING - no --target given; VSIX is local-install only."
  echo "build-extension: see docs/packaging.md before publishing to the Marketplace."
fi

(
  cd extension
  if [ -n "$target" ]; then
    npx --no-install vsce package --target "$target" -o ../output
  else
    npx --no-install vsce package -o ../output
  fi
)

echo
echo "Build complete. Artifacts in output/:"
ls -1 output/*.vsix
