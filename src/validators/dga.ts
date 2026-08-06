import { parseCanonicalFGA } from '@transitrix/diagrams/fgca/parse-canonical.js';
import { wrapValidator, type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'dga',
  validator: wrapValidator(parseCanonicalFGA),
  canonicalViewExtension: true,
};
