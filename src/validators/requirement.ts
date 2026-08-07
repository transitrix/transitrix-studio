import { validateRequirement } from '@transitrix/diagrams/requirement/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateRequirement(input, { catalog: options.catalog }));
}

export const registration: ValidatorRegistration = {
  notation: 'requirement',
  validator: validate,
  complianceSweepDir: 'elements',
};
