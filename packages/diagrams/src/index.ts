export * from "./activities/index";
export * from "./activity-card/index";
export * from "./actor/index";
export * from "./business-service/index";
export * from "./geometry";
export * from "./applications/index";
export * from "./assertion/index";
export * from "./blocks/index";
// capability-map/index.js also exports a set of DSM-migration symbols
// (Capability, reparent, addChild, LayoutOptions, ThemeTokens, ...) that
// reuse the goals module's exact generic Layer-A/B naming convention by
// design (both follow the same extraction-spec template) — the wildcard
// re-export below would collide with goals' identically-named symbols.
// Neither spec's acceptance criteria asks for root-barrel access (only
// `@transitrix/diagrams/goals` / `@transitrix/diagrams/capability-map`
// subpath imports), so the colliding names are simply left off the root
// barrel; they're still importable via the capability-map subpath.
export type {
  CapabilityType,
  CapabilityNode,
  CapabilityMapHeader,
  CapabilityMapFile,
  CapabilityTreeNode,
  CapabilityTreeEdge,
  CapabilityTreeLevelCounts,
  CapabilityTreeLayout,
  RenderCapabilityTreeOptions,
} from "./capability-map/index";
export {
  validateCapabilityMap,
  layoutCapabilityTree,
  TREE_NODE_WIDTH,
  TREE_NODE_HEIGHT,
  TREE_RANK_SEP,
  TREE_NODE_SEP,
  renderCapabilityTreeSvg,
} from "./capability-map/index";
export * from "./change/index";
export * from "./compliance/index";
export * from "./compliance-matrix/index";
export * from "./confidence/index";
export * from "./factor/index";
export * from "./fgca/index";
export * from "./goals/index";
export * from "./integration/index";
export * from "./location/index";
export * from "./node/index";
export * from "./process-blueprint/index";
export * from "./process-map/index";
export * from "./products/index";
export * from "./repo-validate/index";
export * from "./requirement/index";
export * from "./scenarios/index";
export * from "./stakeholder/index";
export * from "./target-state/index";
export * from "./technology-service/index";
export { SCHEMA_VERSION } from "./schema-version";
export * from "./theme/index";
export * from "./typed-id";
export * from "./validation-types";
export { coerceDatesToIsoStrings } from "./yaml-normalize";
