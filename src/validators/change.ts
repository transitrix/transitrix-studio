import { validateChange } from '@transitrix/diagrams/change/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateChange(input, { catalog: options.catalog }));
}

export const registration: ValidatorRegistration = {
  notation: 'change',
  validator: validate,
  complianceSweepDir: 'elements',
};
