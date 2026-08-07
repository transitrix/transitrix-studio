import { validateRisk } from '@transitrix/diagrams/risk/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateRisk(input, { catalog: options.catalog }));
}

export const registration: ValidatorRegistration = {
  notation: 'risk',
  validator: validate,
  complianceSweepDir: 'elements',
};
