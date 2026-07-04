// transitrix migrate — walks an adopter repo from its current methodology version
// to a target version by applying the ordered recipes from the methodology repo.
//
// Recipe source: --recipes <dir>, default ../methodology/migrations (matching the
// sync-examples-from-methodology.mjs convention). Transport is decoupled from the
// CLI; production vendoring is a separate release-wiring step (see "Migration
// Recipe Source" decision).

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// ── types ──────────────────────────────────────────────────────────────────

interface RecipeStep {
  from: string;   // major.minor, e.g. "0.5"
  to: string;     // major.minor, e.g. "0.6"
  dir: string;    // absolute path to the recipe directory
}

export interface MigrateArgs {
  from: string | undefined;
  to: string | undefined;
  dryRun: boolean;
  recipesDir: string;
  targetDir: string;
  wantsHelp: boolean;
}

// ── arg parsing ────────────────────────────────────────────────────────────

export function parseMigrateArgv(argv: string[]): MigrateArgs {
  let from: string | undefined;
  let to: string | undefined;
  let dryRun = false;
  let recipesDir = '../methodology/migrations';
  let targetDir = process.cwd();
  let wantsHelp = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { wantsHelp = true; continue; }
    if (a === '--dry-run') { dryRun = true; continue; }
    if (a === '--from') { from = argv[++i]; continue; }
    if (a.startsWith('--from=')) { from = a.slice('--from='.length); continue; }
    if (a === '--to') { to = argv[++i]; continue; }
    if (a.startsWith('--to=')) { to = a.slice('--to='.length); continue; }
    if (a === '--recipes') { recipesDir = argv[++i]; continue; }
    if (a.startsWith('--recipes=')) { recipesDir = a.slice('--recipes='.length); continue; }
    if (!a.startsWith('-')) { targetDir = a; continue; }
  }

  return { from, to, dryRun, recipesDir, targetDir, wantsHelp };
}

// ── recipe discovery ───────────────────────────────────────────────────────

function scanRecipes(recipesDir: string): RecipeStep[] {
  const absDir = resolve(recipesDir);
  if (!existsSync(absDir)) return [];
  const versionPat = /^\d+\.\d+$/;
  return readdirSync(absDir)
    .filter(ent => {
      const parts = ent.split('-to-');
      return parts.length === 2 && versionPat.test(parts[0]) && versionPat.test(parts[1]);
    })
    .map(ent => {
      const [from, to] = ent.split('-to-');
      return { from, to, dir: join(absDir, ent) };
    })
    .filter(r => existsSync(join(r.dir, 'codemod.mjs')));
}

// ── chain resolution ───────────────────────────────────────────────────────

export function resolveChain(from: string, to: string, recipes: RecipeStep[]): RecipeStep[] | null {
  if (from === to) return [];

  const graph = new Map<string, RecipeStep[]>();
  for (const r of recipes) {
    if (!graph.has(r.from)) graph.set(r.from, []);
    graph.get(r.from)!.push(r);
  }

  const queue: Array<{ node: string; path: RecipeStep[] }> = [{ node: from, path: [] }];
  const visited = new Set<string>([from]);

  while (queue.length) {
    const item = queue.shift()!;
    for (const step of graph.get(item.node) ?? []) {
      const newPath = [...item.path, step];
      if (step.to === to) return newPath;
      if (!visited.has(step.to)) {
        visited.add(step.to);
        queue.push({ node: step.to, path: newPath });
      }
    }
  }

  return null;
}

// ── furthest reachable version ─────────────────────────────────────────────

function findFurthestReachable(from: string, recipes: RecipeStep[]): string | undefined {
  const forward = new Map<string, string>();
  for (const r of recipes) forward.set(r.from, r.to);

  let current = from;
  const visited = new Set<string>([from]);
  while (forward.has(current)) {
    const next = forward.get(current)!;
    if (visited.has(next)) break;
    visited.add(next);
    current = next;
  }
  return current === from ? undefined : current;
}

// ── version helpers ────────────────────────────────────────────────────────

// "0.5.0" → "0.5",  "0.5" → "0.5"
export function toMajorMinor(v: string): string {
  return v.split('.').slice(0, 2).join('.');
}

// "0.6" → "0.6.0",  "0.6.0" → "0.6.0"
function toFullSemver(v: string): string {
  const parts = v.split('.');
  while (parts.length < 3) parts.push('0');
  return parts.slice(0, 3).join('.');
}

// ── transitrix.yaml helpers ────────────────────────────────────────────────

const TRANSITRIX_YAML = 'transitrix.yaml';

export function readMethodologyVersion(dir: string): string | undefined {
  const yamlPath = join(resolve(dir), TRANSITRIX_YAML);
  if (!existsSync(yamlPath)) return undefined;
  const content = readFileSync(yamlPath, 'utf8');
  const m = content.match(/^methodology_version\s*:\s*["']?([^\s"'\n]+)["']?/m);
  return m ? m[1] : undefined;
}

