import { validateTargetState } from '@transitrix/diagrams/target-state/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateTargetState(input, { catalog: options.catalog }));
}

export const registration: ValidatorRegistration = {
  notation: 'target-state',
  validator: validate,
  complianceSweepDir: 'elements',
};
