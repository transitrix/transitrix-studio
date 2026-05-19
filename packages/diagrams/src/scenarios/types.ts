export type ScenarioStatus = 'Draft' | 'Active' | 'Archived';
export type FactorRelevance = 'High' | 'Medium' | 'Low';

export interface FactorView {
  factor_id: string;
  relevance?: FactorRelevance;
  impact?: string;
}

export interface GoalRef        { goal_id: string }
export interface CapabilityRef  { capability_id: string }
export interface ActivityRef    { activity_id: string }
export interface ProductRef     { product_id: string }
export interface ProcessRef     { process_id: string }
export interface ApplicationRef { app_id: string }

export interface ScenarioHeader {
  id: string;
  name: string;
  description?: string;
  status: ScenarioStatus;
  created_at?: string;
  vision?: string;
  factors_view?: FactorView[];
  goals?: GoalRef[];
  capabilities?: CapabilityRef[];
  activities?: ActivityRef[];
  products?: ProductRef[];
  processes?: ProcessRef[];
  applications?: ApplicationRef[];
}

export interface ScenarioFile {
  notation: string;
  spec_version?: string;
  scenario: ScenarioHeader;
}
