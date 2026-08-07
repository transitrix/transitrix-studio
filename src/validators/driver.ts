import { validateFactor } from '@transitrix/diagrams/factor/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateFactor(input, { catalog: options.catalog }));
}

export const registration: ValidatorRegistration = {
  notation: 'driver',
  validator: validate,
  complianceSweepDir: 'elements',
};
