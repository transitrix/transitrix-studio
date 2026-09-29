import { validateHistory } from '@transitrix/diagrams/standalone/history.js';
import type { ValidatorRegistration } from '../notation-types.js';
export const registration: ValidatorRegistration = { notation: 'history', validator: validateHistory };
