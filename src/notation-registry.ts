// The registry `validate-notation.ts` and `repo-validate.ts` both read to learn
// which notations exist and how to validate them — resolved by *discovering*
// one registration module per notation under `src/validators/`, never by an
// edited shared list (HUB-1044 / vkgeorgia/strategy#1052).
//
// Registering a new notation validator means adding one file to
// `src/validators/` that exports a `registration: ValidatorRegistration` —
// no existing line in this file, `validate-notation.ts`, or `repo-validate.ts`
// changes for that purpose. Two PRs each adding a different notation touch
// disjoint files and never conflict.
//
// Only `validate-notation.ts` / `repo-validate.ts` / tests import this module.
// `src/validators/*.ts` files import `notation-types.ts` instead — this
// module's discovery has an I/O side effect (the top-level `await` below)
// that esbuild cannot tree-shake, so importing it from a validator module
// would embed a second, wrongly-rooted copy of the directory scan in that
// validator's own bundle (each is its own esbuild entry point).

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from 'node:path';
import type { ValidatorRegistration } from './notation-types.js';

export type {
  NotationValidationResult,
  ValidateNotationOptions,
  NotationValidator,
  ComplianceSweepDir,
  ValidatorRegistration,
} from './notation-types.js';

const VALIDATORS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'validators');

function isRegistrationFile(name: string): boolean {
  return (name.endsWith('.ts') || name.endsWith('.js')) && !name.endsWith('.d.ts');
}

/** Validate one loaded module's shape and fold it into the accumulated
 *  registrations, throwing on a missing/malformed `registration` export or a
 *  notation claimed twice — a registration module that fails to load correctly
 *  fails loudly here rather than silently narrowing what gets validated.
 *  Exported so a test can exercise this against a fabricated module list
 *  without touching the filesystem or dynamic import. */
export function assembleRegistrations(
  modules: Array<{ file: string; mod: unknown }>,
): ValidatorRegistration[] {
  const registrations: ValidatorRegistration[] = [];
  const ownerOf = new Map<string, string>();
  for (const { file, mod } of modules) {
    const registration = (mod as { registration?: unknown } | null | undefined)?.registration;
    if (
      !registration
      || typeof (registration as ValidatorRegistration).notation !== 'string'
      || (registration as ValidatorRegistration).notation.length === 0
      || typeof (registration as ValidatorRegistration).validator !== 'function'
    ) {
      throw new Error(
        `notation-registry: "${file}" does not export a valid "registration" ` +
          `(expected { notation: string; validator: NotationValidator; ... }).`,
      );
    }
    const reg = registration as ValidatorRegistration;
    const owner = ownerOf.get(reg.notation);
    if (owner) {
      throw new Error(
        `notation-registry: notation "${reg.notation}" is registered twice — ` +
          `"${owner}" and "${file}".`,
      );
    }
    ownerOf.set(reg.notation, file);
    registrations.push(reg);
  }
  return registrations;
}

async function loadModules(dir: string): Promise<Array<{ file: string; mod: unknown }>> {
  const files = readdirSync(dir).filter(isRegistrationFile).sort();
  const modules: Array<{ file: string; mod: unknown }> = [];
  for (const file of files) {
    modules.push({ file, mod: await import(pathToFileURL(path.join(dir, file)).href) });
  }
  return modules;
}

async function discover(dir: string = VALIDATORS_DIR): Promise<ValidatorRegistration[]> {
  return assembleRegistrations(await loadModules(dir));
}

/** Every registered notation validator, discovered from `src/validators/` —
 *  computed once at module load (top-level await), so every consumer keeps
 *  reading it as a plain synchronous array. */
export const VALIDATOR_REGISTRATIONS: ValidatorRegistration[] = await discover();
