import { validateActivityCard } from '@transitrix/diagrams/activity-card/validate.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'action-card',
  validator: wrapValidator(validateActivityCard),
  canonicalViewExtension: true,
};
