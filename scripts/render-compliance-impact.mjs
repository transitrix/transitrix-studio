#!/usr/bin/env node
/**
 * Compliance-impact matrix renderer — CV-1 view-config wiring
 * (vkgeorgia/strategy#84, builds on #166 interim renderer).
 *
 * Materialises the subject × obligation × status matrix per the render
 * contract in methodology/notations/views/21-compliance-impact.md §5, at
 * the coarsest grain (`product` × `obligation`).
 *
 * Usage — named view-config file:
 *   node scripts/render-compliance-impact.mjs \
 *        --view <path/to/COMPLIANCE_IMPACT-view.yaml> \
 *        --canon <path/to/canon-root> \
 *        [--out <path/to/output.md>]
 *
 * Usage — registry (directory of view-config files):
 *   node scripts/render-compliance-impact.mjs \
 *        --registry <path/to/views-dir> --report <view-id> \
 *        --canon <path/to/canon-root> \
 *        [--out <path/to/output.md>]
 *
 * The script:
 *   1. Resolves the view config (from --view file or --registry + --report).
 *   2. Logs the active defaults for any omitted optional fields.
 *   3. Scans the canon root recursively for *.yaml / *.yml and ingests each
 *      file that classify.ingestComplianceDoc recognises.
 *   4. Calls `buildImpactMatrix` + `renderImpactMarkdown` and writes the
 *      result to stdout (or --out).
 *
 * Requires `npm run build -w @transitrix/diagrams` to have produced
 * packages/diagrams/dist/.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = path.resolve(HERE, '..');
const DIST_INDEX = path.join(STUDIO_ROOT, 'packages', 'diagrams', 'dist', 'index.js');

function parseArgs(argv) {
  const out = { view: null, registry: null, report: null, canon: null, output: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--view') out.view = argv[++i];
    else if (a.startsWith('--view=')) out.view = a.slice('--view='.length);
    else if (a === '--registry') out.registry = argv[++i];
    else if (a.startsWith('--registry=')) out.registry = a.slice('--registry='.length);
    else if (a === '--report') out.report = argv[++i];
    else if (a.startsWith('--report=')) out.report = a.slice('--report='.length);
    else if (a === '--canon') out.canon = argv[++i];
    else if (a.startsWith('--canon=')) out.canon = a.slice('--canon='.length);
    else if (a === '--out') out.output = argv[++i];
    else if (a.startsWith('--out=')) out.output = a.slice('--out='.length);
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage (named file):
  node scripts/render-compliance-impact.mjs \\
       --view <view.yaml> --canon <canon-root> [--out <file>]

Usage (registry):
  node scripts/render-compliance-impact.mjs \\
       --registry <views-dir> --report <view-id> --canon <canon-root> [--out <file>]

Options:
  --view      <path>   compliance-impact view config YAML file
  --registry  <path>   directory of view config YAML files (use with --report)
  --report    <id>     view.id to select from the registry
  --canon     <path>   root of the canon to scan recursively (required)
  --out       <path>   write markdown to this file (default: stdout)
  -h, --help           show this help`,
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!out.canon) {
    console.error('Missing --canon. Run with --help for usage.');
    process.exit(2);
  }
  if (!out.view && !(out.registry && out.report)) {
    console.error('Provide either --view <file> or --registry <dir> --report <id>. Run with --help for usage.');
    process.exit(2);
  }
  return out;
}

async function readYaml(file) {
  const text = await fs.readFile(file, 'utf8');
  return yaml.load(text);
}

async function* walkYaml(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      yield* walkYaml(full);
    } else if (e.isFile() && (e.name.endsWith('.yaml') || e.name.endsWith('.yml'))) {
      yield full;
    }
  }
}

/**
 * Scan a registry directory for a view config whose view.id matches `reportId`.
 * Returns the raw parsed YAML object of the first match, or null if not found.
 */
