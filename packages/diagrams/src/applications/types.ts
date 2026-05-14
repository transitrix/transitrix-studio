export type ApplicationType = 'application' | 'integration' | 'platform' | 'data_store';
export type ApplicationStatus = 'Draft' | 'Active' | 'Deprecated' | 'Decommissioning';
export type IntegrationDirection = 'inbound' | 'outbound' | 'bidirectional';

export interface ApplicationIntegration {
  target?: string;
  direction?: IntegrationDirection;
  protocol?: string;
  description?: string;
}

export interface Application {
  app_id: string;
  name: string;
  type: ApplicationType;
  status: ApplicationStatus;
  domain?: string;
  owner_role?: string;
  vendor?: string;
  maturity?: number;
  description?: string;
  capabilities?: string[];
  products?: string[];
  integrations?: ApplicationIntegration[];
  source?: string;
  target?: string;
  protocol?: string;
}

export interface ApplicationsCatalogueHeader {
  id: string;
  name: string;
  description?: string;
  version?: string;
  updated_at: string;
  applications: Application[];
}

export interface ApplicationsCatalogueFile {
  notation: string;
  spec_version?: string;
  applications_catalogue: ApplicationsCatalogueHeader;
}
