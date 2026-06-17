import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// The pure functions under test (findCanonRootPath, isUnderCanonPath,
// buildCanonIndex, relation helpers) do not call any vscode API at runtime.
// This stub satisfies the static import so vitest can load the module.
vi.mock('vscode', () => ({}));
import { join, sep } from 'node:path';
import yaml from 'js-yaml';
import {
  findCanonRootPath,
  isUnderCanonPath,
  buildCanonIndex,
  relationsOfType,
  relationsFrom,
  relationsTo,
  type CanonDocs,
} from '../extension/src/canon-loader.js';

// Helpers to load fixture docs using Node.js fs (no vscode runtime needed).

function readYamlFilesUnder(dir: string): unknown[] {
  const out: unknown[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...readYamlFilesUnder(child));
    } else if (entry.isFile() && entry.name.endsWith('.yaml')) {
      out.push(yaml.load(readFileSync(child, 'utf-8')));
    }
  }
  return out;
}

const FIXTURE_CANON = join(
  import.meta.dirname ?? __dirname,
  'fixtures',
  'notation-corpus',
  'activity-card',
  'canon',
);

function makeFixtureDocs(): CanonDocs {
  return {
    elements: readYamlFilesUnder(join(FIXTURE_CANON, 'elements')),
    relations: readYamlFilesUnder(join(FIXTURE_CANON, 'relations')),
    warnings: [],
  };
}

// ── findCanonRootPath ────────────────────────────────────────────────────────

describe('findCanonRootPath', () => {
  it('returns the canon/ directory when the file is inside it', () => {
    const filePath = ['', 'org', 'canon', 'elements', 'activities', 'ACT-1.yaml'].join(sep);
    expect(findCanonRootPath(filePath)).toBe(['', 'org', 'canon'].join(sep));
  });

  it('finds canon/ several levels above the file', () => {
    const filePath = ['', 'org', 'canon', 'elements', 'a', 'b', 'c', 'ACT-1.yaml'].join(sep);
    expect(findCanonRootPath(filePath)).toBe(['', 'org', 'canon'].join(sep));
  });

  it('returns undefined when no ancestor is named canon/', () => {
    const filePath = ['', 'org', 'views', 'activity-card', 'my-card.yaml'].join(sep);
    expect(findCanonRootPath(filePath)).toBeUndefined();
  });

  it('does not confuse a non-canon directory named similarly', () => {
    const filePath = ['', 'org', 'canonical', 'elements', 'ACT-1.yaml'].join(sep);
    expect(findCanonRootPath(filePath)).toBeUndefined();
  });
});

// ── isUnderCanonPath ─────────────────────────────────────────────────────────

describe('isUnderCanonPath', () => {
  const canonRoot = ['', 'org', 'canon'].join(sep);

  it('returns true for a file inside elements/', () => {
    const saved = join(canonRoot, 'elements', 'activities', 'ACT-1.yaml');
    expect(isUnderCanonPath(canonRoot, saved)).toBe(true);
  });

  it('returns true for a file inside relations/', () => {
    const saved = join(canonRoot, 'relations', 'REL-1.yaml');
    expect(isUnderCanonPath(canonRoot, saved)).toBe(true);
  });

  it('returns false for a file outside elements/ and relations/', () => {
    const saved = join(canonRoot, 'cards', 'my-card.yaml');
    expect(isUnderCanonPath(canonRoot, saved)).toBe(false);
  });

  it('returns false for a sibling of canon/', () => {
    const saved = ['', 'org', 'views', 'my-card.yaml'].join(sep);
    expect(isUnderCanonPath(canonRoot, saved)).toBe(false);
  });
});

// ── buildCanonIndex ──────────────────────────────────────────────────────────

describe('buildCanonIndex', () => {
  it('indexes all elements by id', () => {
    const index = buildCanonIndex(makeFixtureDocs());
    expect(index.elementById.has('ACTIVITY-EU-PROGRAMME-1')).toBe(true);
    expect(index.elementById.has('GOAL-EU-MARKET-1')).toBe(true);
    expect(index.elementById.has('FACTOR-EU-MDR-1')).toBe(true);
    expect(index.elementById.has('CHANGE-EU-COMPLIANCE-1')).toBe(true);
  });

  it('groups elements by notation', () => {
    const index = buildCanonIndex(makeFixtureDocs());
    expect(index.elementsByNotation.has('activity')).toBe(true);
    expect(index.elementsByNotation.has('goal')).toBe(true);
    const activities = index.elementsByNotation.get('activity') ?? [];
    expect(activities.some(a => a.id === 'ACTIVITY-EU-PROGRAMME-1')).toBe(true);
  });

  it('indexes relations', () => {
    const index = buildCanonIndex(makeFixtureDocs());
    expect(index.relations.length).toBeGreaterThan(0);
    expect(index.relations.some(r => r.id === 'REL-EU-PROGRAMME-GOAL-EU-MARKET-1')).toBe(true);
  });

  it('skips elements without an id', () => {
    const docs: CanonDocs = {
      elements: [{ notation: 'activity' }, { notation: 'activity', id: 'ACT-1' }],
      relations: [],
      warnings: [],
    };
    const index = buildCanonIndex(docs);
    expect(index.elementById.size).toBe(1);
    expect(index.elementById.has('ACT-1')).toBe(true);
  });

  it('skips malformed relation documents', () => {
    const docs: CanonDocs = {
      elements: [],
      relations: [
        { notation: 'relation', id: 'REL-1', type: 'link', from: 'A', to: 'B' },
        { notation: 'relation', id: 'REL-BAD' }, // missing type/from/to
        null,
      ],
      warnings: [],
    };
    const index = buildCanonIndex(docs);
    expect(index.relations).toHaveLength(1);
    expect(index.relations[0].id).toBe('REL-1');
  });
});

// ── relation lookup helpers ──────────────────────────────────────────────────

describe('relationsOfType', () => {
  it('returns only relations of the given type', () => {
    const index = buildCanonIndex(makeFixtureDocs());
    const links = relationsOfType(index, 'activity_goal');
    expect(links.length).toBeGreaterThan(0);
    expect(links.every(r => r.type === 'activity_goal')).toBe(true);
  });

  it('returns empty array for an unknown type', () => {
    const index = buildCanonIndex(makeFixtureDocs());
    expect(relationsOfType(index, 'nonexistent_type')).toHaveLength(0);
  });
});

describe('relationsFrom', () => {
  it('returns relations where from matches the sourceId', () => {
    const index = buildCanonIndex(makeFixtureDocs());
    const rels = relationsFrom(index, 'ACTIVITY-EU-PROGRAMME-1');
    expect(rels.length).toBeGreaterThan(0);
    expect(rels.every(r => r.from === 'ACTIVITY-EU-PROGRAMME-1')).toBe(true);
  });

  it('returns empty array for an unknown source', () => {
    const index = buildCanonIndex(makeFixtureDocs());
    expect(relationsFrom(index, 'DOES-NOT-EXIST')).toHaveLength(0);
  });
});

describe('relationsTo', () => {
  it('returns relations where to matches the targetId', () => {
    const index = buildCanonIndex(makeFixtureDocs());
    const rels = relationsTo(index, 'GOAL-EU-MARKET-1');
    expect(rels.length).toBeGreaterThan(0);
    expect(rels.every(r => r.to === 'GOAL-EU-MARKET-1')).toBe(true);
  });

  it('returns empty array for an unknown target', () => {
    const index = buildCanonIndex(makeFixtureDocs());
    expect(relationsTo(index, 'DOES-NOT-EXIST')).toHaveLength(0);
  });
});
