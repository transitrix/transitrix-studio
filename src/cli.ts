#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import jsyaml from 'js-yaml';

import {
  DEFAULT_TRANSITRIX_FILE_EXTENSIONS,
  inputMatchesExtension,
  parseCliFileArgv,
  parseValidateArgv,
} from './cli-parse.js';
import { compileTransitrixYamlWithLayout } from './compiler.js';
import { handleMigrateCommand } from './migrate.js';
import { computeLayoutMetrics } from './metrics.js';
import type { ValidationReport, ValidationFinding } from './validator-types.js';
import { parseYamlToIr } from './parser.js';
import { validateProcess } from './validator.js';
import type { ProcessIr } from './ir.js';
import { runRepoValidate, reportRepoFindings, repoScopeHasErrors } from './repo-validate.js';
import {
  isFileValidatableNotation,
  loadNotationYaml,
  validateNotationDoc,
  CANONICAL_NOTATION_FILE_EXTENSIONS,
  inferNotationFromFilename,
  resolveValidatorKey,
} from './validate-notation.js';
import { handleExportComplianceCommand } from './export-compliance.js';

function printUsage(): void {
  console.error(`Transitrix Studio CLI — usage:
       transitrix serve [--port 8765] [--host 127.0.0.1]
       transitrix <input.yaml> <output.bpmn> [--no-metrics] [--no-validate]
       transitrix [--ext=.bpmn.transitrix.yaml] <input.yaml> <output.bpmn> [--no-metrics] [--no-validate]
       transitrix metrics <input.yaml> [--json]
       transitrix metrics [--ext=.bpmn.transitrix.yaml] <input.yaml> [--json]
       transitrix validate <input.yaml> [--json]
       transitrix validate [--ext=.bpmn.transitrix.yaml] <input.yaml> [--json]
       transitrix validate --scope=repo [--root <dir>] [--json]
       transitrix export-compliance [--format md|pdf] [--scope law:<ID>|product:<ID>|gap] [--output <path>] [--root <dir>]
       transitrix migrate [--from X.Y] [--to X.Y] [--dry-run] [--recipes <dir>] [target-dir]


  serve     — local web UI (run npm run ui:build once beforehand).
  <compile> — YAML → BPMN 2.0 XML with layout metrics.
  metrics   — layout quality metrics (with --json for CI).
  validate  — validation only (no XML output; exit 1 on errors). Default scope
              is a single file: BPMN, or a diagram notation (goals, dgca, dga,
              activities, activity-card, process-blueprint, blocks) routed by its
              notation: field — the same checks the Studio preview shows.
              --scope=repo runs whole-canon checks (referential integrity,
              atomicity, id uniqueness, policy).
  export-compliance — Markdown or PDF report of the compliance views (matrix by
              default; law:/product:/gap scopes). Scans --root (default cwd) for
              requirement/assertion/product/codex canon. PDF rendering requires
              WeasyPrint on PATH (pipx install weasyprint).
  migrate   — migrate an adopter repo to a newer methodology version by running
              the ordered recipes from the methodology repo. Reads the current
              version from transitrix.yaml (or --from X.Y); --dry-run previews
              without writing; --recipes <dir> overrides the recipe source.

  --no-metrics  suppress quality metrics report on compile.
  --no-validate suppress validation warnings (errors always run).

Examples:
  npm run transitrix -- compile input.bpmn.transitrix.yaml output.bpmn
  npm run transitrix -- serve
  npm run transitrix -- metrics example.bpmn.transitrix.yaml --json
  npm run transitrix -- validate example.bpmn.transitrix.yaml
  npm run transitrix -- validate example.bpmn.transitrix.yaml --json
  npm run transitrix -- migrate --dry-run
  npm run transitrix -- migrate --from 0.5 --to 0.6 /path/to/adopter-repo
`);
}

