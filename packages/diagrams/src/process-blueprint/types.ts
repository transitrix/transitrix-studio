export type AspectCategory = 'systems' | 'actors' | 'equipment' | 'information_entities';

export interface Stage {
  id: string;
  name: string;
  goal: string;
  result: string;
  description?: string;
}

export interface AspectEntry {
  id?: string;
  name: string;
  stages: string[];
  description?: string;
}

export interface ProcessBlueprintHeader {
  id: string;
  name: string;
  description?: string;
  period?: string;
  version?: string;
  date?: string;
  author?: string;
  process?: string;
  scenario?: string;
  stages: Stage[];
  systems?: AspectEntry[];
  actors?: AspectEntry[];
  equipment?: AspectEntry[];
  information_entities?: AspectEntry[];
}

export interface ProcessBlueprintFile {
  notation: string;
  spec_version?: string;
  process_blueprint: ProcessBlueprintHeader;
}

export interface ProcessBlueprintLayoutOptions {
  legendColumnWidth?: number;
  stageColumnWidth?: number;
  stageHeaderHeight?: number;
  goalRowHeight?: number;
  resultRowHeight?: number;
  aspectRowMinHeight?: number;
  pillHeight?: number;
  pillGap?: number;
  cellPadding?: number;
}

export interface LayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LegendCell {
  kind: 'goal' | 'result' | 'aspect';
  category?: AspectCategory;
  label: string;
  y: number;
  height: number;
}

export interface StageHeaderCell {
  stageIndex: number;
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageTextCell {
  stageIndex: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AspectPill {
  category: AspectCategory;
  entryIndex: number;
  name: string;
  id?: string;
  startStageIndex: number;
  endStageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AspectRow {
  category: AspectCategory;
  y: number;
  height: number;
  pills: AspectPill[];
}

export interface ProcessBlueprintLayout {
  bounds: LayoutBounds;
  legendColumnWidth: number;
  stageColumnWidth: number;
  legend: LegendCell[];
  stageHeaders: StageHeaderCell[];
  goalCells: StageTextCell[];
  resultCells: StageTextCell[];
  aspectRows: AspectRow[];
}
