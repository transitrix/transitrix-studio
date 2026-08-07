import { validateApplicationsCatalogue } from '@transitrix/diagrams/applications/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'applications',
  validator: wrapValidator(validateApplicationsCatalogue),
  canonicalViewExtension: true,
};
