import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TRANSITRIX_FILE_EXTENSIONS,
  parseCliFileArgv,
  parseCompileArgv,
  parseValidateArgv,
  inputMatchesExtension,
  isIsoDate,
} from '../src/cli-parse.js';

describe('cli-parse', () => {
  it('parses --ext=comma,separated suffixes', () => {
    const r = parseCliFileArgv(['--ext=.yaml,.cfg', 'a.yml', 'b.out']);
    expect(r).toEqual({
      ok: true,
      positional: ['a.yml', 'b.out'],
      extList: ['.yaml', '.cfg'],
      wantsHelp: false,
    });
  });

  it('parses equals form --ext=', () => {
    const r = parseCliFileArgv(['--ext=.foo', 'x.foo', 'y.bpmn']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.extList).toEqual(['.foo']);
  });

  it('signals --ext without argument', () => {
    expect(parseCliFileArgv(['--ext'])).toEqual({ ok: false, error: '--ext_requires_value' });
  });

  it('sets wantsHelp for -h / --help', () => {
    expect(parseCliFileArgv(['--help', 'file.yaml', 'out.bpmn'])).toMatchObject({ ok: true, wantsHelp: true });
    expect(parseCliFileArgv(['-h'])).toMatchObject({ ok: true, wantsHelp: true });
  });

  it('defaults exts externally when empty extList', () => {
    const res = parseCliFileArgv(['a.bpmn.transitrix.yaml', 'b.bpmn']);
    expect(res.ok && res.extList).toHaveLength(0);
    expect(DEFAULT_TRANSITRIX_FILE_EXTENSIONS).toContain('.bpmn.transitrix.yaml');
  });

  it('inputMatchesExtension is case insensitive on path', () => {
    expect(inputMatchesExtension('X.CERVIN.YAML', ['.cervin.yaml'])).toBe(true);
  });

  it('collects positional src and dst paths', () => {
    expect(parseCliFileArgv(['models/x.cervin.yaml', 'out/generated.bpmn'])).toMatchObject({
      ok: true,
      positional: ['models/x.cervin.yaml', 'out/generated.bpmn'],
    });
  });
});

describe('parseCompileArgv', () => {
  it('defaults profile to default and strips flags from paths', () => {
    const r = parseCompileArgv(['in.bpmn.transitrix.yaml', 'out.bpmn', '--no-metrics', '--profile=presentation']);
    expect(r).toMatchObject({
      ok: true,
      positional: ['in.bpmn.transitrix.yaml', 'out.bpmn'],
      profile: 'presentation',
      noMetrics: true,
      noValidate: false,
    });
  });

  it('rejects an unknown profile', () => {
    expect(parseCompileArgv(['--profile=wide', 'in.yaml', 'out.svg'])).toEqual({ ok: false, error: 'bad_profile' });
  });
});

