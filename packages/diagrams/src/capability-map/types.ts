export type CapabilityType = 'domain' | 'supporting';

export interface CapabilityNode {
  id: string;
  name: string;
  type?: CapabilityType;
  description?: string;
  current_maturity: number;
  target_maturity?: number;
  target_date?: string;
  owner_role?: string;
  business_process?: string;
  applications?: string[];
  children?: CapabilityNode[];
}

export interface CapabilityMapHeader {
  id: string;
  name: string;
  description?: string;
  assessment_date: string;
  capabilities: CapabilityNode[];
}

export interface CapabilityMapFile {
  notation: string;
  spec_version?: string;
  capability_map: CapabilityMapHeader;
}
