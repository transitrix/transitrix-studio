import { describe, it, expect } from 'vitest';
import { statementLines, parseMigrationManifest, checkSuspicion } from '../link-suspicion.js';

describe('statementLines', () => {
  it('drops envelope fields and their continuation lines', () => {
    const text = [
      'notation: requirement',
      'id: REQUIREMENT-X-1',
      'name: "x"',
      'zone: canon',
      'admitted_at: "2026-08-04"',
      'admitted_by: "v.korobeinikov"',
      'gate_checks:',
      '  uniqueness: pass',
      '  consistency: pass',
      'valid_from: "2026-08-04"',
      'valid_to: null',
    ].join('\n');
    expect(statementLines(text)).toEqual(['id: REQUIREMENT-X-1', 'name: "x"', 'notation: requirement']);
  });

  it('is order-independent, formatting-independent, and comment-independent', () => {
    const a = 'name: "x"\ndescription: "d"   \n# a comment\n';
    const b = 'description: "d"\nname: "x"\n';
    expect(statementLines(a)).toEqual(statementLines(b));
  });

  it('ignores blank lines', () => {
    expect(statementLines('name: "x"\n\n\ndescription: "d"\n')).toEqual(['description: "d"', 'name: "x"']);
  });
});

describe('parseMigrationManifest', () => {
  it('parses mechanical, applies_to, and line_edits', () => {
    const text = [
      'mechanical: true',
      'applies_to:',
      '  - canon/elements/01_motivation/requirements/REQUIREMENT-DATA-ERASURE-1.yaml',
      'line_edits:',
      '  - from: "owner_role: ROLE-OLD-1"',
      '    to: "owner_role: ROLE-NEW-1"',
    ].join('\n');
    const manifest = parseMigrationManifest(text);
    expect(manifest.mechanical).toBe(true);
    expect(manifest.appliesTo).toEqual(['canon/elements/01_motivation/requirements/REQUIREMENT-DATA-ERASURE-1.yaml']);
    expect(manifest.lineEdits).toEqual([{ from: 'owner_role: ROLE-OLD-1', to: 'owner_role: ROLE-NEW-1' }]);
  });

  it('defaults to non-mechanical with empty lists when absent', () => {
    expect(parseMigrationManifest('')).toEqual({ mechanical: false, appliesTo: [], lineEdits: [] });
  });
});

describe('checkSuspicion', () => {
  it('is not suspicious when before/after content identity is unchanged', () => {
    const before = 'name: "x"\ndescription: "d"\nzone: canon\n';
    const after = 'description: "d"\nname: "x"\nzone: canon\n# reformatted, same statement\n';
    expect(checkSuspicion(before, after)).toEqual({ suspicious: false });
  });

  it('is not suspicious when before or after is unresolvable (no anchor / target absent)', () => {
    expect(checkSuspicion(undefined, 'name: "x"\n')).toEqual({ suspicious: false });
    expect(checkSuspicion('name: "x"\n', undefined)).toEqual({ suspicious: false });
  });

  it('is suspicious when the statement changed and no manifest explains it', () => {
    const before = 'name: "x"\ndescription: "old"\n';
    const after = 'name: "x"\ndescription: "new"\n';
    expect(checkSuspicion(before, after)).toEqual({ suspicious: true, hatchRefused: false });
  });

  it('is not suspicious when a manifest replay exactly explains the change (§16.3 hatch)', () => {
    const before = 'name: "x"\nowner_role: ROLE-OLD-1\n';
    const after = 'name: "x"\nowner_role: ROLE-NEW-1\n';
    const manifest = { mechanical: true, appliesTo: [], lineEdits: [{ from: 'owner_role: ROLE-OLD-1', to: 'owner_role: ROLE-NEW-1' }] };
    expect(checkSuspicion(before, after, [manifest])).toEqual({ suspicious: false });
  });

  it('stays suspicious, with hatchRefused, when a mechanical manifest does not fully explain the change', () => {
    const before = 'name: "x"\nowner_role: ROLE-OLD-1\n';
    const after = 'name: "y"\nowner_role: ROLE-NEW-1\n'; // an undeclared edit (name) alongside the declared one
    const manifest = { mechanical: true, appliesTo: [], lineEdits: [{ from: 'owner_role: ROLE-OLD-1', to: 'owner_role: ROLE-NEW-1' }] };
    expect(checkSuspicion(before, after, [manifest])).toEqual({ suspicious: true, hatchRefused: true });
  });

  it('a non-mechanical manifest that happens to replay-match still suppresses suspicion — the replay is the proof, not the flag', () => {
    const before = 'name: "x"\nowner_role: ROLE-OLD-1\n';
    const after = 'name: "x"\nowner_role: ROLE-NEW-1\n';
    const manifest = { mechanical: false, appliesTo: [], lineEdits: [{ from: 'owner_role: ROLE-OLD-1', to: 'owner_role: ROLE-NEW-1' }] };
    expect(checkSuspicion(before, after, [manifest])).toEqual({ suspicious: false });
  });
});
