import { parseImpactViewConfig } from '@transitrix/diagrams/compliance/impact.js';
import { wrapValidator, type NotationValidationResult, type ValidatorRegistration } from '../notation-types.js';

function validate(input: unknown): NotationValidationResult {
  const r = parseImpactViewConfig(input);
  if (r.ok) return { valid: true, errors: [], warnings: [] };
  return {
    valid: false,
    errors: r.errors.map((message) => ({ code: 'COMPIMP-001', message })),
    warnings: [],
  };
}

export const registration: ValidatorRegistration = {
  notation: 'compliance-impact',
  validator: wrapValidator(validate),
  canonicalViewExtension: true,
};
