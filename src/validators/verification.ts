import { validateVerification } from '@transitrix/diagrams/verification/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateVerification(input, { catalog: options.catalog }));
}

export const registration: ValidatorRegistration = {
  notation: 'verification',
  validator: validate,
  complianceSweepDir: 'verifications',
};