async function findInRegistry(registryDir, reportId) {
  let entries;
  try {
    entries = await fs.readdir(registryDir, { withFileTypes: true });
  } catch (err) {
    console.error(`Registry directory not readable: ${registryDir} — ${err.message}`);
    process.exit(2);
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.yaml') && !e.name.endsWith('.yml')) continue;
    const full = path.join(registryDir, e.name);
    let raw;
    try {
      raw = await readYaml(full);
    } catch {
      continue;
    }
    // Accept both bare { id, name } and wrapped { view: { id, name } } shapes.
    const v = raw?.view ?? raw;
    if (v?.id === reportId) return raw;
  }
  return null;
}

/**
 * Log the active defaults that were filled in for this run, so re-runs are
 * auditable without a full view config.
 */
function logActiveDefaults(config, defaults) {
  const assumed = [];
  if (!config.subjects?.products?.length && !config.subjects?.processes?.length) {
    assumed.push('subjects: none specified (empty matrix columns — no product/process IDs in view config)');
  }
  if (!config.status_display) {
    assumed.push(
      `status_display.show: [${defaults.status_display.show.join(', ')}] (all statuses accepted)`,
    );
  }
  if (!config.order_rows_by) {
    assumed.push(`order_rows_by: "${defaults.order_rows_by}" (lexicographic by REQUIREMENT ID)`);
  }
  if (!config.empty_cells?.no_obligation_label) {
    assumed.push(`empty_cells.no_obligation_label: "${defaults.empty_cells.no_obligation_label}"`);
  }
  if (assumed.length) {
    console.error('[render-compliance-impact] assumed defaults:');
    for (const line of assumed) console.error(`  • ${line}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  try {
    await fs.access(DIST_INDEX);
  } catch {
    console.error(
      `Built diagrams bundle not found at ${DIST_INDEX}. Run \`npm run build -w @transitrix/diagrams\` first.`,
    );
    process.exit(3);
  }
  const diagrams = await import(pathToFileURL(DIST_INDEX).href);
  const { emptyCanon, ingestComplianceDoc, buildImpactMatrix, renderImpactMarkdown, parseImpactViewConfig, COMPLIANCE_IMPACT_DEFAULTS } = diagrams;

  // Resolve the view config.
  let viewRaw;
  if (args.view) {
    viewRaw = await readYaml(args.view);
  } else {
    viewRaw = await findInRegistry(args.registry, args.report);
    if (!viewRaw) {
      console.error(`Report "${args.report}" not found in registry: ${args.registry}`);
      process.exit(2);
    }
  }

  const parseResult = parseImpactViewConfig(viewRaw);
  if (!parseResult.ok) {
    console.error('Invalid view config:');
    for (const e of parseResult.errors) console.error(`  • ${e}`);
    process.exit(2);
  }
  const view = parseResult.config;

  console.error(`[render-compliance-impact] view: ${view.id} — ${view.name}`);
  if (view.snapshot_at) console.error(`[render-compliance-impact] snapshot_at: ${view.snapshot_at}`);
  logActiveDefaults(view, COMPLIANCE_IMPACT_DEFAULTS);

  // Scan canon.
  const canon = emptyCanon();
  let scanned = 0;
  let ingested = 0;
  for await (const file of walkYaml(args.canon)) {
    scanned += 1;
    let parsed;
    try {
      parsed = await readYaml(file);
    } catch (err) {
      console.error(`skip ${file}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (ingestComplianceDoc(canon, parsed)) ingested += 1;
  }

  console.error(
    `[render-compliance-impact] scanned=${scanned} ingested=${ingested} ` +
      `(products=${canon.products.length}, requirements=${canon.requirements.length}, ` +
      `assertions=${canon.assertions.length})`,
  );

  const matrix = buildImpactMatrix(canon, view);
  const md = renderImpactMarkdown(matrix);

  if (args.output) {
    await fs.writeFile(args.output, md, 'utf8');
    console.error(`wrote ${args.output}`);
  } else {
    process.stdout.write(md);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
