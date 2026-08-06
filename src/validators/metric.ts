import { validateMetric } from '@transitrix/diagrams/metric/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateMetric(input, { catalog: options.catalog }));
}

export const registration: ValidatorRegistration = {
  notation: 'metric',
  validator: validate,
  complianceSweepDir: 'elements',
};
