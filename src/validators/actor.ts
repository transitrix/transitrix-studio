import { validateActor } from '@transitrix/diagrams/actor/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'actor',
  validator: wrapValidator(validateActor),
  complianceSweepDir: 'elements',
};
