### Fixed

- **`@transitrix/cli` prepack keeps `@resvg/resvg-js` external.** BPMN PNG compile uses that native addon; esbuild has no `.node` loader, so the package declares the dependency and lets npm install it per platform.
