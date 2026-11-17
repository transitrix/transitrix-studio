import { BpmnModdle } from 'bpmn-moddle';
import { emitBpmnXmlWithVersion } from './emitter-core.js';
import { layoutProcess } from './layout.js';
import { validateProcess } from './validator.js';
import type { ProcessIr } from './ir.js';
import type { LayoutDiagramOptions } from './layout-options.js';
import type { ValidationFinding, ValidatorConfig } from './validator-types.js';
import type { CompileResult } from './compiler.js';

/** Shared validation, layout and XML round trip; no host configuration or file IO. */
export async function compileBpmnIr(ir: ProcessIr, exporterVersion: string,
  layoutOptions?: Partial<LayoutDiagramOptions>, validatorConfig?: ValidatorConfig): Promise<CompileResult> {
  const validation = validateProcess(ir, validatorConfig)

  const layout = await layoutProcess(ir, layoutOptions)
  const xml = emitBpmnXmlWithVersion(layout, exporterVersion)

  // RD-111: BpmnModdle round-trip validation
  // Parse the emitted XML to detect BPMN 2.0 conformance violations
  const moddle = new BpmnModdle()
  const { warnings: bpmnWarnings } = await moddle.fromXML(xml, 'bpmn:Definitions')

  // Convert BpmnModdle warnings to validation findings (error severity)
  // Any XML generation defect is a compiler bug, not a user error
  if (bpmnWarnings && bpmnWarnings.length > 0) {
    const bpmnFindings: ValidationFinding[] = bpmnWarnings.map((warning: { message?: string }) => ({
      ruleId: 'RD-111-BPMN-MODDLE',
      severity: 'error' as const,
      message: `BPMN 2.0 conformance: ${warning.message ?? String(warning)}`,
      hint: 'This is a Transitrix Studio compiler bug; please report it',
      docUrl: 'docs/validation.md#bpmn-moddle-validation',
    }))
    validation.findings.push(...bpmnFindings)
    validation.summary.errorCount += bpmnFindings.length
    validation.isValid = false
  }

  return { ir, layout, xml, validation };
}
