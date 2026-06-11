import { describe, it, expect } from 'vitest';
import { validateRepoModel } from '../validate-repo.js';
import type { RepoDoc, RepoModelInput } from '../types.js';

function el(path: string, data: Record<string, unknown> | null, parseError?: string): RepoDoc {
  return { path, data, parseError };
}

/** A small clean model mirroring the acme_corp shape: relations use `from`/`to`
 *  and every endpoint resolves to an element. Should produce zero findings —
 *  the parity bar against lint.py on the worked example. */
function cleanModel(): RepoModelInput {
  return {
    elements: [
      el('canon/elements/01_motivation/goals/GOAL-OPS-1.yaml', { notation: 'goal', id: 'GOAL-OPS-1' }),
      el('canon/elements/01_motivation/assessments/ASSESSMENT-1.yaml', { notation: 'assessment', id: 'ASSESSMENT-1' }),
      el('canon/elements/02_business/capabilities/CAPABILITY-V1.yaml', { notation: 'capability', id: 'CAPABILITY-V1' }),
      // sidecar with no `id` — must be ignored (no duplicate, not an element)
      el('canon/elements/02_business/capabilities/CAPABILITY-V1.history.yaml', { target: 'CAPABILITY-V1', attribute_versions: [] }),
    ],
    relations: [
      el('canon/relations/REL-1.yaml', { notation: 'relation', id: 'REL-1', from: 'ASSESSMENT-1', to: 'GOAL-OPS-1' }),
    ],
  };
}

describe('validateRepoModel — parity / clean tree', () => {
  it('produces zero findings on a clean model (acme_corp parity)', () => {
    expect(validateRepoModel(cleanModel())).toEqual([]);
  });

  it('ignores sidecar docs without an id (no false duplicate)', () => {
    const findings = validateRepoModel(cleanModel());
    expect(findings.filter((f) => f.message.includes('Duplicate'))).toEqual([]);
  });

  it('every finding carries the frozen { scope, id, message } shape', () => {
    const model = cleanModel();
    model.relations.push(el('canon/relations/REL-BAD.yaml', { notation: 'relation', id: 'REL-BAD', from: 'NOPE', to: 'GOAL-OPS-1' }));
    const findings = validateRepoModel(model);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(Object.keys(f).sort()).toEqual(['id', 'message', 'scope']);
      expect(f.scope).toBe('repo');
    }
  });
});

describe('validateRepoModel — referential integrity', () => {
  it('flags a relation whose `from` endpoint is unknown', () => {
    const model = cleanModel();
    model.relations = [el('canon/relations/REL-X.yaml', { notation: 'relation', id: 'REL-X', from: 'MISSING-1', to: 'GOAL-OPS-1' })];
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'REL-X' });
    expect(findings[0].message).toContain('MISSING-1');
    expect(findings[0].message).toContain('(from)');
  });

  it('flags a relation whose `to` endpoint is unknown', () => {
    const model = cleanModel();
    model.relations = [el('canon/relations/REL-Y.yaml', { notation: 'relation', id: 'REL-Y', from: 'GOAL-OPS-1', to: 'MISSING-2' })];
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('(to)');
  });

  it('accepts lint.py-style `source`/`target` endpoint keys', () => {
    const model = cleanModel();
    model.relations = [el('canon/relations/REL-ST.yaml', { id: 'REL-ST', source: 'ASSESSMENT-1', target: 'GOAL-OPS-1' })];
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('resolves `{ id }` object endpoints', () => {
    const model = cleanModel();
    model.relations = [el('canon/relations/REL-OBJ.yaml', { id: 'REL-OBJ', from: { id: 'ASSESSMENT-1' }, to: { id: 'GOAL-OPS-1' } })];
    expect(validateRepoModel(model)).toEqual([]);
  });
});

describe('validateRepoModel — atomicity', () => {
  it('flags an element file that contains an inline `relations` section', () => {
    const model = cleanModel();
    model.elements.push(el('canon/elements/02_business/E.yaml', { id: 'ELEMENT-1', relations: [{ to: 'GOAL-OPS-1' }] }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'ELEMENT-1' });
    expect(findings[0].message).toContain('Atomicity');
  });
});

describe('validateRepoModel — id uniqueness', () => {
  it('flags the same id defined in two files', () => {
    const model = cleanModel();
    model.elements.push(el('canon/elements/dupe-a.yaml', { id: 'DUP-1' }));
    model.elements.push(el('canon/elements/dupe-b.yaml', { id: 'DUP-1' }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'DUP-1' });
    expect(findings[0].message).toContain('dupe-a.yaml');
    expect(findings[0].message).toContain('dupe-b.yaml');
  });

  it('flags an element/relation id collision across zones', () => {
    const model = cleanModel();
    model.elements.push(el('canon/elements/clash.yaml', { id: 'CLASH-1' }));
    model.relations.push(el('canon/relations/clash.yaml', { id: 'CLASH-1', from: 'GOAL-OPS-1', to: 'ASSESSMENT-1' }));
    const findings = validateRepoModel(model);
    expect(findings.filter((f) => f.id === 'CLASH-1')).toHaveLength(1);
  });
});

describe('validateRepoModel — policy', () => {
  it('flags an Active element with no owner', () => {
    const model = cleanModel();
    model.elements.push(el('canon/elements/svc.yaml', { id: 'SVC-1', metadata: { status: 'Active' } }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'SVC-1' });
    expect(findings[0].message).toContain('Policy');
  });

  it('does not flag an Active element that has an owner', () => {
    const model = cleanModel();
    model.elements.push(el('canon/elements/svc.yaml', { id: 'SVC-2', metadata: { status: 'Active', owner: 'team-a' } }));
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('does not flag elements using the canon admission record (no metadata.status)', () => {
    // acme_corp elements use `zone`/`admitted_by`, not `metadata.status` — must not fire.
    const model = cleanModel();
    model.elements.push(el('canon/elements/g.yaml', { id: 'GOAL-X', zone: 'canon', admitted_by: 'v.korobeinikov' }));
    expect(validateRepoModel(model)).toEqual([]);
  });
});

describe('validateRepoModel — syntax', () => {
  it('reports a parse error and skips graph checks', () => {
    const model = cleanModel();
    model.elements.push(el('canon/elements/broken.yaml', null, 'bad indentation'));
    // also add a dangling relation that would otherwise fire — it must be suppressed
    model.relations.push(el('canon/relations/REL-Z.yaml', { id: 'REL-Z', from: 'MISSING', to: 'GOAL-OPS-1' }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: '' });
    expect(findings[0].message).toContain('YAML syntax error');
    expect(findings[0].message).toContain('broken.yaml');
  });
});
