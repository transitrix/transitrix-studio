// Consumer package composition is separate from the public source inventory.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function verifyPackagePaths(kind, paths) {
  const files = new Set(paths);
  const metadata = new Set(['package.json', 'README.md', 'LICENSE']);
  let allowed;
  let required;
  if (kind === 'npm-cli') {
    // Executable bundles, discovered notation validators, schemas and runtime
    // version/provenance metadata; npm listing, installation guide and license.
    required = [...metadata, 'dist/cli.js', 'dist/diagrams-version.json', 'dist/requirements-build.json', 'schemas/bpmn-dsl.schema.json', 'schemas/transitrixrc.schema.json'];
    allowed = path => metadata.has(path) || /^dist\/(?:[a-z0-9-]+|validators\/[a-z0-9-]+)\.js$/.test(path) || required.includes(path);
  } else if (kind === 'npm-diagrams') {
    // Runtime exports, TypeScript declarations and documented SDK source for
    // downstream developers. Tests, maps and build tools have no package role.
    required = [...metadata, 'dist/index.js', 'dist/index.d.ts', 'src/index.ts', 'src/webview/styles.css'];
    allowed = path => metadata.has(path) || /^dist\/.+\.(?:js|d\.ts)$/.test(path) || /^src\/.+\.(?:ts|tsx|css)$/.test(path);
  } else if (kind === 'obsidian') {
    // The three files read by the Obsidian installer/runtime. Developer
    // documentation and license remain in the linked public source repository.
    required = ['main.js', 'manifest.json', 'styles.css'];
    allowed = path => required.includes(path);
  } else if (kind === 'jetbrains-jar') {
    // JVM implementation, host plugin metadata/icons and the JCEF bundle.
    required = ['META-INF/MANIFEST.MF', 'META-INF/plugin.xml', 'webview/host.html', 'webview/transitrix-render.js', 'webview/transitrix-render.css'];
    allowed = path => /^com\/transitrix\/intellij\/[^/]+\.class$/.test(path) || /^META-INF\/(?:MANIFEST\.MF|plugin\.xml|pluginIcon(?:_dark)?\.svg|com\.transitrix\.intellij_transitrix-intellij\.kotlin_module)$/.test(path) || required.includes(path);
  } else throw new Error('Unknown package kind');
  for (const path of files) {
    if (path.endsWith('/')) continue;
    if (path.split('/').some(part => !part || part === '.' || part === '..') || /[\\\x00-\x1f]/.test(path) || /(?:^|\/)(?:__tests__|tests?|scripts|fixtures)(?:\/|\.)|\.(?:test|spec)\./i.test(path) || !allowed(path)) {
      throw new Error(`Undeclared package path: ${JSON.stringify(path)}`);
    }
  }
  for (const path of required) if (!files.has(path)) throw new Error(`Missing package path: ${JSON.stringify(path)}`);
}

export function checkLocalPackages() {
  for (const [kind, workspace] of [['npm-cli', 'packages/cli'], ['npm-diagrams', 'packages/diagrams']]) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const output = execFileSync(npm, ['pack', '--workspace', workspace, '--ignore-scripts', '--dry-run', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
    const packs = JSON.parse(output);
    if (packs.length !== 1) throw new Error('Invalid packlist');
    verifyPackagePaths(kind, packs[0].files.map(file => file.path));
    console.log(`${kind}: ${packs[0].files.length} consumer files`);
  }
  verifyPackagePaths('obsidian', readdirSync('output/obsidian-plugin'));
  console.log('obsidian: consumer files passed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) checkLocalPackages();