function updateMethodologyVersion(dir: string, version: string): void {
  const yamlPath = join(resolve(dir), TRANSITRIX_YAML);
  if (!existsSync(yamlPath)) {
    writeFileSync(yamlPath, `methodology_version: ${version}\n`);
    return;
  }
  const content = readFileSync(yamlPath, 'utf8');
  if (/^methodology_version\s*:/m.test(content)) {
    const updated = content.replace(
      /^(methodology_version\s*:\s*)["']?[^\s"'\n]+["']?/m,
      `$1${version}`,
    );
    writeFileSync(yamlPath, updated);
  } else {
    writeFileSync(yamlPath, `${content.trimEnd()}\nmethodology_version: ${version}\n`);
  }
}

// ── file diff helpers ──────────────────────────────────────────────────────

function walkFiles(dir: string, base = dir): string[] {
  const result: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return result; }
  for (const ent of entries) {
    const full = join(dir, ent);
    let st: ReturnType<typeof statSync>;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) result.push(...walkFiles(full, base));
    else result.push(relative(base, full).replace(/\\/g, '/'));
  }
  return result;
}

function printDiff(relPath: string, before: string, after: string): void {
  if (before === after) return;
  console.log(`--- a/${relPath}`);
  console.log(`+++ b/${relPath}`);
  const bLines = before ? before.split('\n') : [];
  const aLines = after ? after.split('\n') : [];
  const maxLen = Math.max(bLines.length, aLines.length);
  let lastHunk = -1;
  for (let i = 0; i < maxLen; i++) {
    const bl = i < bLines.length ? bLines[i] : null;
    const al = i < aLines.length ? aLines[i] : null;
    if (bl !== al) {
      if (lastHunk !== i - 1) console.log(`@@ -${i + 1},0 +${i + 1},0 @@`);
      if (bl !== null) console.log(`-${bl}`);
      if (al !== null) console.log(`+${al}`);
      lastHunk = i;
    }
  }
  console.log('');
}

function showTreeDiff(originalDir: string, modifiedDir: string): boolean {
  const origFiles = new Set(walkFiles(originalDir));
  const modFiles = new Set(walkFiles(modifiedDir));
  const allFiles = new Set([...origFiles, ...modFiles]);

  const changed: string[] = [];
  for (const f of allFiles) {
    const origContent = origFiles.has(f) ? readFileSync(join(originalDir, f), 'utf8') : '';
    const modContent = modFiles.has(f) ? readFileSync(join(modifiedDir, f), 'utf8') : '';
    if (origContent !== modContent) changed.push(f);
  }

  if (changed.length === 0) {
    console.log('  No files would change.');
    return false;
  }

  console.log(`  ${changed.length} file(s) would change:\n`);
  for (const f of changed) {
    const origContent = origFiles.has(f) ? readFileSync(join(originalDir, f), 'utf8') : '';
    const modContent = modFiles.has(f) ? readFileSync(join(modifiedDir, f), 'utf8') : '';
    printDiff(f, origContent, modContent);
  }
  return true;
}

// ── recipe runner ──────────────────────────────────────────────────────────

function runScript(scriptPath: string, args: string[]): { exitCode: number; output: string } {
  const r = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { exitCode: r.status ?? 1, output: (r.stdout ?? '') + (r.stderr ?? '') };
}

// ── dry-run ────────────────────────────────────────────────────────────────

