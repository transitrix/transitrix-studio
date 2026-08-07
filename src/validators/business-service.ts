import { validateBusinessService } from '@transitrix/diagrams/business-service/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'business-service',
  validator: wrapValidator(validateBusinessService),
  complianceSweepDir: 'elements',
};
