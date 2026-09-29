import { validateStandalone } from '@transitrix/diagrams/standalone/validate.js';
import type { ValidatorRegistration } from '../notation-types.js';
export const registration: ValidatorRegistration = {
  notation: 'observation',
  validator: (input, options = {}) => validateStandalone('observation', input, options),
};
