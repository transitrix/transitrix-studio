import { validateStandalone } from '@transitrix/diagrams/standalone/validate.js';
import type { ValidatorRegistration } from '../notation-types.js';
export const registration: ValidatorRegistration = {
  notation: 'draft',
  validator: (input, options = {}) => validateStandalone('draft', input, options),
};
