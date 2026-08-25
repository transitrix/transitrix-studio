import {
  PRESENTATION_BPMN_TYPOGRAPHY,
  renderProcessLayoutSvg,
  type ProcessDiagramLayout,
} from '@transitrix/diagrams/webview/render-process.js';

import { compileTransitrixYamlWithLayout } from './compiler.js';
import {
  layoutOptionsForProfile,
  type BpmnExportProfileId,
} from './bpmn-export-profile.js';

export interface BpmnVisualExport {
  profile: BpmnExportProfileId;
  svg: string;
  layout: ProcessDiagramLayout;
}

/** YAML → custom-renderer SVG for a named export profile. Preview knobs are not applied. */
export async function exportBpmnVisual(
  yamlText: string,
  profile: BpmnExportProfileId = 'default',
): Promise<BpmnVisualExport> {
  const layoutOpts = layoutOptionsForProfile(profile);
  const { layout } = await compileTransitrixYamlWithLayout(yamlText, { layout: layoutOpts });
  const diagram = layout as unknown as ProcessDiagramLayout;
  const svg =
    profile === 'presentation'
      ? renderProcessLayoutSvg(diagram, { typography: PRESENTATION_BPMN_TYPOGRAPHY })
      : renderProcessLayoutSvg(diagram);
  return { profile, svg, layout: diagram };
}
