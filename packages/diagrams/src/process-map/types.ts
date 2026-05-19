export type ProcessGroupType = 'operating' | 'supporting' | 'management';
export type ProcessStatus = 'Draft' | 'Active' | 'Deprecated';

export interface MapProcess {
  process_id: string;
  name: string;
  status: ProcessStatus;
  owner_role?: string;
  capability?: string;
  maturity?: number;
  bpmn_file?: string;
  description?: string;
}

export interface ProcessGroup {
  id: string;
  name: string;
  type: ProcessGroupType;
  description?: string;
  processes: MapProcess[];
}

export interface ProcessMapHeader {
  id: string;
  name: string;
  description?: string;
  version?: string;
  updated_at: string;
  groups: ProcessGroup[];
}

export interface ProcessMapFile {
  notation: string;
  spec_version?: string;
  process_map: ProcessMapHeader;
}
