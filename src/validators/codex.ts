import { validateCodex, folderJurisdictionFromPath } from '@transitrix/diagrams/codex/validate.js';
import {
  mapPackageResult,
  type NotationValidationResult,
  type ValidateNotationOptions,
  type ValidatorRegistration,
} from '../notation-types.js';

function validate(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(
    validateCodex(input, {
      folderJurisdiction: options.filePath ? folderJurisdictionFromPath(options.filePath) : undefined,
    }),
  );
}

export const registration: ValidatorRegistration = {
  notation: 'codex',
  validator: validate,
};
