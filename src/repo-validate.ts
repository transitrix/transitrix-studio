// `transitrix validate --scope=repo` handler (vkgeorgia/transitrix-studio#141).
//
// Lives in its own module — separate from cli.ts — because it imports the
// repo-scope validator from `@transitrix/diagrams` *source*. The root emit build
// (`tsconfig.build.json`, `rootDir: src`) cannot emit files outside `src/`, so
// this module is excluded there and loaded by cli.ts via a runtime dynamic
// import (same pattern as export-compliance.ts). It is still type-checked by
// `npm run compile` (the root program has no rootDir restriction).
//
// The filesystem walk lives here (IO); the checks live in the pure
// `validateRepoModel` so they stay testable and shared.

import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import {
  validateRepoModel,
  type RepoDoc,
  type RepoFinding,
  type RepoModelInput,
} from '@transitrix/diagrams/repo-validate';
import {
  buildComplianceScan,
  buildComplianceIndex,
  buildGapReport,
  buildImpactMatrix,
  buildCoverageMatrix,
  collectImpactViewResolutionFindings,
  collectCoverageViewResolutionFindings,
  parseImpactViewConfig,
  parseCoverageMetricConfig,
  type ComplianceScanResult,
  type ScannedYamlDoc,
} from '@transitrix/diagrams/compliance';
import {
  validateNotationDoc,
  isFileValidatableNotation,
  notationOf,
  resolveValidatorKey,
  loadNotationYaml,
} from './validate-notation.js';
import { parseYamlToIr } from './parser.js';
import { validateProcess } from './validator.js';

/** Directory segments that are tooling/scaffolding, never canon content.
 *  Mirrors lint.py, which skips `.templates/` and `.validators/`. */
const SKIP_SEGMENTS = new Set(['node_modules', '.templates', '.validators']);

function segments(rel: string): string[] {
  return rel.split(/[\\/]/);
}

function isYaml(rel: string): boolean {
  return /\.ya?ml$/i.test(rel);
}

function shouldSkip(rel: string): boolean {
  return segments(rel).some((s) => SKIP_SEGMENTS.has(s));
}

/** Read + parse one YAML file into a RepoDoc, capturing parse errors. */
function readDoc(root: string, rel: string): RepoDoc {
  try {
    const parsed = yaml.load(readFileSync(path.join(root, rel), 'utf-8'));
    const data =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    return { path: rel.replace(/\\/g, '/'), data };
  } catch (e) {
    const err = e as Error;
    return { path: rel.replace(/\\/g, '/'), data: null, parseError: err.message };
  }
}

/** Collect canon docs under `<root>/canon/<zone>/**` exactly as lint.py globs
 *  them: elements from `canon/elements/**`, relations from `canon/relations/**`.
 *  Partitioning by zone (not by `notation`) keeps parity with the reference
 *  linter's element/relation universe. */
export function loadRepoModel(root: string): RepoModelInput {
  const elements: RepoDoc[] = [];
  const relations: RepoDoc[] = [];

  let entries: string[] = [];
  try {
    entries = readdirSync(path.join(root, 'canon'), { recursive: true }) as string[];
  } catch {
    return { elements, relations };
  }

  for (const rel of entries) {
    if (typeof rel !== 'string' || !isYaml(rel) || shouldSkip(rel)) continue;
    const segs = segments(rel);
    const zone = segs[0]; // first segment under canon/
    const fullRel = path.join('canon', rel);
    if (zone === 'elements') {
      elements.push(readDoc(root, fullRel));
    } else if (zone === 'relations') {
      relations.push(readDoc(root, fullRel));
    }
  }

  return { elements, relations };
}

/** A per-file notation finding from sweeping canon/views/** (vkgeorgia/strategy
 *  #258, Phase A.2). Unlike the frozen `RepoFinding` (canon cross-references),
 *  this carries the file, notation, and rule code an agent needs to fix it. */
export interface ViewFinding {
  /** Source file path, relative to the scanned root. */
  file: string;
  /** The document's `notation:` field — '' for a YAML syntax error. */
  notation: string;
  /** The validator rule code, e.g. 'GOALS-002'. 'YAML' for a parse failure. */
  ruleId: string;
  severity: 'error' | 'warning';
  message: string;
}

/** Combined repo-scope result: canon cross-reference findings plus per-file
 *  notation findings from canon/views/**, and the view files skipped because
 *  their notation has no single-file validator (aggregate views like
 *  compliance-impact / coverage-metric). */
