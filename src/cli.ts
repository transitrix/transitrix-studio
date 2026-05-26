#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import {
  DEFAULT_CERVIN_FILE_EXTENSIONS,
  inputMatchesExtension,
  parseCliFileArgv,
} from './cli-parse.js';
import { compileCervinYamlWithLayout } from './compiler.js';
import { computeLayoutMetrics } from './metrics.js';
import type { ValidationReport, ValidationFinding } from './validator-types.js';
import { parseYamlToIr } from './parser.js';
import { validateProcess } from './validator.js';
import type { ProcessIr } from './ir.js';

function printUsage(): void {
  console.error(`Transitrix Studio CLI — usage:
       cervin serve [--port 8765] [--host 127.0.0.1]
       cervin <input.yaml> <output.bpmn> [--no-metrics] [--no-validate]
       cervin [--ext=.cervin.yaml,.bpmn.transitrix.yaml] <input.yaml> <output.bpmn> [--no-metrics] [--no-validate]
       cervin metrics <input.yaml> [--json]
       cervin metrics [--ext=.cervin.yaml,.bpmn.transitrix.yaml] <input.yaml> [--json]
       cervin validate <input.yaml> [--json]
       cervin validate [--ext=.cervin.yaml,.bpmn.transitrix.yaml] <input.yaml> [--json]

  serve     — local web UI (run npm run ui:build once beforehand).
  <compile> — YAML → BPMN 2.0 XML with layout metrics.
  metrics   — layout quality metrics (with --json for CI).
  validate  — BPMN validation only (no XML output; exit 1 on errors).

  --no-metrics  suppress quality metrics report on compile.
  --no-validate suppress validation warnings (errors always run).

Examples:
  npm run cervin -- compile input.cervin.yaml output.bpmn
  npm run cervin -- serve
  npm run cervin -- metrics example.cervin.yaml --json
  npm run cervin -- validate example.cervin.yaml
  npm run cervin -- validate example.cervin.yaml --json
`);
}

async function handleCompileCommand(argv: string[]): Promise<void> {
  const parsed = parseCliFileArgv(argv);
  if (!parsed.ok) {
    console.error('cervin: --ext requires a comma-separated list of suffixes.');
    process.exit(1);
  }

  const { positional, extList, wantsHelp } = parsed;
  const exts = extList.length > 0 ? extList : DEFAULT_CERVIN_FILE_EXTENSIONS;

  if (wantsHelp) {
    printUsage();
    process.exit(0);
  }

  const [src, dst] = positional;
  if (!src || !dst) {
    console.error('cervin compile: missing input or output file');
    console.error(`usage: cervin compile <input.yaml> <output.bpmn>`);
    process.exit(1);
  }

  if (!inputMatchesExtension(src, exts)) {
    console.error(
      `cervin: input file must end with one of: ${exts.join(', ')} (or pass --ext)`,
    );
    process.exit(1);
  }

  const noMetrics = argv.includes('--no-metrics');
  const noValidateWarnings = argv.includes('--no-validate');

  try {
    const yaml = await readFile(src, 'utf8');
    const result = await compileCervinYamlWithLayout(yaml);
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

async function handleValidateCommand(argv: string[]): Promise<void> {
  const parsed = parseCliFileArgv(argv);
  if (!parsed.ok) {
    console.error('cervin: --ext requires a comma-separated list of suffixes.');
    process.exit(1);
  }

  const { positional, extList, wantsHelp } = parsed;
  const exts = extList.length > 0 ? extList : DEFAULT_CERVIN_FILE_EXTENSIONS;
  const useJson = argv.includes('--json');

  if (wantsHelp) {
    console.error(`usage: cervin validate <input.yaml> [--json]`);
    console.error('');
    console.error('Run BPMN validation without compilation.');
    console.error('Validator checks for structural and semantic errors.');
    console.error('Exits with code 1 if any errors found (warnings do not block).');
    process.exit(0);
  }

  const [src] = positional;
  if (!src) {
    console.error('cervin validate: missing input file');
    console.error(`usage: cervin validate <input.yaml> [--json]`);
    process.exit(1);
  }

  if (!inputMatchesExtension(src, exts)) {
    console.error(
      `cervin: input file must end with one of: ${exts.join(', ')} (or pass --ext)`,
    );
    process.exit(1);
  }

  // Read and parse YAML. TX-R004 — file read was outside the try block, so a
  // missing file surfaced as an unhandled rejection / stack trace instead of
  // a clean exit-1.
  let yaml: string;
  try {
    yaml = await readFile(src, 'utf8');
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

  let ir: ProcessIr;
  try {
    ir = parseYamlToIr(yaml);
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

  // Run validator
  const report = validateProcess(ir);

  if (useJson) {
    // JSON output for CI
    const output = {
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
    console.log(JSON.stringify(output, null, 2));
  } else {
    // Human-readable output
    if (report.findings.length === 0) {
      console.log(`✓ ${src} — valid`);
      console.log();
    } else {
      printValidationReport(src, report, false);
    }
  }

  // Exit with appropriate code
  if (!report.isValid) {
    process.exit(1);
  }
}

async function handleMetricsCommand(argv: string[]): Promise<void> {
  const parsed = parseCliFileArgv(argv);
  if (!parsed.ok) {
    console.error('cervin: --ext requires a comma-separated list of suffixes.');
    process.exit(1);
  }

  const { positional, extList, wantsHelp } = parsed;
  const exts = extList.length > 0 ? extList : DEFAULT_CERVIN_FILE_EXTENSIONS;
  const useJson = argv.includes('--json');

  if (wantsHelp) {
    printUsage();
    process.exit(0);
  }

  const [src] = positional;
  if (!src) {
    console.error('cervin metrics: missing input file');
    console.error(`usage: cervin metrics <input.yaml> [--json]`);
    process.exit(1);
  }

  if (!inputMatchesExtension(src, exts)) {
    console.error(
      `cervin: input file must end with one of: ${exts.join(', ')} (or pass --ext)`,
    );
    process.exit(1);
  }

  try {
    const yaml = await readFile(src, 'utf8');
    const result = await compileCervinYamlWithLayout(yaml);
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
  } else if (!subcommand || subcommand === 'compile') {
    // Default: compile
    const compileArgv = subcommand === 'compile'
      ? process.argv.slice(3)
      : process.argv.slice(2);
    await handleCompileCommand(compileArgv);
  } else {
    console.error(`cervin: unknown command '${subcommand}'`);
    printUsage();
    process.exit(1);
  }
} catch (e) {
  const err = e as Error;
  console.error(`cervin: unexpected error: ${err.message ?? String(e)}`);
  process.exit(1);
}
