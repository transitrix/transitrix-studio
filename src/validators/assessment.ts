import { validateStandalone } from '@transitrix/diagrams/standalone/validate.js';
import type { ValidatorRegistration } from '../notation-types.js';
export const registration: ValidatorRegistration = {
  notation: 'assessment',
  validator: (input, options = {}) => validateStandalone('assessment', input, options),
};