export interface RepoScopeResult {
  canon: RepoFinding[];
  views: ViewFinding[];
  /** Per-file codex artefact findings from `codex/**` (#518 Phase C2). */
  codex: ViewFinding[];
  /** REQUIREMENT / ASSERTION element files validated with the repo catalogue (#518 C3). */
  compliance: ViewFinding[];
  skipped: Array<{ file: string; notation: string }>;
}

export interface RepoValidateContext {
  catalog: ComplianceScanResult['catalog'];
  complianceCanon: ComplianceScanResult['complianceCanon'];
  pathById: ComplianceScanResult['pathById'];
}

/** Collect parsed YAML under `<root>/canon/**` and `<root>/codex/**` for the
 *  compliance catalogue (#518 Phase C3). */
export function loadComplianceYamlDocs(root: string): ScannedYamlDoc[] {
  const docs: ScannedYamlDoc[] = [];
  for (const zone of ['canon', 'codex'] as const) {
    let entries: string[] = [];
    try {
      entries = readdirSync(path.join(root, zone), { recursive: true }) as string[];
    } catch {
      continue;
    }
    for (const rel of entries) {
      if (typeof rel !== 'string' || !isYaml(rel) || shouldSkip(rel)) continue;
      const fullRel = path.join(zone, rel).replace(/\\/g, '/');
      try {
        const text = readFileSync(path.join(root, fullRel), 'utf-8');
        docs.push({ path: fullRel, data: loadNotationYaml(text) });
      } catch {
        // YAML syntax errors are surfaced by the per-file validators.
        continue;
      }
    }
  }
  return docs;
}

/** Build the compliance projection + `CanonCatalog` from a repo root. */
export function buildRepoValidateContext(root: string): RepoValidateContext {
  const scan = buildComplianceScan(loadComplianceYamlDocs(root));
  return {
    catalog: scan.catalog,
    complianceCanon: scan.complianceCanon,
    pathById: scan.pathById,
  };
}

/** Collect the raw text of every YAML doc under `<root>/canon/views/**`. */
function loadViewDocs(root: string): Array<{ path: string; text: string }> {
  const docs: Array<{ path: string; text: string }> = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(path.join(root, 'canon', 'views'), { recursive: true }) as string[];
  } catch {
    return docs;
  }
  for (const rel of entries) {
    if (typeof rel !== 'string' || !isYaml(rel) || shouldSkip(rel)) continue;
    const fullRel = path.join('canon', 'views', rel);
    let text: string;
    try {
      text = readFileSync(path.join(root, fullRel), 'utf-8');
    } catch {
      continue;
    }
    docs.push({ path: fullRel.replace(/\\/g, '/'), text });
  }
  return docs;
}

/** Validate every Group A notation file under canon/views/** with the same
 *  per-notation validator the VS Code preview uses, so a repo-scope run surfaces
 *  the per-file errors an adopter would otherwise read off each preview. */
export function runViewValidate(
  root: string,
  ctx?: RepoValidateContext,
): {
  findings: ViewFinding[];
  skipped: Array<{ file: string; notation: string }>;
} {
  const findings: ViewFinding[] = [];
  const skipped: Array<{ file: string; notation: string }> = [];
  for (const doc of loadViewDocs(root)) {
    let data: unknown;
    try {
      data = loadNotationYaml(doc.text);
    } catch (e) {
      findings.push({
        file: doc.path,
        notation: '',
        ruleId: 'YAML',
        severity: 'error',
        message: (e as Error).message,
      });
      continue;
    }
    const notation = notationOf(data);
    if (!notation) continue; // not a notation document — ignore

    // BPMN flow files validate through the IR pipeline (same as file scope),
    // not the diagram-notation dispatch.
    if (notation === 'bpmn') {
      try {
        const report = validateProcess(parseYamlToIr(doc.text));
        for (const f of report.findings) {
          if (f.severity === 'info') continue;
          findings.push({
            file: doc.path,
            notation,
            ruleId: f.ruleId,
            severity: f.severity,
            message: f.message,
          });
        }
      } catch (e) {
        findings.push({
          file: doc.path,
          notation,
          ruleId: 'PARSE',
          severity: 'error',
          message: (e as Error).message,
        });
      }
      continue;
    }

    if (!isFileValidatableNotation(notation)) {
      skipped.push({ file: doc.path, notation });
      continue;
    }

    const validateOpts = { catalog: ctx?.catalog };

    if (notation === 'compliance-impact' && ctx) {
      for (const f of validateNotationDoc(notation, data, validateOpts).findings) {
        if (f.severity === 'info') continue;
        findings.push({
          file: doc.path,
          notation,
          ruleId: f.ruleId,
          severity: f.severity,
          message: f.message,
        });
      }
      const parsed = parseImpactViewConfig(data);
      if (parsed.ok) {
        for (const f of collectImpactViewResolutionFindings(parsed.config, ctx.catalog, ctx.complianceCanon)) {
          findings.push({
            file: doc.path,
            notation,
            ruleId: f.code,
            severity: f.severity,
            message: f.message,
          });
        }
        const matrix = buildImpactMatrix(ctx.complianceCanon, parsed.config);
        for (const f of matrix.findings) {
          findings.push({
            file: doc.path,
            notation,
            ruleId: f.code,
            severity: f.severity,
            message: f.message,
          });
        }
      }
      continue;
    }

    if (notation === 'coverage-metric' && ctx) {
      for (const f of validateNotationDoc(notation, data, validateOpts).findings) {
        if (f.severity === 'info') continue;
        findings.push({
          file: doc.path,
          notation,
          ruleId: f.ruleId,
          severity: f.severity,
          message: f.message,
        });
      }
      const parsed = parseCoverageMetricConfig(data);
      if (parsed.ok) {
        for (const f of collectCoverageViewResolutionFindings(parsed.config, ctx.catalog, ctx.complianceCanon)) {
          findings.push({
            file: doc.path,
            notation,
            ruleId: f.code,
            severity: f.severity,
            message: f.message,
          });
        }
        buildCoverageMatrix(ctx.complianceCanon, parsed.config);
      }
      continue;
    }

    for (const f of validateNotationDoc(notation, data, validateOpts).findings) {
      if (f.severity === 'info') continue;
      findings.push({
        file: doc.path,
        notation,
        ruleId: f.ruleId,
        severity: f.severity,
        message: f.message,
      });
    }
  }
  return { findings, skipped };
}

