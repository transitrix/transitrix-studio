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

export interface GridColumn {
  id: string;
  name: string;
}

export interface GridRow {
  id: string;
  name: string;
  assign?: Record<string, unknown>;
}

export interface GridHeader {
  columns: GridColumn[];
  rows: GridRow[];
}

export interface GridFile {
  notation: string;
  spec_version?: string;
  grid: GridHeader;
}

export interface GridLayoutOptions {
  /** Width of each data column (px). */
  columnWidth?: number;
  /** Height of each data row (px). */
  rowHeight?: number;
  /** Width of the row-header column carrying each row's name (px). */
  rowHeaderWidth?: number;
  /** Height of the column-header row carrying each column's name (px). */
  headerHeight?: number;
}

export interface LaidOutGridColumn {
  id: string;
  name: string;
  x: number;
  width: number;
}

export interface LaidOutGridRow {
  id: string;
  name: string;
  y: number;
  height: number;
}

export interface LaidOutGridCell {
  rowId: string;
  colId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The cell's `assign` value, stringified; omitted (blank) when unassigned. */
  value?: string;
}

export interface GridLayout {
  bounds: LayoutBounds;
  rowHeaderWidth: number;
  headerHeight: number;
  columns: LaidOutGridColumn[];
  rows: LaidOutGridRow[];
  cells: LaidOutGridCell[];
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

import type { LayoutBounds } from '../geometry.js';
export type { LayoutBounds };

export interface BlocksLayout {
  bounds: LayoutBounds;
  /** Top-level blocks; each carries its own subtree of laid-out children. */
  blocks: LaidOutBlock[];
  /** Maximum nesting depth in the laid-out tree (1-indexed). */
  maxDepth: number;
}
