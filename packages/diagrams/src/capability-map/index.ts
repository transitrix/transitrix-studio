export type {
  CapabilityType,
  CapabilityNode,
  CapabilityMapHeader,
  CapabilityMapFile,
} from './types.js';

export { validateCapabilityMap } from './validate.js';

export type {
  CapabilityTreeNode,
  CapabilityTreeEdge,
  CapabilityTreeLevelCounts,
  CapabilityTreeLayout,
} from './layout-tree.js';
export { layoutCapabilityTree, TREE_NODE_WIDTH, TREE_NODE_HEIGHT, TREE_RANK_SEP, TREE_NODE_SEP } from './layout-tree.js';

export type { RenderCapabilityTreeOptions } from './render-capability-tree.js';
export { renderCapabilityTreeSvg } from './render-capability-tree.js';

// ── DSM-migration capability map (docs/internal/extraction/capability-map.md) ───────
// A separate, flat, address-triple data model from CapabilityNode above —
// see dsm-schema.ts for why the two coexist in this folder. Named
// `validateCapabilityMapData` rather than `validateCapabilityMap` because
// that name is already taken by the native-notation validator on line 8.

export type {
  Capability,
  CapabilityMap,
  MaturitySnapshot,
  MutationResult,
  LayoutOptions,
  LaidOutNode,
  LaidOutEdge,
  CapabilityMapLayout,
} from './dsm-schema.js';

export {
  parseAddress,
  formatAddress,
  getLevel,
  getParentAddress,
  getFirstFreeAddress,
  isAddressTaken,
} from './address.js';

export { validateCapabilityMapData } from './dsm-validate.js';
export { layoutCapabilityMap } from './dsm-layout.js';
export { reparent, addChild, deleteWithDescendants, moveBranchToBacklog, restoreFromBacklog, normaliseAddresses } from './dsm-mutations.js';

export { CapabilityMapView } from './CapabilityMapView.js';
export type { CapabilityMapViewProps, CapabilityMapChange } from './CapabilityMapView.js';
export type { ThemeTokens } from './dsm-theme.js';
export { DEFAULT_MATURITY_COLOURS } from './dsm-theme.js';
