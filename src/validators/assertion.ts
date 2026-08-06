import { validateAssertion } from '@transitrix/diagrams/assertion/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  const today = new Date().toISOString().slice(0, 10);
  return mapPackageResult(validateAssertion(input, { catalog: options.catalog, today }));
}

export const registration: ValidatorRegistration = {
  notation: 'assertion',
  validator: validate,
  complianceSweepDir: 'assertions',
};
