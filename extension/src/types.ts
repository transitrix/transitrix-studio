// Extension type definitions

export interface LayoutMetrics {
  crossings: number;
  bends: number;
  edgeLength: number;
  waypointDensity: number;
  spineDeviation: number;
  emptyArea: number;
  portViolations: number;
  portUniqueness: number;
  laneAxisAlignment: number;
  layoutScore: number;
}

export interface ValidationFinding {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  elementId?: string;
  message: string;
  hint?: string;
  docUrl?: string;
}

export interface ValidationReport {
  isValid: boolean;
  findings: ValidationFinding[];
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}
