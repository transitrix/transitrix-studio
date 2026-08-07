import { validateIntegration } from '@transitrix/diagrams/integration/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'integration',
  validator: wrapValidator(validateIntegration),
  complianceSweepDir: 'elements',
};
