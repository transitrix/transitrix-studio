import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPackagePaths } from './consumer-package-paths.mjs';

const examples = {
  'npm-cli': ['package.json', 'README.md', 'LICENSE', 'dist/cli.js', 'dist/diagrams-version.json', 'dist/requirements-build.json', 'schemas/bpmn-dsl.schema.json', 'schemas/transitrixrc.schema.json', 'dist/validators/goals.js'],
  'npm-diagrams': ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/index.d.ts', 'src/index.ts', 'src/webview/styles.css'],
  obsidian: ['main.js', 'manifest.json', 'styles.css'],
  'jetbrains-jar': ['META-INF/MANIFEST.MF', 'META-INF/plugin.xml', 'webview/host.html', 'webview/transitrix-render.js', 'webview/transitrix-render.css', 'com/transitrix/intellij/PreviewAction.class'],
};
for (const [kind, files] of Object.entries(examples)) {
  test(`${kind}: preserves runtime and documented consumer inputs`, () => {
    assert.doesNotThrow(() => verifyPackagePaths(kind, files));
    assert.throws(() => verifyPackagePaths(kind, files.slice(1)), /Missing package path/);
  });
  test(`${kind}: rejects test, tooling, report and directory-sibling fixtures`, () => {
    for (const path of ['tests/fixture.ts', 'scripts/tool.js', 'report.txt', 'src/__tests__/fixture.ts', 'dist/fixture.test.js', 'src-extra/file.ts', '../file', 'dist/../fixture.js']) {
      assert.throws(() => verifyPackagePaths(kind, [...files, path]), /Undeclared package path/);
    }
  });
}
