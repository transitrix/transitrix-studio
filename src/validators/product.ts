import { validateStandalone } from '@transitrix/diagrams/standalone/validate.js';
import type { ValidatorRegistration } from '../notation-types.js';
export const registration: ValidatorRegistration = {
  notation: 'product',
  validator: (input, options = {}) => validateStandalone('product', input, options),
};
