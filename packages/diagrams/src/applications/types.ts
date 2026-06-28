export type ApplicationType = 'application' | 'integration' | 'platform' | 'data_store';
export type ApplicationStatus = 'Draft' | 'Active' | 'Deprecated' | 'Decommissioning';
export type IntegrationDirection = 'inbound' | 'outbound' | 'bidirectional';

export type IntegrationSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';
export type IntegrationDirectionality = 'producer' | 'consumer' | 'request_reply' | 'bidirectional_stream';

export interface ApplicationIntegration {
  target?: string;
  source?: string;
  direction?: IntegrationDirection;
  protocol?: string;
  description?: string;
  interface_semantics?: boolean;
  payload_class?: string;
  sensitivity?: IntegrationSensitivity;
  directionality?: IntegrationDirectionality;
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
