import { describe, expect, it } from 'vitest';

import {
  evaluateReleaseVersions,
  pickPreviousReleaseTag,
  selectDiagramsSrcChanges,
} from '../scripts/release-version-guards.mjs';

describe('selectDiagramsSrcChanges', () => {
  it('keeps non-test files under packages/diagrams/src', () => {
    expect(
      selectDiagramsSrcChanges(['packages/diagrams/src/render-goals.ts', 'packages/diagrams/src/layout/grid.ts']),
    ).toEqual(['packages/diagrams/src/render-goals.ts', 'packages/diagrams/src/layout/grid.ts']);
  });

  it('drops test files — they ship with neither package', () => {
    expect(
      selectDiagramsSrcChanges([
        'packages/diagrams/src/__tests__/render-goals.ts',
        'packages/diagrams/src/render-goals.test.ts',
        'packages/diagrams/src/render-goals.test.tsx',
      ]),
    ).toEqual([]);
  });

  it('drops files outside packages/diagrams/src', () => {
    expect(
      selectDiagramsSrcChanges(['src/cli.ts', 'packages/cli/src/index.ts', 'packages/diagrams/package.json']),
    ).toEqual([]);
  });
});

describe('pickPreviousReleaseTag', () => {
  it('picks the newest tag strictly older than the current one', () => {
    expect(pickPreviousReleaseTag(['v3.1.0', 'v3.1.1', 'v3.1.2'], 'v3.1.2')).toBe('v3.1.1');
  });

  it('orders by semver precedence, not lexically', () => {
    expect(pickPreviousReleaseTag(['v3.1.9', 'v3.1.10', 'v3.2.0'], 'v3.2.0')).toBe('v3.1.10');
  });

  it('is independent of input order', () => {
    expect(pickPreviousReleaseTag(['v3.0.2', 'v3.1.1', 'v3.0.9'], 'v3.1.1')).toBe('v3.0.9');
  });

  it('ignores tags that are not vX.Y.Z', () => {
    expect(pickPreviousReleaseTag(['v3.1.0', 'vscode-3.1.1', 'nightly'], 'v3.1.2')).toBe('v3.1.0');
  });

  it('returns null when the current tag is the only release', () => {
    expect(pickPreviousReleaseTag(['v1.0.0'], 'v1.0.0')).toBeNull();
  });

  it('returns the newest tag overall when no current tag is given', () => {
    expect(pickPreviousReleaseTag(['v3.1.0', 'v3.1.2', 'v3.1.1'], null)).toBe('v3.1.2');
  });
});

describe('evaluateReleaseVersions', () => {
  const clean = {
    diagramsSrcChanges: [],
    previousDiagramsVersion: '1.9.15',
    releaseDiagramsVersion: '1.9.15',
    previousCliVersion: '2.4.15',
    releaseCliVersion: '2.4.15',
  };

  it('passes a release that changed neither package', () => {
    expect(evaluateReleaseVersions(clean)).toEqual([]);
  });

  it('fails, naming @transitrix/diagrams, when src changed but its version did not', () => {
    const failures = evaluateReleaseVersions({
      ...clean,
      diagramsSrcChanges: ['packages/diagrams/src/render-goals.ts'],
    });
    expect(failures).toHaveLength(1);
    expect(failures[0].package).toBe('@transitrix/diagrams');
    expect(failures[0].details).toEqual(['packages/diagrams/src/render-goals.ts']);
  });

  it('fails, naming @transitrix/cli, when diagrams moved and cli did not', () => {
    const failures = evaluateReleaseVersions({
      ...clean,
      diagramsSrcChanges: ['packages/diagrams/src/render-goals.ts'],
      releaseDiagramsVersion: '1.9.16',
    });
    expect(failures).toHaveLength(1);
    expect(failures[0].package).toBe('@transitrix/cli');
  });

  it('passes when both versions moved with the src change', () => {
    expect(
      evaluateReleaseVersions({
        ...clean,
        diagramsSrcChanges: ['packages/diagrams/src/render-goals.ts'],
        releaseDiagramsVersion: '1.9.16',
        releaseCliVersion: '2.4.16',
      }),
    ).toEqual([]);
  });

  it('still requires the cli bump when diagrams moved without any src change', () => {
    const failures = evaluateReleaseVersions({ ...clean, releaseDiagramsVersion: '1.9.16' });
    expect(failures).toHaveLength(1);
    expect(failures[0].package).toBe('@transitrix/cli');
  });

  it('does not fault the cli when diagrams stood still but cli moved on its own', () => {
    // packages/cli has its own semver line; a cli-only bump is legitimate and
    // must not be reported just because a diagrams failure is also present.
    const failures = evaluateReleaseVersions({
      ...clean,
      diagramsSrcChanges: ['packages/diagrams/src/a.ts'],
      releaseCliVersion: '2.4.16',
    });
    expect(failures.map((f) => f.package)).toEqual(['@transitrix/diagrams']);
  });
});
