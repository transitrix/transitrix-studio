import type { IssueStatus, ValidationError, ValidationWarning, ValidationResult } from './types.js';

export type { ValidationError, ValidationWarning, ValidationResult };

/**
 * Validates an Issues document against `notations/12-issues.md`.
 *
 * Error codes:
 *  - ISS-000  structural / header problem (not an object, wrong notation,
 *             missing issues_catalogue, missing catalogue fields)
 *  - ISS-001  duplicate issue_id
 *  - ISS-002  status outside the vocabulary
 *  - ISS-003  issue_id or name missing or empty
 *  - ISS-004  parent references a missing issue (warning)
 *  - ISS-005  cycle in the parent chain
 *  - ISS-006  relates_to entry is not an ACTIVITY- / GOAL- id
 */

const STATUS_VALUES: IssueStatus[] = ['open', 'in_progress', 'blocked', 'resolved', 'closed'];
const RELATES_TO_RE = /^(ACTIVITY|GOAL)(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function validateIssues(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'ISS-000', message: 'Input must be an object' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  if ('notation' in raw && raw['notation'] !== 'issues') {
    errors.push({ code: 'ISS-000', message: `notation must be "issues", got "${String(raw['notation'])}"` });
  }

  const catRaw = raw['issues_catalogue'];
  if (!catRaw || typeof catRaw !== 'object') {
    errors.push({ code: 'ISS-000', message: 'Missing required root key: issues_catalogue' });
    return { valid: false, errors, warnings };
  }
  const cat = catRaw as Record<string, unknown>;

  if (!isNonEmptyString(cat['id'])) {
    errors.push({ code: 'ISS-000', message: 'issues_catalogue.id is required', path: 'issues_catalogue.id' });
  }
  if (!isNonEmptyString(cat['name'])) {
    errors.push({ code: 'ISS-000', message: 'issues_catalogue.name is required', path: 'issues_catalogue.name' });
  }
  if (!isNonEmptyString(cat['updated_at'])) {
    errors.push({ code: 'ISS-000', message: 'issues_catalogue.updated_at is required', path: 'issues_catalogue.updated_at' });
  }

  const issuesRaw = cat['issues'];
  if (!Array.isArray(issuesRaw)) {
    errors.push({ code: 'ISS-000', message: 'issues_catalogue.issues must be an array', path: 'issues_catalogue.issues' });
    return { valid: false, errors, warnings };
  }

  const idSet = new Set<string>();

  for (let i = 0; i < issuesRaw.length; i++) {
    const it = issuesRaw[i] as unknown;
    const path = `issues_catalogue.issues[${i}]`;

    if (!it || typeof it !== 'object') {
      errors.push({ code: 'ISS-003', message: `${path} must be an object`, path });
      continue;
    }
    const issue = it as Record<string, unknown>;

    const idOk = isNonEmptyString(issue['issue_id']);
    if (!idOk) {
      errors.push({ code: 'ISS-003', message: `${path}.issue_id is missing or empty`, path });
    }
    if (!isNonEmptyString(issue['name'])) {
      errors.push({ code: 'ISS-003', message: `${path}.name is missing or empty`, path });
    }

    if (idOk) {
      const id = (issue['issue_id'] as string).trim();
      if (idSet.has(id)) {
        errors.push({ code: 'ISS-001', message: `Duplicate issue_id: "${id}"`, path });
      } else {
        idSet.add(id);
      }
    }

    const status = issue['status'];
    if (!STATUS_VALUES.includes(status as IssueStatus)) {
      errors.push({
        code: 'ISS-002',
        message: `${path}.status "${String(status)}" must be one of: ${STATUS_VALUES.join(', ')}`,
        path,
      });
    }

    const relates = issue['relates_to'];
    if (relates !== undefined) {
      if (!Array.isArray(relates)) {
        errors.push({ code: 'ISS-006', message: `${path}.relates_to must be an array`, path });
      } else {
        for (let j = 0; j < relates.length; j++) {
          const ref = relates[j];
          if (typeof ref !== 'string' || !RELATES_TO_RE.test(ref)) {
            errors.push({
              code: 'ISS-006',
              message: `${path}.relates_to[${j}] "${String(ref)}" must be an ACTIVITY- or GOAL- id`,
              path,
            });
          }
        }
      }
    }
  }

  // parent reference + cycle checks — run once all ids are collected.
  const parentOf = new Map<string, string>();
  for (let i = 0; i < issuesRaw.length; i++) {
    const it = issuesRaw[i] as unknown;
    if (!it || typeof it !== 'object') continue;
    const issue = it as Record<string, unknown>;
    const parent = issue['parent'];
    const path = `issues_catalogue.issues[${i}]`;
    if (parent === undefined) continue;
    if (typeof parent !== 'string' || !idSet.has(parent.trim())) {
      warnings.push({
        code: 'ISS-004',
        message: `${path}.parent "${String(parent)}" does not resolve to a known issue — rendered at the root`,
        path,
      });
      continue;
    }
    if (isNonEmptyString(issue['issue_id'])) {
      parentOf.set((issue['issue_id'] as string).trim(), parent.trim());
    }
  }

  let cycleNode: string | undefined;
  for (const start of parentOf.keys()) {
    if (cycleNode) break;
    const seen = new Set<string>();
    let cur: string | undefined = start;
    while (cur !== undefined) {
      if (seen.has(cur)) {
        cycleNode = cur;
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur);
    }
  }
  if (cycleNode) {
    errors.push({ code: 'ISS-005', message: `Cycle detected in the parent chain involving issue "${cycleNode}"` });
  }

  return { valid: errors.length === 0, errors, warnings };
}
