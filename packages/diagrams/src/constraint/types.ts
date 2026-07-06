export const CONSTRAINT_STATUSES = ['active', 'proposed', 'deprecated', 'retired'] as const;
export type ConstraintStatus = (typeof CONSTRAINT_STATUSES)[number];

export const CONSTRAINT_SEVERITIES = ['mandatory', 'recommended', 'advisory'] as const;
export type ConstraintSeverity = (typeof CONSTRAINT_SEVERITIES)[number];
