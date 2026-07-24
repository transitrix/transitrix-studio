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

  it('every finding carries { scope, id, message } plus an optional ruleId', () => {
    const model = cleanModel();
    model.relations.push(el('canon/relations/REL-BAD.yaml', { notation: 'relation', id: 'REL-BAD', from: 'NOPE', to: 'GOAL-OPS-1' }));
    const findings = validateRepoModel(model);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      const keys = Object.keys(f).filter((k) => k !== 'ruleId').sort();
      expect(keys).toEqual(['id', 'message', 'scope']);
      expect(f.scope).toBe('repo');
      if ('ruleId' in f) expect(typeof f.ruleId).toBe('string');
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

describe('validateRepoModel — layer-semantics (unit_located_at / located_at)', () => {
  function locationModel() {
    const model = cleanModel();
    model.elements.push(
      el('canon/elements/02_business/actors/ACTOR-OPS-1.yaml', {
        notation: 'actor',
        id: 'ACTOR-OPS-1',
        type: 'business_unit',
      }),
      el('canon/elements/02_business/actors/ACTOR-JANE-1.yaml', {
        notation: 'actor',
        id: 'ACTOR-JANE-1',
        type: 'person',
      }),
      el('canon/elements/02_business/locations/LOCATION-TBILISI-1.yaml', {
        notation: 'location',
        id: 'LOCATION-TBILISI-1',
      }),
    );
    return model;
  }

  it('accepts a valid unit_located_at (business_unit → LOCATION)', () => {
    const model = locationModel();
    model.relations.push(
      el('canon/relations/REL-LOC-1.yaml', {
        notation: 'relation',
        id: 'REL-LOC-1',
        type: 'unit_located_at',
        from: 'ACTOR-OPS-1',
        to: 'LOCATION-TBILISI-1',
      }),
    );
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('accepts a valid located_at for a business_unit', () => {
    const model = locationModel();
    model.relations.push(
      el('canon/relations/REL-LOC-2.yaml', {
        notation: 'relation',
        id: 'REL-LOC-2',
        type: 'located_at',
        from: 'ACTOR-OPS-1',
        to: 'LOCATION-TBILISI-1',
      }),
    );
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('accepts a valid located_at for a person', () => {
    const model = locationModel();
    model.relations.push(
      el('canon/relations/REL-LOC-3.yaml', {
        notation: 'relation',
        id: 'REL-LOC-3',
        type: 'located_at',
        from: 'ACTOR-JANE-1',
        to: 'LOCATION-TBILISI-1',
      }),
    );
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('flags unit_located_at with a wrong from type (person instead of business_unit)', () => {
    const model = locationModel();
    model.relations.push(
      el('canon/relations/REL-BAD-1.yaml', {
        notation: 'relation',
        id: 'REL-BAD-1',
        type: 'unit_located_at',
        from: 'ACTOR-JANE-1',
        to: 'LOCATION-TBILISI-1',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'REL-BAD-1' });
    expect(findings[0].message).toContain('unit_located_at');
    expect(findings[0].message).toContain('business_unit');
  });

  it('flags unit_located_at with a non-ACTOR from element', () => {
    const model = locationModel();
    model.relations.push(
      el('canon/relations/REL-BAD-2.yaml', {
        notation: 'relation',
        id: 'REL-BAD-2',
        type: 'unit_located_at',
        from: 'GOAL-OPS-1',
        to: 'LOCATION-TBILISI-1',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'REL-BAD-2' });
    expect(findings[0].message).toContain('unit_located_at');
  });

  it('flags unit_located_at with a non-LOCATION to element', () => {
    const model = locationModel();
    model.relations.push(
      el('canon/relations/REL-BAD-3.yaml', {
        notation: 'relation',
        id: 'REL-BAD-3',
        type: 'unit_located_at',
        from: 'ACTOR-OPS-1',
        to: 'GOAL-OPS-1',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'REL-BAD-3' });
    expect(findings[0].message).toContain('LOCATION');
  });

  it('flags located_at with a non-actor from element', () => {
    const model = locationModel();
    model.relations.push(
      el('canon/relations/REL-BAD-4.yaml', {
        notation: 'relation',
        id: 'REL-BAD-4',
        type: 'located_at',
        from: 'CAPABILITY-V1',
        to: 'LOCATION-TBILISI-1',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'REL-BAD-4' });
    expect(findings[0].message).toContain('located_at');
  });

  it('does not emit layer-semantic findings for unknown endpoints (ref-integrity handles those)', () => {
    const model = locationModel();
    model.relations.push(
      el('canon/relations/REL-MISSING.yaml', {
        notation: 'relation',
        id: 'REL-MISSING',
        type: 'unit_located_at',
        from: 'ACTOR-UNKNOWN-99',
        to: 'LOCATION-UNKNOWN-99',
      }),
    );
    const findings = validateRepoModel(model);
    // ref-integrity fires for missing endpoints; no duplicate layer-semantic finding
    expect(findings.every((f) => !f.message.includes('Layer-semantics'))).toBe(true);
    expect(findings.some((f) => f.message.includes('ACTOR-UNKNOWN-99'))).toBe(true);
  });
});

describe('validateRepoModel — layer-semantics (offers / realizes)', () => {
  function serviceModel() {
    const model = cleanModel();
    model.elements.push(
      el('canon/elements/02_business/actors/ACTOR-OPS-1.yaml', {
        notation: 'actor',
        id: 'ACTOR-OPS-1',
        type: 'business_unit',
      }),
      el('canon/elements/02_business/roles/ROLE-OWNER-1.yaml', {
        notation: 'role',
        id: 'ROLE-OWNER-1',
      }),
      el('canon/elements/02_business/business-services/BUSINESS_SERVICE-CRM-1.yaml', {
        notation: 'business-service',
        id: 'BUSINESS_SERVICE-CRM-1',
      }),
      el('canon/elements/02_business/capabilities/CAPABILITY-V2.yaml', {
        notation: 'capability',
        id: 'CAPABILITY-V2',
      }),
    );
    return model;
  }

  it('accepts a valid offers (ACTOR(business_unit) → BUSINESS_SERVICE)', () => {
    const model = serviceModel();
    model.relations.push(
      el('canon/relations/REL-SVC-1.yaml', {
        notation: 'relation',
        id: 'REL-SVC-1',
        type: 'offers',
        from: 'ACTOR-OPS-1',
        to: 'BUSINESS_SERVICE-CRM-1',
      }),
    );
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('accepts a valid offers (ROLE → BUSINESS_SERVICE)', () => {
    const model = serviceModel();
    model.relations.push(
      el('canon/relations/REL-SVC-2.yaml', {
        notation: 'relation',
        id: 'REL-SVC-2',
        type: 'offers',
        from: 'ROLE-OWNER-1',
        to: 'BUSINESS_SERVICE-CRM-1',
      }),
    );
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('accepts a valid realizes (BUSINESS_SERVICE → CAPABILITY)', () => {
    const model = serviceModel();
    model.relations.push(
      el('canon/relations/REL-SVC-3.yaml', {
        notation: 'relation',
        id: 'REL-SVC-3',
        type: 'realizes',
        from: 'BUSINESS_SERVICE-CRM-1',
        to: 'CAPABILITY-V2',
      }),
    );
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('flags offers with a non-ACTOR/non-ROLE from element', () => {
    const model = serviceModel();
    model.relations.push(
      el('canon/relations/REL-SVC-BAD-1.yaml', {
        notation: 'relation',
        id: 'REL-SVC-BAD-1',
        type: 'offers',
        from: 'CAPABILITY-V2',
        to: 'BUSINESS_SERVICE-CRM-1',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'REL-SVC-BAD-1' });
    expect(findings[0].message).toContain('offers');
    expect(findings[0].message).toContain('ACTOR');
  });

  it('flags offers with a non-BUSINESS_SERVICE to element', () => {
    const model = serviceModel();
    model.relations.push(
      el('canon/relations/REL-SVC-BAD-2.yaml', {
        notation: 'relation',
        id: 'REL-SVC-BAD-2',
        type: 'offers',
        from: 'ACTOR-OPS-1',
        to: 'CAPABILITY-V2',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'REL-SVC-BAD-2' });
    expect(findings[0].message).toContain('BUSINESS_SERVICE');
  });

  it('flags realizes with a non-BUSINESS_SERVICE from element', () => {
    const model = serviceModel();
    model.relations.push(
      el('canon/relations/REL-SVC-BAD-3.yaml', {
        notation: 'relation',
        id: 'REL-SVC-BAD-3',
        type: 'realizes',
        from: 'ACTOR-OPS-1',
        to: 'CAPABILITY-V2',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'REL-SVC-BAD-3' });
    expect(findings[0].message).toContain('realizes');
    expect(findings[0].message).toContain('BUSINESS_SERVICE');
  });
});

describe('validateRepoModel — layer-semantics (INT-002 integration endpoints)', () => {
  function integrationModel() {
    const model = cleanModel();
    model.elements.push(
      el('canon/elements/03_application/applications/APPLICATION-OMS-1.yaml', {
        notation: 'application',
        id: 'APPLICATION-OMS-1',
      }),
      el('canon/elements/03_application/applications/APPLICATION-CRM-1.yaml', {
        notation: 'application',
        id: 'APPLICATION-CRM-1',
      }),
      el('canon/elements/02_business/actors/ACTOR-OPS-1.yaml', {
        notation: 'actor',
        id: 'ACTOR-OPS-1',
        type: 'business_unit',
      }),
    );
    return model;
  }

  it('accepts an interface_semantics integration whose endpoints resolve to APPLICATION elements', () => {
    const model = integrationModel();
    model.elements.push(
      el('canon/elements/03_application/integrations/INTEGRATION-OMS-EVENTS-1.yaml', {
        notation: 'integration',
        id: 'INTEGRATION-OMS-EVENTS-1',
        interface_semantics: true,
        source: 'APPLICATION-OMS-1',
        target: 'APPLICATION-CRM-1',
      }),
    );
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('does not fire INT-002 for an integration without interface_semantics', () => {
    const model = integrationModel();
    model.elements.push(
      el('canon/elements/03_application/integrations/INTEGRATION-PLAIN-1.yaml', {
        notation: 'integration',
        id: 'INTEGRATION-PLAIN-1',
        source: 'ACTOR-OPS-1',
        target: 'APPLICATION-CRM-1',
      }),
    );
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('flags INT-002 when source resolves to a non-APPLICATION element', () => {
    const model = integrationModel();
    model.elements.push(
      el('canon/elements/03_application/integrations/INTEGRATION-BAD-1.yaml', {
        notation: 'integration',
        id: 'INTEGRATION-BAD-1',
        interface_semantics: true,
        source: 'ACTOR-OPS-1',
        target: 'APPLICATION-CRM-1',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'INTEGRATION-BAD-1' });
    expect(findings[0].message).toContain('INT-002');
    expect(findings[0].message).toContain('ACTOR-OPS-1');
    expect(findings[0].message).toContain('source');
  });

  it('flags INT-002 when target resolves to a non-APPLICATION element', () => {
    const model = integrationModel();
    model.elements.push(
      el('canon/elements/03_application/integrations/INTEGRATION-BAD-2.yaml', {
        notation: 'integration',
        id: 'INTEGRATION-BAD-2',
        interface_semantics: true,
        source: 'APPLICATION-OMS-1',
        target: 'ACTOR-OPS-1',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'INTEGRATION-BAD-2' });
    expect(findings[0].message).toContain('INT-002');
    expect(findings[0].message).toContain('ACTOR-OPS-1');
    expect(findings[0].message).toContain('target');
  });

  it('flags INT-002 for both endpoints when neither resolves to APPLICATION', () => {
    const model = integrationModel();
    model.elements.push(
      el('canon/elements/03_application/integrations/INTEGRATION-BAD-3.yaml', {
        notation: 'integration',
        id: 'INTEGRATION-BAD-3',
        interface_semantics: true,
        source: 'ACTOR-OPS-1',
        target: 'GOAL-OPS-1',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(2);
    expect(findings.every(f => f.message.includes('INT-002'))).toBe(true);
  });

  it('does not flag INT-002 when endpoint id is not in the element registry', () => {
    // Unresolved IDs are caught by phase 4 (referential integrity), not INT-002.
    const model = integrationModel();
    model.elements.push(
      el('canon/elements/03_application/integrations/INTEGRATION-UNRESOLVED-1.yaml', {
        notation: 'integration',
        id: 'INTEGRATION-UNRESOLVED-1',
        interface_semantics: true,
        source: 'APPLICATION-MISSING-99',
        target: 'APPLICATION-CRM-1',
      }),
    );
    const findings = validateRepoModel(model).filter(f => f.message.includes('INT-002'));
    expect(findings).toHaveLength(0);
  });
});

describe('validateRepoModel — layer-semantics (hosts / uses / TSVC-003)', () => {
  function techModel() {
    const model = cleanModel();
    model.elements.push(
      el('canon/elements/04_technology/nodes/NODE-KAFKA-HOST-1.yaml', {
        notation: 'node',
        id: 'NODE-KAFKA-HOST-1',
        type: 'cloud_instance',
      }),
      el('canon/elements/04_technology/services/TECHNOLOGY_SERVICE-KAFKA-1.yaml', {
        notation: 'technology-service',
        id: 'TECHNOLOGY_SERVICE-KAFKA-1',
        type: 'messaging',
        node: 'NODE-KAFKA-HOST-1',
      }),
      el('canon/elements/03_application/applications/APPLICATION-OMS-1.yaml', {
        notation: 'application',
        id: 'APPLICATION-OMS-1',
      }),
    );
    return model;
  }

  it('accepts a valid hosts relation (NODE → TECHNOLOGY_SERVICE)', () => {
    const model = techModel();
    model.relations.push(
      el('canon/relations/REL-HOSTS-1.yaml', {
        notation: 'relation',
        id: 'REL-HOSTS-1',
        type: 'hosts',
        from: 'NODE-KAFKA-HOST-1',
        to: 'TECHNOLOGY_SERVICE-KAFKA-1',
      }),
    );
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('accepts a valid uses relation (APPLICATION → TECHNOLOGY_SERVICE)', () => {
    const model = techModel();
    model.relations.push(
      el('canon/relations/REL-USES-1.yaml', {
        notation: 'relation',
        id: 'REL-USES-1',
        type: 'uses',
        from: 'APPLICATION-OMS-1',
        to: 'TECHNOLOGY_SERVICE-KAFKA-1',
      }),
    );
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('flags hosts with a non-NODE from element', () => {
    const model = techModel();
    model.relations.push(
      el('canon/relations/REL-HOSTS-BAD-1.yaml', {
        notation: 'relation',
        id: 'REL-HOSTS-BAD-1',
        type: 'hosts',
        from: 'APPLICATION-OMS-1',
        to: 'TECHNOLOGY_SERVICE-KAFKA-1',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'REL-HOSTS-BAD-1' });
    expect(findings[0].message).toContain('hosts');
    expect(findings[0].message).toContain('NODE');
  });

  it('flags hosts with a non-TECHNOLOGY_SERVICE to element', () => {
    const model = techModel();
    model.relations.push(
      el('canon/relations/REL-HOSTS-BAD-2.yaml', {
        notation: 'relation',
        id: 'REL-HOSTS-BAD-2',
        type: 'hosts',
        from: 'NODE-KAFKA-HOST-1',
        to: 'APPLICATION-OMS-1',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'REL-HOSTS-BAD-2' });
    expect(findings[0].message).toContain('hosts');
    expect(findings[0].message).toContain('TECHNOLOGY_SERVICE');
  });

  it('flags uses with a non-APPLICATION from element', () => {
    const model = techModel();
    model.relations.push(
      el('canon/relations/REL-USES-BAD-1.yaml', {
        notation: 'relation',
        id: 'REL-USES-BAD-1',
        type: 'uses',
        from: 'NODE-KAFKA-HOST-1',
        to: 'TECHNOLOGY_SERVICE-KAFKA-1',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'REL-USES-BAD-1' });
    expect(findings[0].message).toContain('uses');
    expect(findings[0].message).toContain('APPLICATION');
  });

  it('flags uses with a non-TECHNOLOGY_SERVICE to element', () => {
    const model = techModel();
    model.relations.push(
      el('canon/relations/REL-USES-BAD-2.yaml', {
        notation: 'relation',
        id: 'REL-USES-BAD-2',
        type: 'uses',
        from: 'APPLICATION-OMS-1',
        to: 'NODE-KAFKA-HOST-1',
      }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'REL-USES-BAD-2' });
    expect(findings[0].message).toContain('uses');
    expect(findings[0].message).toContain('TECHNOLOGY_SERVICE');
  });

  it('TSVC-003: does not flag a technology-service whose node resolves to a NODE element', () => {
    const model = techModel();
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('TSVC-003: flags a technology-service whose node resolves to a non-NODE element', () => {
    const model = techModel();
    model.elements.push(
      el('canon/elements/04_technology/services/TECHNOLOGY_SERVICE-BAD-1.yaml', {
        notation: 'technology-service',
        id: 'TECHNOLOGY_SERVICE-BAD-1',
        type: 'messaging',
        node: 'APPLICATION-OMS-1',
      }),
    );
    const findings = validateRepoModel(model).filter(f => f.message.includes('TSVC-003'));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'TECHNOLOGY_SERVICE-BAD-1' });
    expect(findings[0].message).toContain('APPLICATION-OMS-1');
  });

  it('TSVC-003: does not flag a technology-service with an unresolved node (phase 4 handles that)', () => {
    const model = techModel();
    model.elements.push(
      el('canon/elements/04_technology/services/TECHNOLOGY_SERVICE-UNRESOLVED-1.yaml', {
        notation: 'technology-service',
        id: 'TECHNOLOGY_SERVICE-UNRESOLVED-1',
        type: 'storage',
        node: 'NODE-MISSING-99',
      }),
    );
    const findings = validateRepoModel(model).filter(f => f.message.includes('TSVC-003'));
    expect(findings).toHaveLength(0);
  });
});
