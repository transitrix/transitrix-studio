import { validateConstraint } from '@transitrix/diagrams/constraint/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateConstraint(input, { catalog: options.catalog }));
}

export const registration: ValidatorRegistration = {
  notation: 'constraint',
  validator: validate,
  complianceSweepDir: 'elements',
};
