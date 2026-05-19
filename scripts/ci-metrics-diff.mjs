#!/usr/bin/env node
/**
 * CI Metrics Diff Reporter
 *
 * Computes current metrics and compares against baseline snapshot.
 * Used by GitHub Actions workflow to detect layout quality regressions.
 *
 * Exit codes:
 *   0 = No violations, all metrics within tolerance
 *   1 = Violations detected, regression detected
 *   2 = Missing baseline file or parsing error
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Dynamic import for source modules
async function loadCompiler() {
  const distPath = path.join(projectRoot, 'dist');
  // Import the compiler modules
  const compilerMod = await import(`file://${path.join(distPath, 'compiler.js')}`);
  const metricsMod = await import(`file://${path.join(distPath, 'metrics.js')}`);
  return { compilerMod, metricsMod };
}

// Metric tolerances (from regression tests)
const TOLERANCES = {
  crossings: 1,
  bends: 2,
  edgeLength: 0.10,
  waypointDensity: 0.15,
  spineDeviation: Infinity,
  emptyArea: Infinity,
  portViolations: 0,
  portUniqueness: -1,
  laneAxisAlignment: -1,
  layoutScore: -1,
};


async function computeCurrentMetrics() {
  const { compilerMod, metricsMod } = await loadCompiler();
  const { compileCervinYamlWithLayout } = compilerMod;
  const { computeLayoutMetrics } = metricsMod;

  // Mirror scripts/measure-baseline.mjs: BPMN corpus lives directly under
  // examples/bpmn/ (no nested corpus/ subfolder) and uses the .bpmn.yaml suffix.
  const corpusDir = path.join(projectRoot, 'examples', 'bpmn');
  const files = await fs.readdir(corpusDir);
  const yamlFiles = files.filter(f => f.endsWith('.bpmn.yaml'));

  const results = {};

  for (const file of yamlFiles) {
    const filePath = path.join(corpusDir, file);
    const yaml = await fs.readFile(filePath, 'utf8');

    try {
      const result = await compileCervinYamlWithLayout(yaml);
      const metrics = computeLayoutMetrics(result.layout);

      results[file] = {
        status: 'success',
        elementCount: result.layout?.elements?.length || 0,
        flowCount: result.layout?.flows?.length || 0,
        metrics,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      results[file] = {
        status: 'error',
        error: err.message || String(err),
        timestamp: new Date().toISOString(),
      };
    }
  }

  return results;
}

async function main() {
  const baselineFile = process.argv[2];

  if (!baselineFile) {
    console.error('Usage: node ci-metrics-diff.mjs <baseline-file>');
    process.exit(2);
  }

  let baseline;
  try {
    const content = await fs.readFile(baselineFile, 'utf8');
    baseline = JSON.parse(content);
  } catch (err) {
    console.error(`❌ Error reading baseline file: ${err.message}`);
    process.exit(2);
  }

  if (!baseline.results) {
    console.error('❌ Invalid baseline file structure: missing "results" field');
    process.exit(2);
  }

  // Compute current metrics
  let currentResults;
  try {
    currentResults = await computeCurrentMetrics();
  } catch (err) {
    console.error(`❌ Error computing current metrics: ${err.message}`);
    process.exit(2);
  }

  // Compare metrics
  const violations = [];
  const details = [];
  let successCount = 0;
  let errorCount = 0;

  for (const [diagramName, baselineData] of Object.entries(baseline.results)) {
    const currentData = currentResults[diagramName];

    if (!currentData) {
      console.warn(`⚠️  Diagram in baseline but not in current: ${diagramName}`);
      continue;
    }

    // Track status
    if (baselineData.status === 'success') {
      successCount++;
    } else {
      errorCount++;
    }

    // Check for compilation changes
    if (baselineData.status === 'success' && currentData.status === 'error') {
      violations.push({
        diagram: diagramName,
        type: 'REGRESSION_BROKEN',
        message: `Diagram now fails to compile: ${currentData.error}`,
      });
      details.push({
        diagram: diagramName,
        status: 'error',
        error: currentData.error,
      });
      continue;
    }

    if (baselineData.status !== 'success' || currentData.status !== 'success') {
      if (baselineData.status === 'error' && currentData.status === 'success') {
        details.push({
          diagram: diagramName,
          status: 'fixed',
          message: 'Now compiles successfully',
        });
      }
      continue;
    }

    // Compare metrics
    const metrics = {};
    const baselineMetrics = baselineData.metrics || {};
    const currentMetrics = currentData.metrics || {};

    let diagramHasViolations = false;

    for (const [metricName, baselineValue] of Object.entries(baselineMetrics)) {
      const currentValue = currentMetrics[metricName];
      if (currentValue === undefined) {
        continue;
      }

      const delta = currentValue - baselineValue;
      const tolerance = TOLERANCES[metricName];

      if (tolerance === -1) {
        continue;
      }

      let isViolation = false;

      if (tolerance !== Infinity) {
        if (tolerance < 1) {
          const percentDelta = delta / baselineValue;
          if (percentDelta > tolerance) {
            isViolation = true;
          }
        } else {
          if (delta > tolerance) {
            isViolation = true;
          }
        }
      }

      if (isViolation) {
        diagramHasViolations = true;
        violations.push({
          diagram: diagramName,
          metric: metricName,
          baseline: baselineValue,
          current: currentValue,
          delta: delta.toFixed(2),
          type: 'METRIC_VIOLATION',
        });
      }

      let deltaStr;
      if (tolerance < 1 && tolerance > 0) {
        const percentDelta = ((delta / baselineValue) * 100).toFixed(1);
        deltaStr = `${delta > 0 ? '+' : ''}${delta.toFixed(2)} (${percentDelta}%)`;
      } else {
        deltaStr = `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`;
      }

      metrics[metricName] = {
        baseline: baselineValue,
        current: currentValue,
        delta: deltaStr,
        violation: isViolation,
      };
    }

    if (Object.keys(metrics).length > 0) {
      details.push({
        diagram: diagramName,
        status: diagramHasViolations ? 'violation' : 'success',
        metrics,
      });
    }
  }

  // Build report
  const report = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    totalDiagrams: successCount + errorCount,
    successCount,
    errorCount,
    hasViolations: violations.length > 0,
    violations,
    details,
  };

  console.log(JSON.stringify(report, null, 2));

  process.exit(violations.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(2);
});
