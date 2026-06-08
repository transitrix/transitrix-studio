#!/usr/bin/env node
/**
 * Interim compliance-impact matrix renderer
 * (vkgeorgia/strategy#166 — fast-track interim; full Studio consumer-side
 * renderer is tracked under #84).
 *
 * Materialises the subject × obligation × status matrix per the render contract
 * in methodology/notations/views/21-compliance-impact.md §5, at the coarsest
 * grain (`product` × `obligation`). Stage / task grouping is intentionally out
 * of scope here — those need a process-flow walk and a process-blueprint join
 * that the full renderer will handle.
 *
 * Usage:
 *   node scripts/render-compliance-impact.mjs \
 *        --view <path/to/COMPLIANCE_IMPACT-…compliance-impact.transitrix.yaml> \
 *        --canon <path/to/canon-root> \
 *        [--out <path/to/output.md>]
 *
 * The script:
 *   1. Parses the view config (one YAML doc per file).
 *   2. Recursively scans the canon root for *.yaml / *.yml and ingests every
 *      file that classify.ingestComplianceDoc recognises (PRODUCT / REQUIREMENT
 *      / ASSERTION elements + codex documents).
 *   3. Calls `@transitrix/diagrams` `buildImpactMatrix` + `renderImpactMarkdown`
 *      and writes the result to stdout (or --out).
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
  const out = { view: null, canon: null, output: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--view') out.view = argv[++i];
    else if (a.startsWith('--view=')) out.view = a.slice('--view='.length);
    else if (a === '--canon') out.canon = argv[++i];
    else if (a.startsWith('--canon=')) out.canon = a.slice('--canon='.length);
    else if (a === '--out') out.output = argv[++i];
    else if (a.startsWith('--out=')) out.output = a.slice('--out='.length);
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: node scripts/render-compliance-impact.mjs --view <view.yaml> --canon <canon-root> [--out <file>]
  --view   <path>   compliance-impact view config (required)
  --canon  <path>   root of the canon to scan recursively (required)
  --out    <path>   write markdown to this file (default: stdout)
  -h, --help        show this help`,
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!out.view || !out.canon) {
    console.error('Missing --view or --canon. Run with --help for usage.');
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

function viewConfigFromYaml(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('view: expected an object at the document root');
  const v = raw.view;
  if (!v || typeof v !== 'object') throw new Error('view: missing top-level `view:` object');
  if (!v.id || typeof v.id !== 'string') throw new Error('view.id: required string');
  if (!v.name || typeof v.name !== 'string') throw new Error('view.name: required string');
  if (!v.subjects || typeof v.subjects !== 'object') throw new Error('view.subjects: required object (COMPIMP-002)');
  return {
    id: v.id,
    name: v.name,
    description: typeof v.description === 'string' ? v.description : undefined,
    subjects: {
      products: Array.isArray(v.subjects.products) ? v.subjects.products.filter(x => typeof x === 'string') : undefined,
      processes: Array.isArray(v.subjects.processes) ? v.subjects.processes.filter(x => typeof x === 'string') : undefined,
    },
    obligations: {
      include: Array.isArray(v.obligations?.include)
        ? v.obligations.include.filter(x => typeof x === 'string')
        : undefined,
      filter: v.obligations?.filter
        ? {
            derived_from_codex: Array.isArray(v.obligations.filter.derived_from_codex)
              ? v.obligations.filter.derived_from_codex.filter(x => typeof x === 'string')
              : undefined,
          }
        : undefined,
    },
    status_display: v.status_display ? { show: v.status_display.show } : undefined,
    empty_cells: v.empty_cells
      ? {
          no_obligation_label: v.empty_cells.no_obligation_label,
          no_obligation_applies_label: v.empty_cells.no_obligation_applies_label,
        }
      : undefined,
    order_rows_by: v.order_rows_by,
  };
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
  const { emptyCanon, ingestComplianceDoc, buildImpactMatrix, renderImpactMarkdown } = diagrams;

  const viewRaw = await readYaml(args.view);
  const view = viewConfigFromYaml(viewRaw);

  const canon = emptyCanon();
  let scanned = 0;
  let ingested = 0;
  for await (const file of walkYaml(args.canon)) {
    scanned += 1;
    let parsed;
    try {
      parsed = await readYaml(file);
    } catch (err) {
      // Malformed YAML — skip with a warning; the interim renderer is best-effort.
      console.error(`skip ${file}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    // js-yaml.load returns one doc for `yaml.load`; multi-doc files would need `yaml.loadAll`.
    // Keep it simple: one root doc per canon file.
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
