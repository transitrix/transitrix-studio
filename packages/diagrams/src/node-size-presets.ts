/**
 * Block/cell size presets for diagram renderers (strategy #521).
 *
 * Presets drive both layout geometry and shared text-layout char budgets.
 * Smooth per-pixel sliders are intentionally deferred — see hub issue #521.
 */

export type NodeSizePreset = 'compact' | 'normal' | 'wide';

export const NODE_SIZE_PRESET_VALUES: readonly NodeSizePreset[] = ['compact', 'normal', 'wide'] as const;

export interface BoxDimensions {
  width: number;
  height: number;
}

export interface BlocksLeafDimensions extends BoxDimensions {}

export interface ProcessBlueprintDimensions {
  legendColumnWidth: number;
  stageColumnWidth: number;
  stageHeaderHeight: number;
  goalRowHeight: number;
  resultRowHeight: number;
  aspectRowMinHeight: number;
  pillHeight: number;
  pillGap: number;
  cellPadding: number;
  textLineHeight: number;
  textCharWidth: number;
  cellTextPadX: number;
  cellTextPadY: number;
}

export interface CapabilityMapDimensions {
  nodeWidth: number;
  nodeHeight: number;
}

type PresetTable<T> = Record<NodeSizePreset, T>;

export const GOALS_NODE_SIZE: PresetTable<BoxDimensions> = {
  compact: { width: 200, height: 72 },
  normal: { width: 250, height: 72 },
  wide: { width: 320, height: 72 },
};

export const DGCA_NODE_SIZE: PresetTable<BoxDimensions> = {
  compact: { width: 200, height: 72 },
  normal: { width: 220, height: 72 },
  wide: { width: 280, height: 72 },
};

export const BLOCKS_LEAF_SIZE: PresetTable<BlocksLeafDimensions> = {
  compact: { width: 140, height: 72 },
  normal: { width: 160, height: 72 },
  wide: { width: 200, height: 72 },
};

export const ACTION_NODE_SIZE: PresetTable<BoxDimensions> = {
  compact: { width: 180, height: 72 },
  normal: { width: 200, height: 80 },
  wide: { width: 260, height: 80 },
};

export const PROCESS_BLUEPRINT_SIZE: PresetTable<ProcessBlueprintDimensions> = {
  compact: {
    legendColumnWidth: 120,
    stageColumnWidth: 180,
    stageHeaderHeight: 36,
    goalRowHeight: 52,
    resultRowHeight: 52,
    aspectRowMinHeight: 56,
    pillHeight: 36,
    pillGap: 4,
    cellPadding: 8,
    textLineHeight: 16,
    textCharWidth: 7.5,
    cellTextPadX: 10,
    cellTextPadY: 10,
  },
  normal: {
    legendColumnWidth: 140,
    stageColumnWidth: 220,
    stageHeaderHeight: 40,
    goalRowHeight: 56,
    resultRowHeight: 56,
    aspectRowMinHeight: 60,
    pillHeight: 40,
    pillGap: 4,
    cellPadding: 8,
    textLineHeight: 17,
    textCharWidth: 7.5,
    cellTextPadX: 10,
    cellTextPadY: 10,
  },
  wide: {
    legendColumnWidth: 160,
    stageColumnWidth: 280,
    stageHeaderHeight: 44,
    goalRowHeight: 60,
    resultRowHeight: 60,
    aspectRowMinHeight: 64,
    pillHeight: 44,
    pillGap: 4,
    cellPadding: 8,
    textLineHeight: 18,
    textCharWidth: 7.5,
    cellTextPadX: 10,
    cellTextPadY: 10,
  },
};

export const CAPABILITY_MAP_NODE_SIZE: PresetTable<CapabilityMapDimensions> = {
  compact: { nodeWidth: 200, nodeHeight: 56 },
  normal: { nodeWidth: 240, nodeHeight: 60 },
  wide: { nodeWidth: 300, nodeHeight: 64 },
};

export type NodeSizeNotation =
  | 'goals'
  | 'dgca'
  | 'dga'
  | 'blocks'
  | 'action'
  | 'processBlueprint'
  | 'capabilityMap';

/** Parse a VS Code setting value into a preset id (defaults to `normal`). */
export function parseNodeSizePreset(value: string | undefined): NodeSizePreset {
  if (value === 'compact' || value === 'wide') return value;
  return 'normal';
}

export function resolveGoalsNodeSize(preset: NodeSizePreset): BoxDimensions {
  return GOALS_NODE_SIZE[preset];
}

export function resolveDgcaNodeSize(preset: NodeSizePreset): BoxDimensions {
  return DGCA_NODE_SIZE[preset];
}

export function resolveBlocksLeafSize(preset: NodeSizePreset): BlocksLeafDimensions {
  return BLOCKS_LEAF_SIZE[preset];
}

export function resolveActionNodeSize(preset: NodeSizePreset): BoxDimensions {
  return ACTION_NODE_SIZE[preset];
}

export function resolveProcessBlueprintSize(preset: NodeSizePreset): ProcessBlueprintDimensions {
  return PROCESS_BLUEPRINT_SIZE[preset];
}

export function resolveCapabilityMapNodeSize(preset: NodeSizePreset): CapabilityMapDimensions {
  return CAPABILITY_MAP_NODE_SIZE[preset];
}
