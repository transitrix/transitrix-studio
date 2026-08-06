import { parseCanonicalGoals } from '@transitrix/diagrams/goals/parse-canonical.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'goals',
  validator: wrapValidator(parseCanonicalGoals),
  canonicalViewExtension: true,
};
