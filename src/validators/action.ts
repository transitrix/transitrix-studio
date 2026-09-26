import { validateActivities } from '@transitrix/diagrams/activities/validate.js';
import type { ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'action',
  validator: (input, options) => validateActivities(input, options),
  canonicalViewExtension: true,
};
