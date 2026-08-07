import { parseCoverageMetricConfig } from '@transitrix/diagrams/compliance/coverage-metric.js';
import { wrapValidator, type NotationValidationResult, type ValidatorRegistration } from '../notation-types.js';

function splitComplianceCode(message: string, fallback: string): { code: string; message: string } {
  const m = message.match(/^([A-Z][A-Z0-9_-]+):\s*(.*)$/s);
  if (m) return { code: m[1], message: m[2].length > 0 ? m[2] : message };
  return { code: fallback, message };
}

function validate(input: unknown): NotationValidationResult {
  const r = parseCoverageMetricConfig(input);
  if (!r.ok) {
    return {
      valid: false,
      errors: r.errors.map((message) => splitComplianceCode(message, 'COVMET-001')),
      warnings: [],
    };
  }
  const warnings = (r.config.warnings ?? []).map((message) =>
    splitComplianceCode(message, 'COVMET-WARN'),
  );
  return { valid: true, errors: [], warnings };
}

export const registration: ValidatorRegistration = {
  notation: 'coverage-metric',
  validator: wrapValidator(validate),
  canonicalViewExtension: true,
};
