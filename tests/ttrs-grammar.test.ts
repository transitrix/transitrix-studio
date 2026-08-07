import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const grammar = JSON.parse(
  readFileSync(path.join(repoRoot, 'extension/syntaxes/ttrs.tmLanguage.json'), 'utf8'),
) as {
  patterns: { include: string }[];
  repository: Record<string, Record<string, unknown>>;
};

const extensionManifest = JSON.parse(
  readFileSync(path.join(repoRoot, 'extension/package.json'), 'utf8'),
) as {
  contributes: {
    languages: { id: string; extensions?: string[] }[];
    grammars: { language: string; scopeName: string; path: string }[];
  };
};

/**
 * The grammar's patterns are written in the subset of the regex syntax that
 * JS and Oniguruma share, so a rule can be exercised directly here. Anchored
 * both ends: a rule that only matches part of a directive would still leave
 * the rest unhighlighted.
 */
function rule(name: string): RegExp {
  const entry = grammar.repository[name];
  const source = (entry.match ?? entry.begin) as string;
  return new RegExp(`^(?:${source})$`);
}

function ruleUnanchored(name: string): RegExp {
  const entry = grammar.repository[name];
  return new RegExp((entry.match ?? entry.begin) as string);
}

const included = (patterns: { include: string }[]) => patterns.map((p) => p.include);

describe('.ttrs language contribution', () => {
  it('associates only the .ttrs extension, so the .trs near-miss is not claimed', () => {
    const language = extensionManifest.contributes.languages.find(
      (l) => l.id === 'transitrix-ttrs',
    );
    expect(language).toBeDefined();
    expect(language?.extensions).toEqual(['.ttrs']);
  });

  it('points the grammar at the scope the grammar file declares', () => {
    const contribution = extensionManifest.contributes.grammars.find(
      (g) => g.language === 'transitrix-ttrs',
    );
    expect(contribution?.scopeName).toBe('text.ttrs');
    expect(contribution?.path).toBe('./syntaxes/ttrs.tmLanguage.json');
  });
});

describe('each — DIRECTIVE_LANGUAGE.md §4.1', () => {
  const each = rule('each-block');

  it('recognises the bare form', () => {
    const m = '{{# each REQ }}'.match(each);
    expect(m?.[3]).toBe('REQ');
  });

  it('recognises a multi-word element type', () => {
    expect('{{# each BUSINESS_SERVICE }}'.match(each)?.[3]).toBe('BUSINESS_SERVICE');
  });

  it('recognises where, and, and order by together', () => {
    const source = '{{# each REQ where status = approved and priority != low order by id }}';
    const m = source.match(each);
    expect(m?.[3]).toBe('REQ');
    expect(m?.[4]).toContain('order by id');
  });

  it('recognises the closing tag', () => {
    expect(
      new RegExp(`^(?:${grammar.repository['each-block'].end as string})$`).test('{{/ each }}'),
    ).toBe(true);
  });

  it('scopes where / and / order by as keywords, and the right-hand side as a literal', () => {
    const clauses = grammar.repository['each-clauses'].patterns as {
      match: string;
      name?: string;
    }[];
    const keywordSources = clauses
      .filter((p) => (p.name ?? '').startsWith('keyword') || p.match.includes('order'))
      .map((p) => p.match);
    expect(keywordSources.some((s) => new RegExp(s).test('where'))).toBe(true);
    expect(keywordSources.some((s) => new RegExp(s).test('and'))).toBe(true);
    expect(keywordSources.some((s) => new RegExp(s).test('order by'))).toBe(true);
  });

  it('carries the inline constructs into its body, including the row reference', () => {
    const body = included(grammar.repository['each-body'].patterns as { include: string }[]);
    expect(body).toContain('#row-reference');
    expect(body).toContain('#model-object-reference');
    expect(body).toContain('#capability-reference');
    expect(body).toContain('#trace');
  });
});

describe('row reference — §3.3', () => {
  const row = rule('row-reference');

  it('recognises a current-row field', () => {
    expect('{{ .title }}'.match(row)?.[2]).toBe('.title');
  });

  it('does not claim an ordinary reference', () => {
    expect(row.test('{{ REQ-14 }}')).toBe(false);
  });
});

describe('trace — §3.4', () => {
  const trace = rule('trace');

  it('recognises the three required attributes', () => {
    const m = '{{ trace from = REQUIREMENT to = CAPABILITY via = realises }}'.match(trace);
    expect(m?.[2]).toBe('trace');
    expect(m?.[3]).toContain('via = realises');
  });

  it('recognises the whitespace-tight spelling', () => {
    expect(trace.test('{{ trace from=REQUIREMENT to=CAPABILITY via=realises }}')).toBe(true);
  });
});

describe('references — §2.1, §3.2', () => {
  it('splits the CAPABILITY V/H prefix off before any field path', () => {
    const m = '{{ CAPABILITY-V1.2.3 }}'.match(rule('capability-reference'));
    expect(m?.[2]).toBe('CAPABILITY-V1.2.3');
  });

  it('reads a field path off an ordinary id', () => {
    const m = '{{ REQ-14.parent.title }}'.match(rule('model-object-reference'));
    expect(m?.[2]).toBe('REQ-14');
    expect(m?.[3]).toBe('.parent.title');
  });

  it('does not match a field path deeper than three segments', () => {
    expect(rule('model-object-reference').test('{{ REQ-14.a.b.c.d }}')).toBe(false);
  });
});

describe('rule precedence', () => {
  const top = included(grammar.patterns);

  it('matches each and trace before the generic reference rule', () => {
    expect(top.indexOf('#each-block')).toBeGreaterThan(-1);
    expect(top.indexOf('#trace')).toBeGreaterThan(-1);
    expect(top.indexOf('#each-block')).toBeLessThan(top.indexOf('#model-object-reference'));
    expect(top.indexOf('#trace')).toBeLessThan(top.indexOf('#model-object-reference'));
  });

  it('matches the CAPABILITY form before the generic reference rule', () => {
    expect(top.indexOf('#capability-reference')).toBeLessThan(
      top.indexOf('#model-object-reference'),
    );
  });

  it('leaves an each opener alone for the generic reference rule', () => {
    expect(ruleUnanchored('model-object-reference').test('{{# each REQ }}')).toBe(false);
    expect(ruleUnanchored('model-object-reference').test('{{ trace from = REQ to = CAP via = r }}')).toBe(
      false,
    );
  });

  it('keeps an instruct body opaque — no reference rule reaches inside one', () => {
    const body = grammar.repository['instruction-slot-body'].patterns as { include?: string }[];
    expect(body.every((p) => p.include === undefined)).toBe(true);
  });
});
