import { validateProcessBlueprint } from '@transitrix/diagrams/process-blueprint/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'process-blueprint',
  validator: wrapValidator(validateProcessBlueprint),
  canonicalViewExtension: true,
};
