import { validateActivities } from '@transitrix/diagrams/activities/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'action',
  validator: wrapValidator(validateActivities),
  canonicalViewExtension: true,
};
