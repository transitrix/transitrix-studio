import { validateStandalone } from '@transitrix/diagrams/standalone/validate.js';
import type { ValidatorRegistration } from '../notation-types.js';
export const registration: ValidatorRegistration = {
  notation: 'scenario',
  validator: (input, options = {}) => validateStandalone('scenario', input, options),
};
