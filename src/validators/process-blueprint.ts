import { validateProcessBlueprint } from '@transitrix/diagrams/process-blueprint/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(
    validateProcessBlueprint(input, {
      catalog: options.catalog,
      processParentEdges: options.processParentEdges,
    }),
  );
}

export const registration: ValidatorRegistration = {
  notation: 'process-blueprint',
  validator: validate,
  canonicalViewExtension: true,
};
