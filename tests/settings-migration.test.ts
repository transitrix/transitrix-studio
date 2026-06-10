import { describe, expect, it } from 'vitest';

import {
  CERVIN_SETTINGS_DEPRECATION_NOTICE,
  resolveCervinFallback,
} from '../extension/src/settings-migration.js';

const isEmptyArray = (v: unknown): boolean => !Array.isArray(v) || v.length === 0;

describe('resolveCervinFallback (Cervin deprecation P2)', () => {
  it('prefers the transitrix value when set', () => {
    expect(resolveCervinFallback('new', 'old')).toEqual({
      value: 'new',
      usedCervinFallback: false,
    });
  });

  it('falls back to the cervin value when transitrix is undefined', () => {
    expect(resolveCervinFallback(undefined, 'old')).toEqual({
      value: 'old',
      usedCervinFallback: true,
    });
  });

  it('treats an empty array as unset and falls back', () => {
    const r = resolveCervinFallback<unknown>([], ['.cervin.yaml'], isEmptyArray);
    expect(r).toEqual({ value: ['.cervin.yaml'], usedCervinFallback: true });
  });

  it('keeps a non-empty transitrix array over the legacy one', () => {
    const r = resolveCervinFallback<unknown>(['.a'], ['.b'], isEmptyArray);
    expect(r).toEqual({ value: ['.a'], usedCervinFallback: false });
  });

  it('reports no fallback when both are unset', () => {
    expect(resolveCervinFallback(undefined, undefined)).toEqual({
      value: undefined,
      usedCervinFallback: false,
    });
    const r = resolveCervinFallback<unknown>([], [], isEmptyArray);
    expect(r).toEqual({ value: [], usedCervinFallback: false });
  });

  it('does not flag fallback for a falsy-but-set transitrix boolean', () => {
    expect(resolveCervinFallback(false, true)).toEqual({
      value: false,
      usedCervinFallback: false,
    });
  });

  it('exposes a deprecation notice naming the transitrix keys', () => {
    expect(CERVIN_SETTINGS_DEPRECATION_NOTICE).toMatch(/transitrix\./);
    expect(CERVIN_SETTINGS_DEPRECATION_NOTICE).toMatch(/deprecated/i);
  });
});
