/**
 * Phase 5 of the IntelliJ MVP epic — package the plugin as a distributable
 * `.zip` (ADR 0001 step 5).
 *
 * Two steps, in order:
 *   1. Refresh the browser-safe `@transitrix/diagrams` bundle on disk
 *      (`packages/diagrams/dist/webview/transitrix-render.{js,css}`).
 *      `intellij/build.gradle.kts :syncWebviewBundle` reads these files and
 *      would fail loudly otherwise — running it here keeps a single command
 *      between a fresh checkout and a ready-to-install `.zip`.
 *   2. Invoke Gradle's `:buildPlugin` task under `intellij/`. The IntelliJ
 *      Platform Gradle Plugin v2 produces
 *      `intellij/build/distributions/<rootProject>-<version>.zip`, which is the
 *      artifact Valerii loads via Settings → Plugins → ⚙ → Install Plugin from
 *      Disk… for the hand-test.
 *
 * Picking the Gradle invocation:
 *   - If `intellij/gradlew[.bat]` exists, use it — that's the pinned wrapper.
 *   - Otherwise fall back to a system-installed `gradle` so a host with the
 *     wrapper not yet bootstrapped (the wrapper jar is `.gitignore`d per the
 *     intellij README) can still package without an extra `gradle wrapper` run.
 *   - Print a clean install hint if neither is available, instead of throwing
 *     a raw ENOENT.
 *
 * Out of scope (deferred): publishing to the JetBrains Marketplace, signing,
 * `verifyPlugin` against multiple IDE builds. Same posture as the VS Code
 * extension — produce the artifact, hand it to Valerii.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const intellijDir = path.join(root, 'intellij');
const bundleScript = path.join(root, 'scripts', 'build-webview-bundle.mjs');
const distDir = path.join(intellijDir, 'build', 'distributions');

const USAGE = `package-intellij-plugin: build the IntelliJ plugin .zip.

Usage:
  node scripts/package-intellij-plugin.mjs            Build the .zip
  node scripts/package-intellij-plugin.mjs --skip-bundle
                                                       Skip the webview bundle
                                                       step (use the existing
                                                       packages/diagrams/dist/
                                                       webview/ outputs as-is).

Output:
  intellij/build/distributions/transitrix-intellij-<version>.zip`;

const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help')) {
  console.log(USAGE);
  process.exit(0);
}
const skipBundle = argv.includes('--skip-bundle');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function pickGradle() {
  const wrapperName = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
  const wrapperPath = path.join(intellijDir, wrapperName);
  try {
    await fs.access(wrapperPath);
    return { command: wrapperPath, label: `intellij/${wrapperName}` };
  } catch {
    // Fall through to system gradle.
  }
  const systemName = process.platform === 'win32' ? 'gradle.bat' : 'gradle';
  return { command: systemName, label: `${systemName} (system)` };
}

if (!skipBundle) {
  console.log('• Refreshing webview bundle…');
  await run(process.execPath, [bundleScript]);
} else {
  console.log('• Skipping webview bundle refresh (--skip-bundle).');
}

const { command, label } = await pickGradle();
console.log(`• Building IntelliJ plugin via ${label}…`);
try {
  await run(command, ['buildPlugin', '--console=plain'], { cwd: intellijDir });
} catch (err) {
  if (err && err.code === 'ENOENT') {
    console.error(
      '\nGradle was not found. Either bootstrap the wrapper once with ' +
        '`gradle wrapper` inside intellij/, or install Gradle 8.10+ ' +
        '(https://gradle.org/install/) and rerun.',
    );
    process.exit(1);
  }
  throw err;
}

try {
  const entries = await fs.readdir(distDir);
  const zips = entries.filter((name) => name.endsWith('.zip'));
  if (zips.length === 0) {
    console.error(`\nNo .zip artifact found under ${path.relative(root, distDir)}.`);
    process.exit(1);
  }
  console.log('\nPlugin artifact(s):');
  for (const name of zips) {
    const full = path.join(distDir, name);
    const stat = await fs.stat(full);
    const sizeKb = (stat.size / 1024).toFixed(1);
    console.log(`  ${path.relative(root, full)} (${sizeKb} KB)`);
  }
  console.log(
    '\nInstall in IntelliJ IDEA: Settings → Plugins → ⚙ → ' +
      'Install Plugin from Disk… → select the .zip above.',
  );
} catch (err) {
  console.error(`\nFailed to inspect ${path.relative(root, distDir)}: ${err.message}`);
  process.exit(1);
}
