import { validateBlocks } from '@transitrix/diagrams/blocks/validate.js';
import { GRID_TEMPLATE_RULES } from '@transitrix/diagrams/blocks/templates/index.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  if (options.template !== undefined) {
    const rules = GRID_TEMPLATE_RULES[options.template];
    // An unrecognised --template name must fail loudly, not silently validate
    // the grid without the template invariant the caller asked for — a typo
    // (e.g. "racy") would otherwise pass a RACI file with a missing/duplicate
    // Accountable owner with no warning at all.
    if (!rules) {
      const known = Object.keys(GRID_TEMPLATE_RULES);
      return {
        valid: false,
        errors: [
          {
            code: 'BL-TEMPLATE-UNKNOWN',
            message:
              known.length > 0
                ? `Unknown --template "${options.template}". Known templates: ${known.join(', ')}.`
                : `Unknown --template "${options.template}". No grid templates are registered.`,
          },
        ],
        warnings: [],
      };
    }
    return mapPackageResult(validateBlocks(input, { rules }));
  }
  return mapPackageResult(validateBlocks(input, {}));
}

export const registration: ValidatorRegistration = {
  notation: 'blocks',
  validator: validate,
  canonicalViewExtension: true,
};
