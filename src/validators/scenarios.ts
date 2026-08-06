import { validateScenario } from '@transitrix/diagrams/scenarios/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'scenarios',
  validator: wrapValidator(validateScenario),
  canonicalViewExtension: true,
};
