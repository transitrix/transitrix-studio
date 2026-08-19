import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleExportComplianceCommand } from '../src/export-compliance.js';

// transitrix-hq#218 — a vendored/sibling copy of the methodology's bundled
// worked examples under `notations/examples/**` is a complete, admission-
// stamped document, indistinguishable from adopter canon by the `zone: canon`
// admission check alone. A zero-config scan must not absorb those example
// subjects, and two documents that do claim the same id must not silently
// render as two columns.

describe('export-compliance: vendored methodology examples and duplicate ids', () => {
  let dir: string;
  let canonDir: string;
  let outFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'export-compliance-vendored-test-'));
    canonDir = join(dir, 'canon');
    mkdirSync(canonDir, { recursive: true });
    outFile = join(dir, 'out.md');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const admittedProduct = (id: string, name: string) => [
    'notation: product',
    `id: ${id}`,
    `name: "${name}"`,
    'zone: canon',
    'admitted_at: "2026-05-28"',
    'admitted_by: "v.korobeinikov"',
  ].join('\n');

  const admittedRequirement = [
    'notation: requirement',
    'id: REQUIREMENT-1',
    'name: "A requirement"',
    'severity: high',
    'zone: canon',
    'admitted_at: "2026-05-28"',
    'admitted_by: "v.korobeinikov"',
  ].join('\n');

  it('excludes an admission-stamped product under a vendored notations/examples/ tree', async () => {
    writeFileSync(join(canonDir, 'real.product.transitrix.yaml'), admittedProduct('PRODUCT-REAL-1', 'Real Product'));
    writeFileSync(join(canonDir, 'requirement.transitrix.yaml'), admittedRequirement);

    const vendoredDir = join(dir, 'vendor', 'methodology', 'notations', 'examples', 'bpmn', 'canon', 'products');
    mkdirSync(vendoredDir, { recursive: true });
    writeFileSync(join(vendoredDir, 'example.product.transitrix.yaml'), admittedProduct('PRODUCT-EXAMPLE-1', 'Example Product'));

    await handleExportComplianceCommand(['--scope', 'matrix', '--root', dir, '--format', 'md', '--output', outFile]);

    const written = readFileSync(outFile, 'utf-8');
    expect(written).toContain('Real Product');
    expect(written).not.toContain('Example Product');
    expect(written).not.toContain('PRODUCT-EXAMPLE-1');
    expect(written).toContain('_1 products');
  });

  it('drops a duplicate product id and prints a diagnostic instead of a second column', async () => {
    writeFileSync(join(canonDir, 'first.product.transitrix.yaml'), admittedProduct('PRODUCT-DUP-1', 'First Copy'));
    writeFileSync(join(canonDir, 'second.product.transitrix.yaml'), admittedProduct('PRODUCT-DUP-1', 'Second Copy'));
    writeFileSync(join(canonDir, 'requirement.transitrix.yaml'), admittedRequirement);

    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleExportComplianceCommand(['--scope', 'matrix', '--root', dir, '--format', 'md', '--output', outFile]);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('PRODUCT-DUP-1'));
    warn.mockRestore();

    const written = readFileSync(outFile, 'utf-8');
    expect(written).toContain('_1 products');
    const productLines = written.split('\n').filter(l => l.includes('Copy'));
    expect(productLines).toHaveLength(1);
  });
});
