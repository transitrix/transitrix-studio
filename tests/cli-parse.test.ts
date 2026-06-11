import { describe, expect, it } from 'vitest';

import {
  CERVIN_DEPRECATION_NOTICE,
  DEFAULT_CERVIN_FILE_EXTENSIONS,
  invokedAsCervin,
  parseCliFileArgv,
  parseValidateArgv,
  inputMatchesExtension,
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
    const res = parseCliFileArgv(['a.cervin.yaml', 'b.bpmn']);
    expect(res.ok && res.extList).toHaveLength(0);
    expect(DEFAULT_CERVIN_FILE_EXTENSIONS).toContain('.cervin.yaml');
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
});

describe('invokedAsCervin (Cervin deprecation P1)', () => {
  it('detects the legacy cervin bin on POSIX symlink paths', () => {
    expect(invokedAsCervin('/usr/local/bin/cervin')).toBe(true);
    expect(invokedAsCervin('/home/u/project/node_modules/.bin/cervin')).toBe(true);
  });

  it('detects cervin via a Windows path and extension stem', () => {
    expect(invokedAsCervin('C:\\Users\\u\\AppData\\npm\\cervin')).toBe(true);
    expect(invokedAsCervin('C:\\tools\\cervin.cmd')).toBe(true);
    expect(invokedAsCervin('/path/cervin.js')).toBe(true);
  });

  it('is case-insensitive on the stem', () => {
    expect(invokedAsCervin('/usr/bin/CERVIN')).toBe(true);
  });

  it('does not fire for transitrix or the bundled cli.js', () => {
    expect(invokedAsCervin('/usr/local/bin/transitrix')).toBe(false);
    expect(invokedAsCervin('/app/dist/cli.js')).toBe(false);
    expect(invokedAsCervin('/path/cerviner')).toBe(false);
    expect(invokedAsCervin(undefined)).toBe(false);
    expect(invokedAsCervin('')).toBe(false);
  });

  it('exposes a deprecation notice that names transitrix', () => {
    expect(CERVIN_DEPRECATION_NOTICE).toMatch(/transitrix/);
    expect(CERVIN_DEPRECATION_NOTICE).toMatch(/deprecated/i);
  });
});
