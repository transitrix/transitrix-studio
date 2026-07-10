/**
 * Block/cell size presets for diagram renderers.
 *
 * Presets drive both layout geometry and shared text-layout char budgets.
 * Smooth per-pixel sliders are intentionally deferred.
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

/** Scale `height` proportionally when only `width` changes — keeps node aspect locked. */
function aspectLocked(base: BoxDimensions, width: number): BoxDimensions {
  return { width, height: Math.round((base.height * width) / base.width) };
}

const GOALS_NODE_SIZE_NORMAL: BoxDimensions = { width: 250, height: 72 };
export const GOALS_NODE_SIZE: PresetTable<BoxDimensions> = {
  compact: aspectLocked(GOALS_NODE_SIZE_NORMAL, 200),
  normal: GOALS_NODE_SIZE_NORMAL,
  wide: aspectLocked(GOALS_NODE_SIZE_NORMAL, 320),
};

const DGCA_NODE_SIZE_NORMAL: BoxDimensions = { width: 220, height: 72 };
export const DGCA_NODE_SIZE: PresetTable<BoxDimensions> = {
  compact: aspectLocked(DGCA_NODE_SIZE_NORMAL, 200),
  normal: DGCA_NODE_SIZE_NORMAL,
  wide: aspectLocked(DGCA_NODE_SIZE_NORMAL, 280),
};

const BLOCKS_LEAF_SIZE_NORMAL: BlocksLeafDimensions = { width: 160, height: 72 };
export const BLOCKS_LEAF_SIZE: PresetTable<BlocksLeafDimensions> = {
  compact: aspectLocked(BLOCKS_LEAF_SIZE_NORMAL, 140),
  normal: BLOCKS_LEAF_SIZE_NORMAL,
  wide: aspectLocked(BLOCKS_LEAF_SIZE_NORMAL, 200),
};

const ACTION_NODE_SIZE_NORMAL: BoxDimensions = { width: 200, height: 80 };
export const ACTION_NODE_SIZE: PresetTable<BoxDimensions> = {
  compact: aspectLocked(ACTION_NODE_SIZE_NORMAL, 180),
  normal: ACTION_NODE_SIZE_NORMAL,
  wide: aspectLocked(ACTION_NODE_SIZE_NORMAL, 260),
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

const CAPABILITY_MAP_NODE_SIZE_NORMAL: CapabilityMapDimensions = { nodeWidth: 240, nodeHeight: 60 };
export const CAPABILITY_MAP_NODE_SIZE: PresetTable<CapabilityMapDimensions> = {
  compact: {
    nodeWidth: 200,
    nodeHeight: Math.round((CAPABILITY_MAP_NODE_SIZE_NORMAL.nodeHeight * 200) / CAPABILITY_MAP_NODE_SIZE_NORMAL.nodeWidth),
  },
  normal: CAPABILITY_MAP_NODE_SIZE_NORMAL,
  wide: {
    nodeWidth: 300,
    nodeHeight: Math.round((CAPABILITY_MAP_NODE_SIZE_NORMAL.nodeHeight * 300) / CAPABILITY_MAP_NODE_SIZE_NORMAL.nodeWidth),
  },
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