async function handleCompileCommand(argv: string[]): Promise<void> {
  const parsed = parseCliFileArgv(argv);
  if (!parsed.ok) {
    console.error('transitrix: --ext requires a comma-separated list of suffixes.');
    process.exit(1);
  }

  const { positional, extList, wantsHelp } = parsed;
  const exts = extList.length > 0 ? extList : DEFAULT_TRANSITRIX_FILE_EXTENSIONS;

  if (wantsHelp) {
    printUsage();
    process.exit(0);
  }

  const [src, dst] = positional;
  if (!src || !dst) {
    console.error('transitrix compile: missing input or output file');
    console.error(`usage: transitrix compile <input.yaml> <output.bpmn>`);
    process.exit(1);
  }

  if (!inputMatchesExtension(src, exts)) {
    console.error(
      `transitrix: input file must end with one of: ${exts.join(', ')} (or pass --ext)`,
    );
    process.exit(1);
  }

  const noMetrics = argv.includes('--no-metrics');
  const noValidateWarnings = argv.includes('--no-validate');

  try {
    const yaml = await readFile(src, 'utf8');
    const result = await compileTransitrixYamlWithLayout(yaml);
    writeFileSync(dst, result.xml);

    // RD-112: Print validation report
    printValidationReport(src, result.validation, noValidateWarnings);

    if (!noMetrics) {
      const metrics = computeLayoutMetrics(result.layout);
      printMetricsReport(src, dst, metrics);
    }

    // Exit non-zero if there are errors
    if (!result.validation.isValid) {
      process.exit(1);
    }
  } catch (e) {
    const err = e as Error & { errors?: string[] };
    console.error(err.message);
    err.errors?.forEach((line) => console.error(`  • ${line}`));
    process.exit(1);
  }
}

function renderMetricsLines(metrics: ReturnType<typeof computeLayoutMetrics>, showStatusIcons: boolean): void {
  const statusIcon = (value: boolean) => {
    return value ? '✓' : '✗';
  };

  const port = showStatusIcons ? statusIcon(metrics.portViolations === 0) + ' ' : '';
  const area = showStatusIcons ? statusIcon(metrics.emptyArea <= 0.3) + ' ' : '';
  const spine = showStatusIcons ? statusIcon(metrics.spineDeviation <= 4) + ' ' : '';

  console.log(`  Port violations    ${port}${metrics.portViolations}`);
  console.log(`  Empty area         ${area}${(metrics.emptyArea * 100).toFixed(1)}%`);
  console.log(`  Spine deviation    ${spine}${metrics.spineDeviation.toFixed(1)} px`);
  console.log(`  Bends              ${metrics.bends}`);
  console.log(`  Crossings          ${metrics.crossings}`);
}

function printMetricsReport(src: string, dst: string, metrics: ReturnType<typeof computeLayoutMetrics>): void {
  console.log();
  console.log(`✓ ${src} → ${dst}`);
  console.log();
  console.log('Layout Quality Metrics:');
  renderMetricsLines(metrics, true);
  console.log();
}

// RD-112: Print validation report with color-coded severity
function printValidationReport(src: string, validation: ValidationReport, suppressWarnings: boolean): void {
  const { findings, summary } = validation;
  
  // Always show errors; skip warnings if --no-validate
  const visibleFindings = suppressWarnings 
    ? findings.filter(f => f.severity === 'error')
    : findings;

  if (visibleFindings.length === 0) {
    return; // No findings to report
  }

  console.log();
  console.log(`✓ ${src}`);
  console.log();
  console.log('Validation:');

  for (const finding of visibleFindings) {
    const icon = finding.severity === 'error' ? '✗' : '⚠';
    const prefix = finding.severity === 'error'
      ? `\x1b[31m${icon} ${finding.ruleId}\x1b[0m` // Red for errors
      : `\x1b[33m${icon} ${finding.ruleId}\x1b[0m`; // Yellow for warnings

    console.log(`  ${prefix} ${finding.message}`);
    if (finding.hint) {
      console.log(`    → ${finding.hint}`);
    }
  }

  const visible = {
    errorCount: visibleFindings.filter(f => f.severity === 'error').length,
    warningCount: visibleFindings.filter(f => f.severity === 'warning').length,
    infoCount: visibleFindings.filter(f => f.severity === 'info').length,
  };

  console.log();
  const summaryParts: string[] = [];
  if (visible.errorCount > 0) {
    summaryParts.push(`\x1b[31m${visible.errorCount} error\x1b[0m${visible.errorCount === 1 ? '' : 's'}`);
  }
  if (visible.warningCount > 0 && !suppressWarnings) {
    summaryParts.push(`\x1b[33m${visible.warningCount} warning\x1b[0m${visible.warningCount === 1 ? '' : 's'}`);
  }
  if (summaryParts.length > 0) {
    console.log(`Validation: ${summaryParts.join(', ')}`);
  }
  console.log();
}

