import { describe, it, expect } from 'vitest';

import {
  assembleRegistrations,
  VALIDATOR_REGISTRATIONS,
  type ValidatorRegistration,
} from '../src/notation-registry.js';
import { FILE_VALIDATABLE_NOTATIONS } from '../src/validate-notation.js';

// Registering a validator is "add one file to src/validators/", discovered
// rather than listed. These tests cover the discovery mechanism itself: a
// well-formed module set assembles
// correctly, and a deliberately broken/missing registration fails loudly
// (assembleRegistrations throws) instead of silently narrowing what gets
// validated — exercised directly against fabricated modules so the failure
// mode is covered without depending on the filesystem or dynamic import.

function fn(): ValidatorRegistration['validator'] {
  return () => ({ valid: true, errors: [], warnings: [] });
}

describe('notation-registry — discovery', () => {
  it('every src/validators/ file registered, with no notation claimed twice', () => {
    expect(VALIDATOR_REGISTRATIONS.length).toBeGreaterThan(0);
    const notations = VALIDATOR_REGISTRATIONS.map((r) => r.notation);
    expect(new Set(notations).size).toBe(notations.length);
  });

  it('validate-notation.ts sees exactly what the registry discovered', () => {
    expect([...FILE_VALIDATABLE_NOTATIONS].sort()).toEqual(
      [...VALIDATOR_REGISTRATIONS.map((r) => r.notation)].sort(),
    );
  });

  it('assembles a well-formed module list', () => {
    const result = assembleRegistrations([
      { file: 'a.js', mod: { registration: { notation: 'a', validator: fn() } } },
      { file: 'b.js', mod: { registration: { notation: 'b', validator: fn() } } },
    ]);
    expect(result.map((r) => r.notation)).toEqual(['a', 'b']);
  });

  it('a module missing its "registration" export fails loudly, not silently', () => {
    expect(() =>
      assembleRegistrations([
        { file: 'a.js', mod: { registration: { notation: 'a', validator: fn() } } },
        { file: 'broken.js', mod: {} },
      ]),
    ).toThrow(/broken\.js/);
  });

  it('a "registration" export missing its validator function fails loudly', () => {
    expect(() =>
      assembleRegistrations([{ file: 'broken.js', mod: { registration: { notation: 'x' } } }]),
    ).toThrow(/broken\.js/);
  });

  it('a "registration" export with a non-string/empty notation fails loudly', () => {
    expect(() =>
      assembleRegistrations([{ file: 'broken.js', mod: { registration: { notation: '', validator: fn() } } }]),
    ).toThrow(/broken\.js/);
  });

  it('two files claiming the same notation fail loudly, naming both files', () => {
    expect(() =>
      assembleRegistrations([
        { file: 'a.js', mod: { registration: { notation: 'dup', validator: fn() } } },
        { file: 'b.js', mod: { registration: { notation: 'dup', validator: fn() } } },
      ]),
    ).toThrow(/dup.*a\.js.*b\.js/s);
  });
});