/** Collect YAML paths under `<root>/codex/**`. */
function loadCodexDocs(root: string): Array<{ path: string; text: string }> {
  const docs: Array<{ path: string; text: string }> = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(path.join(root, 'codex'), { recursive: true }) as string[];
  } catch {
    return docs;
  }
  for (const rel of entries) {
    if (typeof rel !== 'string' || !isYaml(rel) || shouldSkip(rel)) continue;
    const fullRel = path.join('codex', rel);
    let text: string;
    try {
      text = readFileSync(path.join(root, fullRel), 'utf-8');
    } catch {
      continue;
    }
    docs.push({ path: fullRel.replace(/\\/g, '/'), text });
  }
  return docs;
}

/** Validate every codex artefact under `codex/**` (#518 Phase C2). */
export function runCodexValidate(root: string): ViewFinding[] {
  const findings: ViewFinding[] = [];
  for (const doc of loadCodexDocs(root)) {
    let data: unknown;
    try {
      data = loadNotationYaml(doc.text);
    } catch (e) {
      findings.push({
        file: doc.path,
        notation: 'codex',
        ruleId: 'YAML',
        severity: 'error',
        message: (e as Error).message,
      });
      continue;
    }
    const key = resolveValidatorKey(data);
    if (key !== 'codex') continue;
    for (const f of validateNotationDoc('codex', data, { filePath: doc.path }).findings) {
      if (f.severity === 'info') continue;
      findings.push({
        file: doc.path,
        notation: 'codex',
        ruleId: f.ruleId,
        severity: f.severity,
        message: f.message,
      });
    }
  }
  return findings;
}

/** Validate REQUIREMENT elements under `canon/elements/**` and ASSERTION files
 *  under `canon/assertions/**` with the repo catalogue (#518 Phase C3). */
