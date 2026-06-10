import { emitBpmnXml } from './emitter.js'
import type { LayoutDiagramOptions } from './layout-options.js'
import { layoutProcess } from './layout.js'
import { parseYamlToIr } from './parser.js'
import type { ProcessIr, LayoutIr } from './ir.js'
import { validateProcess, validator } from './validator.js'
import type { ValidationReport, ValidationFinding, ValidatorConfig } from './validator-types.js'
import { loadTransitrixrc, assertNoCriticalRuleDowngrade, mergeConfigWithDefaults } from './cervinrc.js'
import { BpmnModdle } from 'bpmn-moddle'

export type { LayoutDiagramOptions } from './layout-options.js'
export { parseLayoutDiagramOptionsFromJson } from './layout-options.js'

export interface CompileTransitrixOptions {
  layout?: Partial<LayoutDiagramOptions>
}

/** @deprecated Use {@link CompileTransitrixOptions}. */
export type CompileCervinOptions = CompileTransitrixOptions

export interface CompileResult {
  ir: ProcessIr
  layout: LayoutIr
  xml: string
  validation: ValidationReport
}

/** YAML (Transitrix DSL) → BPMN 2.0 XML document string. */
export async function compileTransitrixYaml(
  yamlText: string,
  options?: CompileTransitrixOptions,
): Promise<string> {
  const ir = parseYamlToIr(yamlText)
  const layout = await layoutProcess(ir, options?.layout)
  return emitBpmnXml(layout)
}

/** YAML (Transitrix DSL) → IR + Layout + XML (for metrics/testing). */
export async function compileTransitrixYamlWithLayout(
  yamlText: string,
  options?: CompileTransitrixOptions,
): Promise<CompileResult> {
  const ir = parseYamlToIr(yamlText)

  // RD-097: Load and apply config overrides
  const rcConfig = loadTransitrixrc()
  assertNoCriticalRuleDowngrade(validator.getRules(), rcConfig)
  const enabledRules = mergeConfigWithDefaults(validator.getRules(), rcConfig)

  // Validate with config applied
  const validatorConfig: ValidatorConfig = { enabledRules }
  const validation = validateProcess(ir, validatorConfig)

  const layout = await layoutProcess(ir, options?.layout)
  const xml = emitBpmnXml(layout)

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

  return { ir, layout, xml, validation }
}

// Cervin → Transitrix internal API rename (CLAUDE.md §Cervin naming, P5).
// Deprecated aliases kept for one minor so out-of-repo importers (and the
// bundled extension compiler consumer) keep working; removed in 2.0.0.

/** @deprecated Use {@link compileTransitrixYaml}. */
export const compileCervinYaml = compileTransitrixYaml

/** @deprecated Use {@link compileTransitrixYamlWithLayout}. */
export const compileCervinYamlWithLayout = compileTransitrixYamlWithLayout
