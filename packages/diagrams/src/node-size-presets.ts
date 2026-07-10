/**
 * Block/cell size presets for diagram renderers.
 *
 * Entity nodes (Goals, DGCA/DGA, Blocks leaves, Activities, Capability Map)
 * share one width × height ladder. Heights use fixed tiers (72 / 80 / 96 px)
 * so name + type + id never collide; widths scale independently (200 / 250 / 320).
 *
 * Process Blueprint uses a separate cell grid, scaled from the same tiers.
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

/** Shared entity-node width tiers (px). */
export const ENTITY_NODE_WIDTH: Record<NodeSizePreset, number> = {
  compact: 200,
  normal: 250,
  wide: 320,
};

/** Shared entity-node height tiers (px) — room for name + type + id. */
export const ENTITY_NODE_HEIGHT: Record<NodeSizePreset, number> = {
  compact: 72,
  normal: 80,
  wide: 96,
};

function entityNodeSize(preset: NodeSizePreset): BoxDimensions {
  return { width: ENTITY_NODE_WIDTH[preset], height: ENTITY_NODE_HEIGHT[preset] };
}

/** Canonical entity-node sizes — used by every box-based notation preview. */
export const ENTITY_NODE_SIZE: PresetTable<BoxDimensions> = {
  compact: entityNodeSize('compact'),
  normal: entityNodeSize('normal'),
  wide: entityNodeSize('wide'),
};

/** @deprecated alias — use {@link ENTITY_NODE_SIZE} */
export const GOALS_NODE_SIZE = ENTITY_NODE_SIZE;
/** @deprecated alias — use {@link ENTITY_NODE_SIZE} */
export const DGCA_NODE_SIZE = ENTITY_NODE_SIZE;
/** @deprecated alias — use {@link ENTITY_NODE_SIZE} */
export const BLOCKS_LEAF_SIZE = ENTITY_NODE_SIZE;
/** @deprecated alias — use {@link ENTITY_NODE_SIZE} */
export const ACTION_NODE_SIZE = ENTITY_NODE_SIZE;

export const CAPABILITY_MAP_NODE_SIZE: PresetTable<CapabilityMapDimensions> = {
  compact: { nodeWidth: ENTITY_NODE_WIDTH.compact, nodeHeight: ENTITY_NODE_HEIGHT.compact },
  normal: { nodeWidth: ENTITY_NODE_WIDTH.normal, nodeHeight: ENTITY_NODE_HEIGHT.normal },
  wide: { nodeWidth: ENTITY_NODE_WIDTH.wide, nodeHeight: ENTITY_NODE_HEIGHT.wide },
};

const PROCESS_BLUEPRINT_NORMAL: ProcessBlueprintDimensions = {
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
};

function scaleBlueprint(
  base: ProcessBlueprintDimensions,
  widthScale: number,
  heightScale: number,
): ProcessBlueprintDimensions {
  const w = (n: number) => Math.round(n * widthScale);
  const h = (n: number) => Math.round(n * heightScale);
  return {
    legendColumnWidth: w(base.legendColumnWidth),
    stageColumnWidth: w(base.stageColumnWidth),
    stageHeaderHeight: h(base.stageHeaderHeight),
    goalRowHeight: h(base.goalRowHeight),
    resultRowHeight: h(base.resultRowHeight),
    aspectRowMinHeight: h(base.aspectRowMinHeight),
    pillHeight: h(base.pillHeight),
    pillGap: base.pillGap,
    cellPadding: base.cellPadding,
    textLineHeight: h(base.textLineHeight),
    textCharWidth: base.textCharWidth,
    cellTextPadX: base.cellTextPadX,
    cellTextPadY: base.cellTextPadY,
  };
}

const PB_WIDTH_SCALE: Record<NodeSizePreset, number> = {
  compact: ENTITY_NODE_WIDTH.compact / ENTITY_NODE_WIDTH.normal,
  normal: 1,
  wide: ENTITY_NODE_WIDTH.wide / ENTITY_NODE_WIDTH.normal,
};

const PB_HEIGHT_SCALE: Record<NodeSizePreset, number> = {
  compact: ENTITY_NODE_HEIGHT.compact / ENTITY_NODE_HEIGHT.normal,
  normal: 1,
  wide: ENTITY_NODE_HEIGHT.wide / ENTITY_NODE_HEIGHT.normal,
};

export const PROCESS_BLUEPRINT_SIZE: PresetTable<ProcessBlueprintDimensions> = {
  compact: scaleBlueprint(PROCESS_BLUEPRINT_NORMAL, PB_WIDTH_SCALE.compact, PB_HEIGHT_SCALE.compact),
  normal: PROCESS_BLUEPRINT_NORMAL,
  wide: scaleBlueprint(PROCESS_BLUEPRINT_NORMAL, PB_WIDTH_SCALE.wide, PB_HEIGHT_SCALE.wide),
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
  return ENTITY_NODE_SIZE[preset];
}

export function resolveDgcaNodeSize(preset: NodeSizePreset): BoxDimensions {
  return ENTITY_NODE_SIZE[preset];
}

export function resolveBlocksLeafSize(preset: NodeSizePreset): BlocksLeafDimensions {
  return ENTITY_NODE_SIZE[preset];
}

export function resolveActionNodeSize(preset: NodeSizePreset): BoxDimensions {
  return ENTITY_NODE_SIZE[preset];
}

export function resolveProcessBlueprintSize(preset: NodeSizePreset): ProcessBlueprintDimensions {
  return PROCESS_BLUEPRINT_SIZE[preset];
}

export function resolveCapabilityMapNodeSize(preset: NodeSizePreset): CapabilityMapDimensions {
  return CAPABILITY_MAP_NODE_SIZE[preset];
}