function runDryRun(chain: RecipeStep[], absTarget: string, toVersion: string): void {
  const tmpDir = mkdtempSync(join(tmpdir(), 'tx-migrate-'));
  try {
    cpSync(absTarget, tmpDir, { recursive: true });

    let overallExit = 0;
    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];
      console.log(`Step ${i + 1}/${chain.length}: ${step.from} → ${step.to}`);
      const { exitCode, output } = runScript(join(step.dir, 'codemod.mjs'), [tmpDir]);
      process.stdout.write(output);
      if (exitCode !== 0) {
        console.error(`  codemod exited ${exitCode} — would require manual intervention`);
        overallExit = exitCode;
      }
    }

    console.log('\nFile changes:');
    showTreeDiff(absTarget, tmpDir);

    const currentVersion = readMethodologyVersion(absTarget);
    console.log(`\nWould update methodology_version: ${currentVersion ?? '(none)'} → ${toFullSemver(toVersion)}`);

    if (overallExit !== 0) {
      console.error('\nDry-run: some steps would require manual intervention (see above).');
      process.exit(overallExit);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── apply ──────────────────────────────────────────────────────────────────

function runApply(chain: RecipeStep[], absTarget: string, toVersion: string): void {
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    console.log(`Step ${i + 1}/${chain.length}: ${step.from} → ${step.to}`);

    const codemodPath = join(step.dir, 'codemod.mjs');
    const { exitCode: codemodExit, output: codemodOut } = runScript(codemodPath, [absTarget]);
    process.stdout.write(codemodOut);

    if (codemodExit !== 0) {
      console.error(`\ntransitrix migrate: codemod ${step.from}→${step.to} exited ${codemodExit}.`);
      console.error(`  Manual intervention required (see output above).`);
      console.error(`  Fix the flagged files, then re-run from step ${i + 1}:`);
      console.error(`  transitrix migrate --from ${step.from} --to ${toVersion} [target-dir]`);
      process.exit(codemodExit);
    }

    const validatePath = join(step.dir, 'validate.mjs');
    if (existsSync(validatePath)) {
      const { exitCode: valExit, output: valOut } = runScript(validatePath, [absTarget]);
      process.stdout.write(valOut);
      if (valExit !== 0) {
        console.error(`\ntransitrix migrate: post-step validation failed for ${step.from}→${step.to}.`);
        console.error(`  Fix the issues above, then re-run from step ${i + 1}:`);
        console.error(`  transitrix migrate --from ${step.from} --to ${toVersion} [target-dir]`);
        process.exit(valExit);
      }
    }

    console.log(`  ✓ step complete\n`);
  }

  const newVersion = toFullSemver(toVersion);
  updateMethodologyVersion(absTarget, newVersion);
  console.log(`✓ Migration complete: ${newVersion}`);
  console.log(`  Updated methodology_version in ${join(absTarget, TRANSITRIX_YAML)}`);
  console.log(`  Review and commit when ready.`);
}

// ── main handler ───────────────────────────────────────────────────────────

export async function handleMigrateCommand(argv: string[]): Promise<void> {
  const { from: rawFrom, to: rawTo, dryRun, recipesDir, targetDir, wantsHelp } = parseMigrateArgv(argv);

  if (wantsHelp) {
    console.error('usage: transitrix migrate [--from X.Y] [--to X.Y] [--dry-run] [--recipes <dir>] [target-dir]');
    console.error('');
    console.error('  Migrates an adopter repository from one methodology version to another');
    console.error('  by running the ordered recipes from the methodology repo.');
    console.error('');
    console.error('  --from X.Y         Source version (default: methodology_version in transitrix.yaml)');
    console.error('  --to X.Y           Target version (default: latest available recipe target)');
    console.error('  --dry-run          Preview changes; no files written');
    console.error('  --recipes <dir>    Path to recipes dir (default: ../methodology/migrations)');
    console.error('  target-dir         Adopter repo root (default: current directory)');
    process.exit(0);
  }

  const absTarget = resolve(targetDir);
  if (!existsSync(absTarget)) {
    console.error(`transitrix migrate: target directory does not exist: ${absTarget}`);
    process.exit(1);
  }

  const recipes = scanRecipes(recipesDir);
  if (recipes.length === 0) {
    console.error(`transitrix migrate: no recipes found in ${resolve(recipesDir)}`);
    console.error(`  Expected subdirectories named X.Y-to-X.Y containing a codemod.mjs.`);
    process.exit(1);
  }

  // Resolve --from
  const fromVersion = rawFrom
    ? toMajorMinor(rawFrom)
    : (() => {
        const v = readMethodologyVersion(absTarget);
        if (!v) {
          console.error(`transitrix migrate: cannot determine source version.`);
          console.error(`  Add methodology_version: X.Y.Z to ${join(absTarget, TRANSITRIX_YAML)}`);
          console.error(`  or pass --from X.Y`);
          process.exit(1);
        }
        return toMajorMinor(v);
      })();

  // Resolve --to
  const toVersion = rawTo
    ? toMajorMinor(rawTo)
    : (() => {
        const v = findFurthestReachable(fromVersion, recipes);
        if (!v) {
          console.error(`transitrix migrate: no recipes available from version ${fromVersion}`);
          console.error(`  Available: ${recipes.map(r => `${r.from}-to-${r.to}`).join(', ')}`);
          process.exit(1);
        }
        return v;
      })();

  const chain = resolveChain(fromVersion, toVersion, recipes);
  if (!chain) {
    console.error(`transitrix migrate: no migration path from ${fromVersion} to ${toVersion}`);
    console.error(`  Available: ${recipes.map(r => `${r.from}-to-${r.to}`).join(', ')}`);
    process.exit(1);
  }

  if (chain.length === 0) {
    console.log(`transitrix migrate: already at ${toVersion} — nothing to do.`);
    return;
  }

  console.log(`transitrix migrate: ${fromVersion} → ${toVersion} (${chain.length} step${chain.length === 1 ? '' : 's'})`);
  if (dryRun) console.log(`  (dry-run — no files will be written)\n`);
  else console.log('');

  if (dryRun) {
    runDryRun(chain, absTarget, toVersion);
  } else {
    runApply(chain, absTarget, toVersion);
  }
}
