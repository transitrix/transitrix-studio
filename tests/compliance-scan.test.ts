import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));
import { join, sep } from 'node:path';
import {
  resolveComplianceScanScope,
  classifyScanMiss,
  shortWorkspacePath,
  complianceScanWarnings,
  WORKSPACE_COMPLIANCE_INCLUDE,
  WORKSPACE_COMPLIANCE_EXCLUDE,
  type ScannedCanon,
} from '../extension/src/compliance-scan.js';
import { emptyCanon } from '@transitrix/diagrams/compliance';

describe('resolveComplianceScanScope', () => {
  it('scopes to the nearest canon/ directory and its sibling codex/', () => {
    const filePath = ['', 'org', 'canon', 'views', 'compliance-impact', 'eu.yaml'].join(sep);
    expect(resolveComplianceScanScope(filePath)).toEqual({
      kind: 'scoped',
      roots: [
        ['', 'org', 'canon'].join(sep),
        ['', 'org', 'codex'].join(sep),
      ],
    });
  });

  it('finds canon/ several levels above the file', () => {
    const filePath = ['', 'org', 'canon', 'elements', 'a', 'b', 'REQ-1.yaml'].join(sep);
    const scope = resolveComplianceScanScope(filePath);
    expect(scope.kind).toBe('scoped');
    if (scope.kind === 'scoped') {
      expect(scope.roots[0]).toBe(['', 'org', 'canon'].join(sep));
      expect(scope.roots[1]).toBe(['', 'org', 'codex'].join(sep));
    }
  });

  it('falls back to a workspace glob when no ancestor is named canon/', () => {
    const filePath = ['', 'org', 'views', 'eu.yaml'].join(sep);
    expect(resolveComplianceScanScope(filePath)).toEqual({ kind: 'workspace' });
  });

  it('falls back to a workspace glob when the path is omitted', () => {
    expect(resolveComplianceScanScope()).toEqual({ kind: 'workspace' });
    expect(resolveComplianceScanScope(undefined)).toEqual({ kind: 'workspace' });
  });
});

describe('workspace compliance globs', () => {
  it('search only canon/ and codex/ trees', () => {
    expect(WORKSPACE_COMPLIANCE_INCLUDE).toContain('{canon,codex}');
  });

  it('exclude tooling and fixture trees', () => {
    expect(WORKSPACE_COMPLIANCE_EXCLUDE).toContain('node_modules');
    expect(WORKSPACE_COMPLIANCE_EXCLUDE).toContain('.archive');
    expect(WORKSPACE_COMPLIANCE_EXCLUDE).toContain('packages');
    expect(WORKSPACE_COMPLIANCE_EXCLUDE).toContain('tests/fixtures');
  });
});

describe('classifyScanMiss', () => {
  it('labels a second document with the same id as a duplicate', () => {
    expect(classifyScanMiss({ notation: 'requirement', id: 'REQUIREMENT-1' }, true)).toBe('duplicate');
  });

  it('does not call a duplicate an unrecognized notation', () => {
    expect(classifyScanMiss({ notation: 'product', id: 'PRODUCT-1' }, true)).not.toBe('unrecognized');
  });

  it('warns on a notation typo', () => {
    expect(classifyScanMiss({ notation: 'asssertion', id: 'ASSERTION-1' }, false)).toBe('unrecognized');
  });

  it('stays silent on known non-compliance element notations', () => {
    for (const notation of ['risk', 'metric', 'location', 'business-service', 'node', 'fgca', 'release']) {
      expect(classifyScanMiss({ notation, id: 'X-1' }, false), notation).toBeUndefined();
    }
  });

  it('stays silent on incomplete compliance artefacts (missing fields, not a typo)', () => {
    expect(classifyScanMiss({ notation: 'assertion', id: 'ASSERTION-1' }, false)).toBeUndefined();
  });

  it('ignores documents without both id and notation', () => {
    expect(classifyScanMiss({ notation: 'mystery' }, false)).toBeUndefined();
    expect(classifyScanMiss({ id: 'X-1' }, false)).toBeUndefined();
    expect(classifyScanMiss(null, false)).toBeUndefined();
  });
});

describe('shortWorkspacePath', () => {
  it('strips the workspace root prefix', () => {
    const root = join('', 'repo');
    const file = join(root, 'canon', 'elements', 'REQ-1.yaml');
    expect(shortWorkspacePath(file, root)).toBe(join('canon', 'elements', 'REQ-1.yaml'));
  });

  it('returns the original path when the file is outside the workspace', () => {
    expect(shortWorkspacePath(join('', 'other', 'x.yaml'), join('', 'repo'))).toBe(join('', 'other', 'x.yaml'));
  });
});

describe('complianceScanWarnings', () => {
  it('renders duplicate diagnostics before unrecognized-notation ones', () => {
    const scan: ScannedCanon = {
      ...emptyCanon(),
      pathById: new Map(),
      skippedDuplicates: [{ shortPath: 'canon/a.yaml', id: 'PRODUCT-1' }],
      skippedNotations: [{ shortPath: 'canon/b.yaml', notation: 'asssertion' }],
    };
    expect(complianceScanWarnings(scan)).toEqual([
      'Skipped — duplicate id "PRODUCT-1": canon/a.yaml',
      'Skipped — unrecognized notation "asssertion": canon/b.yaml',
    ]);
  });
});
