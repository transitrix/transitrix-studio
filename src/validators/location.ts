import { validateLocation } from '@transitrix/diagrams/location/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'location',
  validator: wrapValidator(validateLocation),
  complianceSweepDir: 'elements',
};