/** Cheap probe of a document's `notation:` field, used to route diagram
 *  notations to their own validator before the BPMN/IR path. Returns undefined
 *  for non-object YAML, a missing/non-string notation, or a syntax error — in
 *  every case the chosen downstream path reports the real problem. */
function probeNotation(text: string): string | undefined {
  try {
    const doc = jsyaml.load(text);
    if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
      const n = (doc as Record<string, unknown>).notation;
      if (typeof n === 'string') return n;
    }
  } catch {
    /* malformed YAML — surfaced by parseYamlToIr / loadNotationYaml below */
  }
  return undefined;
}

/** Emit a file-scope ValidationReport as JSON (for CI/agents) or coloured text.
 *  Shared by the BPMN path and the per-notation path so both speak one schema.
 *  `notation` is added to the JSON only for diagram-notation validation. */
function emitFileReport(
  src: string,
  report: ValidationReport,
  useJson: boolean,
  notation?: string,
): void {
  if (useJson) {
    const output: Record<string, unknown> = {
      valid: report.isValid,
      findings: report.findings.map((f: ValidationFinding) => ({
        ruleId: f.ruleId,
        severity: f.severity,
        message: f.message,
        elementId: f.elementId || null,
        hint: f.hint || null,
      })),
      summary: report.summary,
    };
    if (notation) output.notation = notation;
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (report.findings.length === 0) {
    console.log(`✓ ${src} — valid`);
    console.log();
    return;
  }
  printValidationReport(src, report, false);
}

async function handleValidateCommand(argv: string[]): Promise<void> {
  const parsed = parseValidateArgv(argv);
  if (!parsed.ok) {
    if (parsed.error === 'bad_scope') {
      console.error('transitrix validate: --scope must be "file" or "repo".');
    } else if (parsed.error === '--scope_requires_value') {
      console.error('transitrix validate: --scope requires a value (file|repo).');
    } else if (parsed.error === '--root_requires_value') {
      console.error('transitrix validate: --root requires a directory path.');
    } else {
      console.error('transitrix: --ext requires a comma-separated list of suffixes.');
    }
    process.exit(1);
  }

  const { scope, root, positional, extList, wantsHelp } = parsed;
  // Default extension list for validate: BPMN + all canonical notation extensions.
  // Notation files are already routed by their notation: field before the extension
  // gate, so this expanded default mainly prevents a confusing error message when a
  // canonical-extension file is missing its notation: field.
  const validateDefaultExts = [
    ...DEFAULT_TRANSITRIX_FILE_EXTENSIONS,
    ...CANONICAL_NOTATION_FILE_EXTENSIONS,
  ];
  const exts = extList.length > 0 ? extList : validateDefaultExts;
  const useJson = argv.includes('--json');

  if (wantsHelp) {
    console.error(`usage: transitrix validate <input.yaml> [--json]                 (file scope, default)`);
    console.error(`       transitrix validate --scope=repo [--root <dir>] [--json]`);
    console.error('');
    console.error('file scope — single-file structural/semantic validation (default).');
    console.error('             BPMN, or any diagram notation routed by its notation: field');
    console.error('             (goals, dgca, dga, fgca, fga, activities, activity-card,');
    console.error('             process-blueprint, blocks, applications, capability-map,');
    console.error('             products, scenarios, process-map, requirement, assertion,');
    console.error('             compliance-impact, coverage-metric, codex) — same checks as the preview.');
    console.error('             Canonical notation extensions are accepted without --ext.');
    console.error('repo scope — whole-canon checks (referential integrity, atomicity,');
    console.error('             id uniqueness, policy) over <root> (default: cwd).');
    console.error('Exits with code 1 if any findings.');
    process.exit(0);
  }

  // Repo scope (#141): whole-canon checks on the @transitrix/diagrams model.
  if (scope === 'repo') {
    const repoRoot = root ?? process.cwd();
    const result = runRepoValidate(repoRoot);
    reportRepoFindings(repoRoot, result, useJson);
    if (repoScopeHasErrors(result)) {
      process.exit(1);
    }
    return;
  }

  // ----- file scope -----
  const [src] = positional;
  if (!src) {
    console.error('transitrix validate: missing input file');
    console.error(`usage: transitrix validate <input.yaml> [--json]`);
    process.exit(1);
  }

  // Read first, so we can probe the `notation:` field before the extension gate:
  // diagram-notation files (*.goals.transitrix.yaml, …) don't match the default
  // BPMN/Cervin extension list, and their notation field — not the filename — is
  // the authoritative signal. TX-R004 — keep the read inside try so a missing
  // file exits 1 cleanly instead of throwing.
  let fileText: string;
  try {
    fileText = await readFile(src, 'utf8');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (useJson) {
      console.log(JSON.stringify({ valid: false, message: err.message }, null, 2));
    } else {
      console.error(`✗ ${src}`);
      console.error();
      console.error(`Read error: ${err.message}`);
      console.error();
    }
    process.exit(1);
  }

  // Diagram-notation / codex routing (#258, #518): validate via the shared
  // per-notation validators before the BPMN/IR path.
  let data: unknown;
  try {
    data = loadNotationYaml(fileText);
  } catch (e) {
    const err = e as Error;
    if (useJson) {
      console.log(JSON.stringify({ valid: false, message: err.message }, null, 2));
    } else {
      console.error(`✗ ${src}`);
      console.error();
      console.error(`Parse error: ${err.message}`);
      console.error();
    }
    process.exit(1);
  }

  const validatorKey = resolveValidatorKey(data) ?? inferNotationFromFilename(src);
  if (validatorKey && validatorKey !== 'bpmn') {
    if (isFileValidatableNotation(validatorKey)) {
      const report = validateNotationDoc(validatorKey, data, { filePath: src });
      emitFileReport(src, report, useJson, validatorKey);
      if (!report.isValid) {
        process.exit(1);
      }
      return;
    }
    // Recognised notation, but no file-scope CLI validator yet.
    const notice =
      `notation "${validatorKey}" is not yet validated by the CLI — check it in ` +
      `the Transitrix Studio preview, or run whole-canon checks with --scope=repo.`;
    if (useJson) {
      console.log(
        JSON.stringify({ valid: null, notation: validatorKey, covered: false, message: notice }, null, 2),
      );
    } else {
      console.error(`• ${src}: ${notice}`);
      console.error();
    }
    return;
  }

  // ----- BPMN / no-notation path -----
  // Diagram notations are routed above by their notation: field regardless of
  // filename, so the extension gate here only affects BPMN files and files whose
  // notation: field could not be determined (missing or not a string).
  //
  // Special case: if the filename has a canonical notation extension but the
  // notation: field is absent or wrong, give a targeted error rather than the
  // generic extension list.
  const extNotation = inferNotationFromFilename(src);
  if (extNotation && !resolveValidatorKey(data)) {
    const hint = extNotation === 'codex' ? 'zone: codex' : `notation: ${extNotation}`;
    if (useJson) {
      console.log(
        JSON.stringify(
          {
            valid: false,
            message: `missing ${hint} — add it to the file`,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(`✗ ${src}`);
      console.error();
      console.error(`Missing ${hint} — add it to the file.`);
      console.error();
    }
    process.exit(1);
  }
  if (!inputMatchesExtension(src, exts)) {
    const canonical = validateDefaultExts.join(', ');
    console.error(
      `transitrix validate: unrecognised file extension — canonical extensions: ${canonical} (or use --ext)`,
    );
    process.exit(1);
  }

  let ir: ProcessIr;
  try {
    ir = parseYamlToIr(fileText);
  } catch (e) {
    const err = e as Error & { errors?: string[] };
    if (useJson) {
      const output = {
        valid: false,
        message: err.message,
        errors: err.errors ?? [],
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.error(`✗ ${src}`);
      console.error();
      console.error(`Parse error: ${err.message}`);
      if (err.errors && err.errors.length > 0) {
        console.error();
        console.error('Details:');
        for (const detail of err.errors) {
          console.error(`  - ${detail}`);
        }
      }
      console.error();
    }
    process.exit(1);
  }

  const report = validateProcess(ir);
  emitFileReport(src, report, useJson);
  if (!report.isValid) {
    process.exit(1);
  }
}

async function handleMetricsCommand(argv: string[]): Promise<void> {
  const parsed = parseCliFileArgv(argv);
  if (!parsed.ok) {
    console.error('transitrix: --ext requires a comma-separated list of suffixes.');
    process.exit(1);
  }

  const { positional, extList, wantsHelp } = parsed;
  const exts = extList.length > 0 ? extList : DEFAULT_TRANSITRIX_FILE_EXTENSIONS;
  const useJson = argv.includes('--json');

  if (wantsHelp) {
    printUsage();
    process.exit(0);
  }

  const [src] = positional;
  if (!src) {
    console.error('transitrix metrics: missing input file');
    console.error(`usage: transitrix metrics <input.yaml> [--json]`);
    process.exit(1);
  }

  if (!inputMatchesExtension(src, exts)) {
    console.error(
      `transitrix: input file must end with one of: ${exts.join(', ')} (or pass --ext)`,
    );
    process.exit(1);
  }

  try {
    const yaml = await readFile(src, 'utf8');
    const result = await compileTransitrixYamlWithLayout(yaml);
    const metrics = computeLayoutMetrics(result.layout);

    if (useJson) {
      console.log(JSON.stringify(metrics, null, 2));
    } else {
      console.log();
      console.log(`✓ ${src}`);
      console.log();
      console.log('Layout Quality Metrics:');
      renderMetricsLines(metrics, true);
      console.log();
    }
  } catch (e) {
    const err = e as Error & { errors?: string[] };
    console.error(err.message);
    err.errors?.forEach((line) => console.error(`  • ${line}`));
    process.exit(1);
  }
}


const subcommand = process.argv[2];

// Top-level help: `transitrix --help` / `-h` / `help` print usage and exit 0,
// rather than falling through to the "unknown command" branch.
if (subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
  printUsage();
  process.exit(0);
}

// TX-R004: wrap the top-level dispatch in a try/catch so a logic bug inside
// a handler doesn't surface as an unhandled rejection + stack trace. Each
// handler already exits non-zero on its own expected errors; this is a
// safety net for surprises.
try {
  if (subcommand === 'serve') {
    const serveArgv = process.argv.slice(3);
    try {
      const { cliServeArgv } = await import('./serve-ui.js');
      await cliServeArgv(serveArgv);
    } catch (e) {
      const err = e as Error;
      console.error(err.message);
      process.exit(1);
    }
  } else if (subcommand === 'metrics') {
    await handleMetricsCommand(process.argv.slice(3));
  } else if (subcommand === 'validate') {
    await handleValidateCommand(process.argv.slice(3));
  } else if (subcommand === 'export-compliance') {
    await handleExportComplianceCommand(process.argv.slice(3));
  } else if (subcommand === 'migrate') {
    await handleMigrateCommand(process.argv.slice(3));
  } else if (!subcommand || subcommand === 'compile') {
    // Default: compile
    const compileArgv = subcommand === 'compile'
      ? process.argv.slice(3)
      : process.argv.slice(2);
    await handleCompileCommand(compileArgv);
  } else {
    console.error(`transitrix: unknown command '${subcommand}'`);
    printUsage();
    process.exit(1);
  }
} catch (e) {
  const err = e as Error;
  console.error(`transitrix: unexpected error: ${err.message ?? String(e)}`);
  process.exit(1);
}
