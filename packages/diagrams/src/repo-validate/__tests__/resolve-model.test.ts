import { describe, it, expect } from 'vitest';
import { resolveRepoModel } from '../resolve-model.js';
import type { RepoDoc, RepoModelInput } from '../types.js';

function el(path: string, data: Record<string, unknown> | null, parseError?: string): RepoDoc {
  return { path, data, parseError };
}

describe('resolveRepoModel — elements', () => {
  it('resolves id/name/notation/type/layer/sourceFile from an admitted element', () => {
    const doc = {
      notation: 'driver',
      id: 'DRIVER-COMP-1',
      name: 'Support response time',
      type: 'internal',
    };
    const model: RepoModelInput = {
      elements: [el('canon/elements/01_motivation/factors/DRIVER-COMP-1.yaml', doc)],
      relations: [],
    };
    const { elements } = resolveRepoModel(model);
    expect(elements).toEqual([
      {
        id: 'DRIVER-COMP-1',
        name: 'Support response time',
        notation: 'driver',
        type: 'internal',
        layer: 'motivation',
        sourceFile: 'canon/elements/01_motivation/factors/DRIVER-COMP-1.yaml',
        data: doc,
      },
    ]);
  });

  it('carries every canon-authored field on `data`, not just the minimal identity set', () => {
    const doc = {
      notation: 'goal',
      id: 'GOAL-CUST-1',
      name: 'Improve customer onboarding experience',
      type: 'Strategic Goal',
      level: 1,
      parent: 'GOAL-ROOT-1',
      description: 'Reduce time-to-value for new customers.',
      link: 'https://wiki.example.com/onboarding',
      tags: ['customer', 'q3'],
      zone: 'canon',
      admitted_at: '2026-05-29',
    };
    const model: RepoModelInput = {
      elements: [el('canon/elements/01_motivation/goals/GOAL-CUST-1.yaml', doc)],
      relations: [],
    };
    expect(resolveRepoModel(model).elements[0].data).toEqual(doc);
  });

  it('prefers an explicit `layer` field over the folder-derived one', () => {
    const model: RepoModelInput = {
      elements: [
        el('canon/elements/02_business/capabilities/CAPABILITY-V1.yaml', {
          notation: 'capability',
          id: 'CAPABILITY-V1',
          name: 'Order management',
          layer: 'business-explicit',
        }),
      ],
      relations: [],
    };
    expect(resolveRepoModel(model).elements[0].layer).toBe('business-explicit');
  });

  it('omits `type` when the doc has none', () => {
    const model: RepoModelInput = {
      elements: [el('canon/elements/01_motivation/goals/GOAL-OPS-1.yaml', { notation: 'goal', id: 'GOAL-OPS-1', name: 'Ops goal' })],
      relations: [],
    };
    expect(resolveRepoModel(model).elements[0].type).toBeUndefined();
  });

  it('defaults `name` to an empty string when absent', () => {
    const model: RepoModelInput = {
      elements: [el('canon/elements/01_motivation/goals/GOAL-NONAME.yaml', { notation: 'goal', id: 'GOAL-NONAME' })],
      relations: [],
    };
    expect(resolveRepoModel(model).elements[0].name).toBe('');
  });

  it('skips a sidecar doc with no top-level id', () => {
    const model: RepoModelInput = {
      elements: [
        el('canon/elements/02_business/capabilities/CAPABILITY-V1.history.yaml', {
          target: 'CAPABILITY-V1',
          attribute_versions: [],
        }),
      ],
      relations: [],
    };
    expect(resolveRepoModel(model).elements).toEqual([]);
  });

  it('skips a doc that failed to parse (null data)', () => {
    const model: RepoModelInput = {
      elements: [el('canon/elements/broken.yaml', null, 'bad indentation')],
      relations: [],
    };
    expect(resolveRepoModel(model).elements).toEqual([]);
  });

  it('leaves `layer` undefined when the path has no `<NN>_<layer>` folder segment', () => {
    const model: RepoModelInput = {
      elements: [el('canon/elements/flat.yaml', { notation: 'goal', id: 'GOAL-FLAT', name: 'Flat' })],
      relations: [],
    };
    expect(resolveRepoModel(model).elements[0].layer).toBeUndefined();
  });
});

describe('resolveRepoModel — relations', () => {
  it('resolves id/kind/source/target/sourceFile from a canonical from/to relation', () => {
    const model: RepoModelInput = {
      elements: [],
      relations: [
        el('canon/relations/REL-EMP-PERSON-OPS-1.yaml', {
          notation: 'relation',
          id: 'REL-EMP-PERSON-OPS-1',
          type: 'employment',
          from: 'ACTOR-PERSON-1',
          to: 'ACTOR-OPS-1',
        }),
      ],
    };
    expect(resolveRepoModel(model).relations).toEqual([
      {
        id: 'REL-EMP-PERSON-OPS-1',
        kind: 'employment',
        source: 'ACTOR-PERSON-1',
        target: 'ACTOR-OPS-1',
        sourceFile: 'canon/relations/REL-EMP-PERSON-OPS-1.yaml',
      },
    ]);
  });

  it('accepts the legacy source/target endpoint keys', () => {
    const model: RepoModelInput = {
      elements: [],
      relations: [el('canon/relations/REL-ST.yaml', { id: 'REL-ST', source: 'A-1', target: 'B-1' })],
    };
    const rec = resolveRepoModel(model).relations[0];
    expect(rec.source).toBe('A-1');
    expect(rec.target).toBe('B-1');
  });

  it('resolves `{ id }` object endpoints', () => {
    const model: RepoModelInput = {
      elements: [],
      relations: [el('canon/relations/REL-OBJ.yaml', { id: 'REL-OBJ', from: { id: 'A-1' }, to: { id: 'B-1' } })],
    };
    const rec = resolveRepoModel(model).relations[0];
    expect(rec.source).toBe('A-1');
    expect(rec.target).toBe('B-1');
  });

  it('omits a relation whose `from` endpoint does not resolve', () => {
    const model: RepoModelInput = {
      elements: [],
      relations: [el('canon/relations/REL-BAD.yaml', { id: 'REL-BAD', to: 'B-1' })],
    };
    expect(resolveRepoModel(model).relations).toEqual([]);
  });

  it('omits a relation whose `to` endpoint does not resolve', () => {
    const model: RepoModelInput = {
      elements: [],
      relations: [el('canon/relations/REL-BAD.yaml', { id: 'REL-BAD', from: 'A-1' })],
    };
    expect(resolveRepoModel(model).relations).toEqual([]);
  });

  it('defaults `id` to an empty string when the relation doc has none, but still resolves', () => {
    const model: RepoModelInput = {
      elements: [],
      relations: [el('canon/relations/no-id.yaml', { from: 'A-1', to: 'B-1' })],
    };
    const rec = resolveRepoModel(model).relations[0];
    expect(rec.id).toBe('');
    expect(rec.source).toBe('A-1');
  });

  it('omits `kind` when the relation doc has no `type`', () => {
    const model: RepoModelInput = {
      elements: [],
      relations: [el('canon/relations/no-type.yaml', { id: 'REL-NT', from: 'A-1', to: 'B-1' })],
    };
    expect(resolveRepoModel(model).relations[0].kind).toBeUndefined();
  });

  it('skips a relation doc that failed to parse (null data)', () => {
    const model: RepoModelInput = {
      elements: [],
      relations: [el('canon/relations/broken.yaml', null, 'bad indentation')],
    };
    expect(resolveRepoModel(model).relations).toEqual([]);
  });
});
