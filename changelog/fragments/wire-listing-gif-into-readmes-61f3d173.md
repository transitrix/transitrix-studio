### Changed

- **Listing demonstration wired into both READMEs.** `extension/README.md` and the repository root `README.md` now reference `extension/docs/listing.gif` by the same absolute `raw.githubusercontent.com` URL, replacing the old `preview.png` reference. A new hygiene check (`scripts/ci-hygiene-image-refs.mjs`) fails the build if a consuming README references a packaged image by a relative path — the cause of the 1.4.3 broken-image regression.
