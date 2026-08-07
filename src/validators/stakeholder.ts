import { validateStakeholder } from '@transitrix/diagrams/stakeholder/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateStakeholder(input, { catalog: options.catalog }));
}

export const registration: ValidatorRegistration = {
  notation: 'stakeholder',
  validator: validate,
  complianceSweepDir: 'elements',
};
