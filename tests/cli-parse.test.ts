import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CERVIN_FILE_EXTENSIONS,
  parseCliFileArgv,
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
