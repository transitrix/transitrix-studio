import { validateCapabilityMap } from '@transitrix/diagrams/capability-map/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'capability-map',
  validator: wrapValidator(validateCapabilityMap),
  canonicalViewExtension: true,
};
