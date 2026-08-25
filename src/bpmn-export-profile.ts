import { mergeLayoutDiagramOptions, type LayoutDiagramOptions } from './layout-options.js';

/**
 * Named BPMN visual-export profiles.
 *
 * `default` is the interactive-preview layout (unchanged knobs).
 * `presentation` is a denser automatic layout for slide/frame export — it is
 * never applied unless the caller asks for it.
 */
export type BpmnExportProfileId = 'default' | 'presentation';

export const BPMN_EXPORT_PROFILES: readonly BpmnExportProfileId[] = ['default', 'presentation'];

/** Slide/frame width the presentation profile must fit (px). */
export const BPMN_PRESENTATION_FRAME_PX = 1780;

/** Minimum effective CSS label size after any SVG transform (px). */
export const BPMN_PRESENTATION_MIN_LABEL_PX = 20;

/**
 * Compact spacing so a 20 px label still fits the presentation frame.
 * Node sizes stay the default `elkNodeSize` table — only gutters change.
 */
export const PRESENTATION_LAYOUT_PARTIAL: Partial<LayoutDiagramOptions> = {
  poolPad: 8,
  poolOriginX: 8,
  poolOriginY: 8,
  participantLabelBand: 36,
  laneLabelWidth: 44,
  laneVerticalGap: 12,
  laneContentRightPad: 16,
  laneContentLeftPad: 16,
  elkNodeSpacing: 24,
  elkLayerSpacing: 36,
  elkDiagramPadding: 16,
  uniformLaneHeight: false,
};

export function parseBpmnExportProfile(raw: string | undefined): BpmnExportProfileId | undefined {
  if (raw === undefined || raw === '') return 'default';
  if (raw === 'default' || raw === 'presentation') return raw;
  return undefined;
}

export function layoutOptionsForProfile(
  profile: BpmnExportProfileId,
  extra?: Partial<LayoutDiagramOptions>,
): LayoutDiagramOptions {
  if (profile === 'presentation') {
    return mergeLayoutDiagramOptions({ ...PRESENTATION_LAYOUT_PARTIAL, ...extra });
  }
  return mergeLayoutDiagramOptions(extra);
}
