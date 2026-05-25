export interface Block {
  id: string;
  name: string;
  description?: string;
  children?: Block[];
}

export interface NestedBlocksHeader {
  id: string;
  name: string;
  description?: string;
  version?: string;
  date?: string;
  author?: string;
  blocks: Block[];
}

export interface BlocksFile {
  notation: string;
  spec_version?: string;
  nested_blocks: NestedBlocksHeader;
}

export interface BlocksLayoutOptions {
  /** Width of a leaf block (a block with no children). */
  leafWidth?: number;
  /** Height of a leaf block. */
  leafHeight?: number;
  /** Padding inside every block (between header / inner edges and children). */
  padding?: number;
  /** Header strip height that carries the block's name. */
  headerHeight?: number;
  /** Gap between sibling children inside the same parent. */
  childGap?: number;
  /** Gap between independent top-level blocks (vertical stacking). */
  topLevelGap?: number;
}

export interface LaidOutBlock {
  id: string;
  name: string;
  description?: string;
  /** Tree depth starting at 1 for top-level blocks. */
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  headerHeight: number;
  children: LaidOutBlock[];
}

export interface LayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BlocksLayout {
  bounds: LayoutBounds;
  /** Top-level blocks; each carries its own subtree of laid-out children. */
  blocks: LaidOutBlock[];
  /** Maximum nesting depth in the laid-out tree (1-indexed). */
  maxDepth: number;
}