export function runComplianceValidate(root: string, ctx: RepoValidateContext): ViewFinding[] {
  const findings: ViewFinding[] = [];
  const validateOpts = { catalog: ctx.catalog };

  let elementEntries: string[] = [];
  try {
    elementEntries = readdirSync(path.join(root, 'canon', 'elements'), { recursive: true }) as string[];
  } catch {
    elementEntries = [];
  }
  for (const rel of elementEntries) {
    if (typeof rel !== 'string' || !isYaml(rel) || shouldSkip(rel)) continue;
    const fullRel = path.join('canon', 'elements', rel).replace(/\\/g, '/');
    let data: unknown;
    try {
      data = loadNotationYaml(readFileSync(path.join(root, fullRel), 'utf-8'));
    } catch (e) {
      findings.push({
        file: fullRel,
        notation: '',
        ruleId: 'YAML',
        severity: 'error',
        message: (e as Error).message,
      });
      continue;
    }
    const notation = notationOf(data);
    if (notation !== 'requirement' && notation !== 'constraint') continue;
    for (const f of validateNotationDoc(notation, data, validateOpts).findings) {
      if (f.severity === 'info') continue;
      findings.push({
        file: fullRel,
        notation,
        ruleId: f.ruleId,
        severity: f.severity,
        message: f.message,
      });
    }
  }

  let assertionEntries: string[] = [];
  try {
    assertionEntries = readdirSync(path.join(root, 'canon', 'assertions'), { recursive: true }) as string[];
  } catch {
    assertionEntries = [];
  }
  for (const rel of assertionEntries) {
    if (typeof rel !== 'string' || !isYaml(rel) || shouldSkip(rel)) continue;
    const fullRel = path.join('canon', 'assertions', rel).replace(/\\/g, '/');
    let data: unknown;
    try {
      data = loadNotationYaml(readFileSync(path.join(root, fullRel), 'utf-8'));
    } catch (e) {
      findings.push({
        file: fullRel,
        notation: '',
        ruleId: 'YAML',
        severity: 'error',
        message: (e as Error).message,
      });
      continue;
    }
    const notation = notationOf(data);
    if (notation !== 'assertion') continue;
    for (const f of validateNotationDoc('assertion', data, validateOpts).findings) {
      if (f.severity === 'info') continue;
      findings.push({
        file: fullRel,
        notation: 'assertion',
        ruleId: f.ruleId,
        severity: f.severity,
        message: f.message,
      });
    }
  }

  return findings;
}

/** Optional repo-scope gap-dashboard aggregates as warnings (#518 C3). */
export function runGapDashboardWarnings(ctx: RepoValidateContext): ViewFinding[] {
  const findings: ViewFinding[] = [];
  const index = buildComplianceIndex({
    requirements: ctx.complianceCanon.requirements,
    assertions: ctx.complianceCanon.assertions,
  });
  const report = buildGapReport(index, { today: new Date().toISOString().slice(0, 10) });

  for (const req of report.requirementsWithoutAssertions) {
    findings.push({
      file: ctx.pathById.get(req.id) ?? req.id,
      notation: req.element_kind ?? 'requirement',
      ruleId: 'GAP-REQ-NO-ASSERT',
      severity: 'warning',
      message: `${req.element_kind === 'constraint' ? 'Constraint' : 'Requirement'} "${req.id}" has no assertion targeting it.`,
    });
  }
  for (const a of report.assertionsWithoutEvidence) {
    findings.push({
      file: ctx.pathById.get(a.id) ?? a.id,
      notation: 'assertion',
      ruleId: 'ASSERT-007',
      severity: 'warning',
      message: `Assertion "${a.id}" has status ${a.status} but no evidence.`,
    });
  }
  for (const a of report.staleAssertions) {
    findings.push({
      file: ctx.pathById.get(a.id) ?? a.id,
      notation: 'assertion',
      ruleId: 'ASSERT-008',
      severity: 'warning',
      message: `Assertion "${a.id}" next_review_at (${a.next_review_at}) is in the past.`,
    });
  }

  return findings;
}

/** Load the canon model under `root` and run the repo-scope checks: canon
 *  cross-references plus per-file notation sweep over canon/views/** and codex/**. */
export function runRepoValidate(root: string): RepoScopeResult {
  const ctx = buildRepoValidateContext(root);
  const canon = validateRepoModel(loadRepoModel(root));
  const { findings: views, skipped } = runViewValidate(root, ctx);
  const codex = runCodexValidate(root);
  const compliance = [
    ...runComplianceValidate(root, ctx),
    ...runGapDashboardWarnings(ctx),
  ];
  return { canon, views, codex, compliance, skipped };
}

/** True when the run has a blocking finding — a canon finding or a view error.
 *  View warnings and skipped files do not fail the run. */
export function repoScopeHasErrors(result: RepoScopeResult): boolean {
  return (
    result.canon.length > 0
    || result.views.some((v) => v.severity === 'error')
    || result.codex.some((c) => c.severity === 'error')
    || result.compliance.some((c) => c.severity === 'error')
  );
}

/** Print the repo-scope result (human or JSON). Returns nothing; the caller sets
 *  the exit code via repoScopeHasErrors(). */
