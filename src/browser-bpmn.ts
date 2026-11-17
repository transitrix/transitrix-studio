import { createBpmnParser, type ParseError } from './parser-core.js';
import { compileBpmnIr } from './compiler-core.js';
import { validator } from './validator.js';
import type { ProcessIr } from './ir.js';
import type { ValidationReport } from './validator-types.js';

export interface BpmnTrialExample {
  id: string;
  revision: string;
  source: string;
  filename: string;
}
export interface BpmnTrialIdentity {
  generation: number;
  exampleId: string;
  exampleRevision: string;
  source: string;
}
export type BpmnTrialResult = BpmnTrialIdentity & (
  | { status: 'valid'; xml: string; ir: ProcessIr; validation: ValidationReport; changed: boolean; filename: string }
  | { status: 'invalid'; message: string; errors: string[]; validation?: ValidationReport }
  | { status: 'stale' }
);

/**
 * Browser-local BPMN compilation using the same schema, IR, rules, layout and XML
 * as Studio. Supply schemas/bpmn-dsl.schema.json from the same source revision.
 * The host renders XML with bpmn-js and keeps its last-valid preview explicitly
 * stale on an invalid edit. Create a new adapter when switching examples.
 */
export function createBpmnTrialAdapter(options: {
  schema: object;
  exporterVersion: string;
  example: BpmnTrialExample;
}) {
  const example = { ...options.example };
  const exporterVersion = options.exporterVersion;
  if (!example.id || !example.revision || !options.exporterVersion ||
      !/^[^/\\]+\.bpmn\.transitrix\.yaml$/.test(example.filename)) {
    throw new Error('An identified example and a .bpmn.transitrix.yaml filename are required');
  }
  const parser = createBpmnParser(options.schema);
  const baseline = JSON.stringify(parser.parseYamlToIr(example.source));
  const enabledRules = new Set([...validator.getRules()].filter(([, rule]) => !rule.offByDefault).map(([id]) => id));
  let generation = 0;
  let current: BpmnTrialResult | undefined;

  async function compile(source: string): Promise<BpmnTrialResult> {
    const identity: BpmnTrialIdentity = Object.freeze({ generation: ++generation,
      exampleId: example.id, exampleRevision: example.revision, source });
    let result: BpmnTrialResult;
    try {
      const ir = parser.parseYamlToIr(source);
      const output = await compileBpmnIr(ir, exporterVersion, undefined, { enabledRules });
      result = output.validation.isValid
        ? { ...identity, status: 'valid', xml: output.xml, ir, validation: output.validation,
          changed: JSON.stringify(ir) !== baseline, filename: example.filename }
        : { ...identity, status: 'invalid', message: 'BPMN validation failed',
          errors: output.validation.findings.filter(f => f.severity === 'error').map(f => f.message),
          validation: output.validation };
    } catch (error) {
      const failure = error as ParseError;
      result = { ...identity, status: 'invalid', message: failure.message ?? String(error),
        errors: failure.errors ?? [failure.message ?? String(error)] };
    }
    if (identity.generation !== generation) return Object.freeze({ ...identity, status: 'stale' });
    current = Object.freeze(result);
    return current;
  }

  return {
    compile,
    /** Exact result ownership rejects obsolete results and results from another adapter. */
    isCurrent(result: BpmnTrialResult): boolean { return result === current && result.generation === generation; },
    /** Invalidate in-flight work on navigation/disposal, without starting another compile. */
    invalidate(): void { ++generation; current = undefined; },
  };
}
