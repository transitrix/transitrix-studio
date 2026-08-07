import { parseCanonicalFGCA } from '@transitrix/diagrams/fgca/parse-canonical.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'dgca',
  validator: wrapValidator(parseCanonicalFGCA),
  canonicalViewExtension: true,
};
