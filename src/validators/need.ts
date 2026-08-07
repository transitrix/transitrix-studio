import { validateNeed } from '@transitrix/diagrams/need/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateNeed(input, { catalog: options.catalog }));
}

export const registration: ValidatorRegistration = {
  notation: 'need',
  validator: validate,
  complianceSweepDir: 'elements',
};
