import { emitBpmnXml } from './emitter.js'
import type { LayoutDiagramOptions } from './layout-options.js'
import { layoutProcess } from './layout.js'
import { parseYamlToIr } from './parser.js'
import type { ProcessIr, LayoutIr } from './ir.js'
import { validator } from './validator.js'
import type { ValidationReport } from './validator-types.js'
import { loadTransitrixrc, assertNoCriticalRuleDowngrade, mergeConfigWithDefaults } from './transitrixrc.js'
import { compileBpmnIr } from './compiler-core.js'
import { transitrixPackageVersion } from './package-version.js'

export type { LayoutDiagramOptions } from './layout-options.js'
export { parseLayoutDiagramOptionsFromJson } from './layout-options.js'
export {
  BPMN_EXPORT_PROFILES,
  BPMN_PRESENTATION_FRAME_PX,
  BPMN_PRESENTATION_MIN_LABEL_PX,
  layoutOptionsForProfile,
  parseBpmnExportProfile,
  type BpmnExportProfileId,
} from './bpmn-export-profile.js'

export interface CompileTransitrixOptions {
  layout?: Partial<LayoutDiagramOptions>
}

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

  return compileBpmnIr(ir, transitrixPackageVersion(), options?.layout, { enabledRules })
}
