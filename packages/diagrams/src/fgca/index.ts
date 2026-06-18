export { buildFGCALayout, NODE_WIDTH, NODE_HEIGHT, COLUMN_GAP, ROW_GAP, COLUMN_BG } from "./layout";
export type { FGCALayoutInput } from "./layout";
export {
  layoutFGCAPreview,
  selectScopedFGCA,
  FGCA_NODE_W,
  FGCA_NODE_H,
  FGCA_HEADER_H,
  FGCA_PAD,
  FGCA_DEFAULT_COL_GAP,
  FGCA_DEFAULT_ROW_GAP,
} from "./preview-layout";
export type {
  FGCAPreviewColumn,
  FGCAPreviewDoc,
  FGCAPreviewLayout,
  FGCAPreviewLayoutOptions,
  FGCAPreviewNode,
  FGCAPreviewEdge,
  FGCAPreviewColumnPos,
} from "./preview-layout";
export { buildChainTable } from "./chain-table";
export type { ChainTable, ChainTableCell, ChainColumn, ChainCell, ChainTableOptions } from "./chain-table";
export { validateFGCADoc } from "./validate";
export type { FGCADoc, FGCAValidationResult, FGCAValidationError, FGCAValidationWarning } from "./validate";
export {
  ALL_FGCA_COLUMNS,
  FGCA_COLUMN_LABELS,
} from "./types";
export type {
  FactorItem,
  GoalItem,
  BdnChangeWithActivities,
  ActivityItem,
  ActivityTypeItem,
  DiagramStyle,
  FGCAColumn,
} from "./types";
export { resolveFGCA, isFGCAViewDoc } from './resolver.js';
export type { FGCAViewConfig, FGCACanonSources } from './resolver.js';
export { default as FGCAFactorNode } from "./nodes/FGCAFactorNode";
export { default as FGCAGoalNode } from "./nodes/FGCAGoalNode";
export { default as FGCAChangeNode } from "./nodes/FGCAChangeNode";
export { default as FGCAActivityNode } from "./nodes/FGCAActivityNode";

/** ReactFlow nodeTypes map — pass directly to <ReactFlow nodeTypes={FGCA_NODE_TYPES} /> */
export { FGCA_NODE_TYPES } from "./nodeTypes";
