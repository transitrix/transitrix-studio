import { validateTechnologyService } from '@transitrix/diagrams/technology-service/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'technology-service',
  validator: wrapValidator(validateTechnologyService),
  complianceSweepDir: 'elements',
};