export function reportRepoFindings(root: string, result: RepoScopeResult, useJson: boolean): void {
  const { canon, views, codex, compliance, skipped } = result;
  const viewErrors = views.filter((v) => v.severity === 'error');
  const viewWarnings = views.filter((v) => v.severity === 'warning');
  const codexErrors = codex.filter((c) => c.severity === 'error');
  const codexWarnings = codex.filter((c) => c.severity === 'warning');
  const complianceErrors = compliance.filter((c) => c.severity === 'error');
  const complianceWarnings = compliance.filter((c) => c.severity === 'warning');
  const valid =
    canon.length === 0
    && viewErrors.length === 0
    && codexErrors.length === 0
    && complianceErrors.length === 0;

  if (useJson) {
    console.log(
      JSON.stringify(
        {
          scope: 'repo',
          root,
          valid,
          findings: canon,
          views: { valid: viewErrors.length === 0, findings: views },
          codex: { valid: codexErrors.length === 0, findings: codex },
          compliance: { valid: complianceErrors.length === 0, findings: compliance },
          skipped,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (valid && skipped.length === 0) {
    console.log(`✓ ${root} — repo-scope validation passed`);
    console.log();
    return;
  }

  console.log();
  console.log(`${valid ? '✓' : '✗'} ${root}`);
  console.log();

  if (canon.length > 0) {
    console.log('Canon (elements / relations):');
    for (const f of canon) {
      const where = f.id ? f.id : '(file)';
      console.log(`  \x1b[31m✗ ${where}\x1b[0m ${f.message}`);
    }
    console.log();
  }

  if (views.length > 0) {
    console.log('Views (canon/views):');
    let currentFile = '';
    for (const v of views) {
      if (v.file !== currentFile) {
        console.log(`  ${v.file} [${v.notation || 'yaml'}]`);
        currentFile = v.file;
      }
      const mark =
        v.severity === 'error' ? `\x1b[31m✗ ${v.ruleId}\x1b[0m` : `\x1b[33m⚠ ${v.ruleId}\x1b[0m`;
      console.log(`    ${mark} ${v.message}`);
    }
    console.log();
  }

  if (codex.length > 0) {
    console.log('Codex (codex/):');
    let currentFile = '';
    for (const c of codex) {
      if (c.file !== currentFile) {
        console.log(`  ${c.file} [codex]`);
        currentFile = c.file;
      }
      const mark =
        c.severity === 'error' ? `\x1b[31m✗ ${c.ruleId}\x1b[0m` : `\x1b[33m⚠ ${c.ruleId}\x1b[0m`;
      console.log(`    ${mark} ${c.message}`);
    }
    console.log();
  }

  if (compliance.length > 0) {
    console.log('Compliance (requirements / assertions):');
    let currentFile = '';
    for (const c of compliance) {
      if (c.file !== currentFile) {
        console.log(`  ${c.file} [${c.notation || 'yaml'}]`);
        currentFile = c.file;
      }
      const mark =
        c.severity === 'error' ? `\x1b[31m✗ ${c.ruleId}\x1b[0m` : `\x1b[33m⚠ ${c.ruleId}\x1b[0m`;
      console.log(`    ${mark} ${c.message}`);
    }
    console.log();
  }

  if (skipped.length > 0) {
    console.log(
      `Skipped — notation not yet validated by the CLI (check in the preview): ${skipped.length} file${skipped.length === 1 ? '' : 's'}`,
    );
    for (const s of skipped) {
      console.log(`  • ${s.file} [${s.notation}]`);
    }
    console.log();
  }

  const parts: string[] = [];
  if (canon.length > 0) {
    parts.push(`\x1b[31m${canon.length}\x1b[0m canon`);
  }
  if (viewErrors.length > 0) {
    parts.push(`\x1b[31m${viewErrors.length}\x1b[0m view error${viewErrors.length === 1 ? '' : 's'}`);
  }
  if (viewWarnings.length > 0) {
    parts.push(
      `\x1b[33m${viewWarnings.length}\x1b[0m view warning${viewWarnings.length === 1 ? '' : 's'}`,
    );
  }
  if (codexErrors.length > 0) {
    parts.push(`\x1b[31m${codexErrors.length}\x1b[0m codex error${codexErrors.length === 1 ? '' : 's'}`);
  }
  if (codexWarnings.length > 0) {
    parts.push(
      `\x1b[33m${codexWarnings.length}\x1b[0m codex warning${codexWarnings.length === 1 ? '' : 's'}`,
    );
  }
  if (complianceErrors.length > 0) {
    parts.push(
      `\x1b[31m${complianceErrors.length}\x1b[0m compliance error${complianceErrors.length === 1 ? '' : 's'}`,
    );
  }
  if (complianceWarnings.length > 0) {
    parts.push(
      `\x1b[33m${complianceWarnings.length}\x1b[0m compliance warning${complianceWarnings.length === 1 ? '' : 's'}`,
    );
  }
  if (parts.length > 0) {
    console.log(`Repo-scope validation: ${parts.join(', ')}`);
    console.log();
  }
}
