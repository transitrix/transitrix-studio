import { validateCapabilityMap } from '@transitrix/diagrams/capability-map/validate.js';
import { type ValidatorRegistration } from '../notation-types.js';

export const registration: ValidatorRegistration = {
  notation: 'capability-map',
  validator: (input, options) => validateCapabilityMap(input, { resolvedAttributes: options?.capabilityAttributes }),
  canonicalViewExtension: true,
};
