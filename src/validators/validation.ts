import { validateValidation } from '@transitrix/diagrams/validation/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateValidation(input, { catalog: options.catalog }));
}

export const registration: ValidatorRegistration = {
  notation: 'validation',
  validator: validate,
  complianceSweepDir: 'validations',
};
