import { validateNode } from '@transitrix/diagrams/node/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'node',
  validator: wrapValidator(validateNode),
  complianceSweepDir: 'elements',
};
