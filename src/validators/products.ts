import { validateProductsCatalogue } from '@transitrix/diagrams/products/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'products',
  validator: wrapValidator(validateProductsCatalogue),
  canonicalViewExtension: true,
};