describe('parseValidateArgv (#141 — validate scope)', () => {
  it('defaults to file scope, preserving per-file back-compat', () => {
    const r = parseValidateArgv(['model.cervin.yaml', '--json']);
    expect(r).toMatchObject({ ok: true, scope: 'file', root: undefined });
    if (r.ok) expect(r.positional).toContain('model.cervin.yaml');
  });

  it('parses --scope=repo with --root (equals and spaced forms)', () => {
    expect(parseValidateArgv(['--scope=repo', '--root=./org'])).toMatchObject({ ok: true, scope: 'repo', root: './org' });
    expect(parseValidateArgv(['--scope', 'repo', '--root', './org'])).toMatchObject({ ok: true, scope: 'repo', root: './org' });
  });

  it('repo scope without --root leaves root undefined (caller defaults to cwd)', () => {
    expect(parseValidateArgv(['--scope=repo'])).toMatchObject({ ok: true, scope: 'repo', root: undefined });
  });

  it('rejects an unknown scope', () => {
    expect(parseValidateArgv(['--scope=bogus'])).toEqual({ ok: false, error: 'bad_scope' });
  });

  it('signals --scope / --root without a value', () => {
    expect(parseValidateArgv(['--scope'])).toEqual({ ok: false, error: '--scope_requires_value' });
    expect(parseValidateArgv(['--root'])).toEqual({ ok: false, error: '--root_requires_value' });
  });

  it('still surfaces --ext parsing through to file scope', () => {
    const r = parseValidateArgv(['--ext=.foo', 'x.foo']);
    expect(r).toMatchObject({ ok: true, scope: 'file' });
    if (r.ok) expect(r.extList).toEqual(['.foo']);
  });

  it('passes --help through as wantsHelp', () => {
    expect(parseValidateArgv(['--scope=repo', '--help'])).toMatchObject({ ok: true, wantsHelp: true });
  });

  it('parses --template (equals and spaced forms)', () => {
    expect(parseValidateArgv(['raci.blocks.transitrix.yaml', '--template=raci'])).toMatchObject({
      ok: true,
      template: 'raci',
    });
    expect(parseValidateArgv(['raci.blocks.transitrix.yaml', '--template', 'raci'])).toMatchObject({
      ok: true,
      template: 'raci',
    });
  });

  it('leaves template undefined when not given', () => {
    expect(parseValidateArgv(['model.cervin.yaml'])).toMatchObject({ ok: true, template: undefined });
  });

  it('signals --template without a value', () => {
    expect(parseValidateArgv(['--template'])).toEqual({ ok: false, error: '--template_requires_value' });
  });

  it('parses --fix, --dry-run, and --author (both separate and = forms)', () => {
    expect(parseValidateArgv(['model.yaml'])).toMatchObject({ ok: true, fix: false, dryRun: false, author: undefined });
    expect(parseValidateArgv(['model.yaml', '--fix'])).toMatchObject({ ok: true, fix: true });
    expect(parseValidateArgv(['model.yaml', '--fix', '--dry-run'])).toMatchObject({ ok: true, fix: true, dryRun: true });
    expect(parseValidateArgv(['model.yaml', '--fix', '--author', 'a.b'])).toMatchObject({ ok: true, author: 'a.b' });
    expect(parseValidateArgv(['model.yaml', '--fix', '--author=a.b'])).toMatchObject({ ok: true, author: 'a.b' });
  });

  it('signals --author without a value', () => {
    expect(parseValidateArgv(['--author'])).toEqual({ ok: false, error: '--author_requires_value' });
  });

  it('parses --valid-from (both separate and = forms)', () => {
    expect(parseValidateArgv(['model.yaml'])).toMatchObject({ ok: true, validFrom: undefined });
    expect(parseValidateArgv(['model.yaml', '--fix', '--valid-from', '2026-01-01']))
      .toMatchObject({ ok: true, validFrom: '2026-01-01' });
    expect(parseValidateArgv(['model.yaml', '--fix', '--valid-from=2026-01-01']))
      .toMatchObject({ ok: true, validFrom: '2026-01-01' });
  });

  it('signals --valid-from without a value, and rejects a non-calendar date', () => {
    expect(parseValidateArgv(['--valid-from'])).toEqual({ ok: false, error: '--valid-from_requires_value' });
    for (const bad of ['01/01/2026', '2026-1-1', '2026-02-31', 'yesterday', '']) {
      expect(parseValidateArgv(['model.yaml', `--valid-from=${bad}`]), bad)
        .toEqual({ ok: false, error: 'bad_valid_from' });
    }
  });
});

describe('isIsoDate', () => {
  it('accepts a canonical calendar date and rejects everything else', () => {
    expect(isIsoDate('2026-01-01')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);   // leap day
    expect(isIsoDate('2026-02-29')).toBe(false);  // not a leap year
    expect(isIsoDate('2026-02-31')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-1')).toBe(false);
    expect(isIsoDate('01/01/2026')).toBe(false);
    expect(isIsoDate('2026-01-01T00:00:00Z')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

