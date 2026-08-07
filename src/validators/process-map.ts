import { validateProcessMap } from '@transitrix/diagrams/process-map/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'process-map',
  validator: wrapValidator(validateProcessMap),
  canonicalViewExtension: true,
};
