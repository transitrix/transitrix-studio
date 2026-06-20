// Activity Card — document-local structural validation.
//
// This validator checks only what can be known from the card document ALONE:
// the header, the `activity_card` block shape, the project-reference grammar
// (PC-001's "missing or malformed" half), and each milestone's shape.
//
// The cross-document rules — PC-001 "does not resolve", PC-002
// (activity_type), PC-003 (milestone changes ⊆ project changes), PC-004
// (milestone date within the project lifecycle window) and the LIFECYCLE-*
// checks — require the sibling `*.activities.*` / `*.fgca.*` documents and so
// live in `resolver.ts`. The preview merges both result sets.
//
// Codes:
//   AC-001   document structure (root object, `activity_card` block)
//   AC-002   `activity_card.id` grammar
//   AC-003   milestone structure (missing id / name / date)
//   AC-004   milestone id grammar / duplicate
//   AC-005   milestone date format
//   AC-006   milestone `delivers_changes` shape / grammar
//   HDR-001  missing `notation`           (CONTRACT.md §2)
//   HDR-002  wrong `notation`             (CONTRACT.md §2)
//   PC-001   `project` missing or malformed (the document-local half; the
//            "does not resolve" half is emitted by the resolver)

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';

export type { ValidationError, ValidationWarning, ValidationResult };

const ACTIVITY_CARD_ID_RE = /^ACTIVITY_CARD(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const ACTIVITY_ID_RE = /^ACTIVITY(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const MILESTONE_ID_RE = /^MILESTONE(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const CHANGE_ID_RE = /^CHANGE(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function validateActivityCard(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'AC-001', message: 'document root is not an object' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  // ── Header (CONTRACT.md §2) ────────────────────────────────────────────────
  if (!('notation' in raw)) {
    errors.push({ code: 'HDR-001', message: 'notation field is required' });
  } else if (raw['notation'] !== 'activity-card') {
    errors.push({
      code: 'HDR-002',
      message: `notation must be "activity-card", got "${String(raw['notation'])}"`,
    });
  }

  // ── activity_card block ─────────────────────────────────────────────────────
  const block = raw['activity_card'];
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    errors.push({ code: 'AC-001', message: 'Missing required root key: activity_card (object)' });
    return { valid: false, errors, warnings };
  }
  const card = block as Record<string, unknown>;

  if (!isNonEmptyString(card['id'])) {
    errors.push({ code: 'AC-002', message: 'activity_card.id is required' });
  } else if (!ACTIVITY_CARD_ID_RE.test(card['id'])) {
    errors.push({
      code: 'AC-002',
      message: `activity_card.id "${card['id']}" must match ACTIVITY_CARD-[<middle>-]<INTEGER>`,
    });
  }

  // PC-001 (document-local half): project present + well-formed.
  if (!isNonEmptyString(card['project'])) {
    errors.push({ code: 'PC-001', message: 'activity_card.project is required (an ACTIVITY-… id)' });
  } else if (!ACTIVITY_ID_RE.test(card['project'])) {
    errors.push({
      code: 'PC-001',
      message: `activity_card.project "${card['project']}" is malformed; must match ACTIVITY-[<middle>-]<INTEGER>`,
    });
  }

  if (card['description'] !== undefined && typeof card['description'] !== 'string') {
    errors.push({ code: 'AC-001', message: 'activity_card.description must be a string' });
  }

  if (card['notes'] !== undefined && typeof card['notes'] !== 'string') {
    errors.push({ code: 'AC-001', message: 'activity_card.notes must be a string' });
  }

  // ── milestones[] (optional) ─────────────────────────────────────────────────
  const milestonesRaw = card['milestones'];
  if (milestonesRaw !== undefined) {
    if (!Array.isArray(milestonesRaw)) {
      errors.push({ code: 'AC-003', message: 'activity_card.milestones must be an array', path: 'milestones' });
    } else {
      const seenIds = new Set<string>();
      milestonesRaw.forEach((el, i) => {
        const p = `milestones[${i}]`;
        if (!el || typeof el !== 'object' || Array.isArray(el)) {
          errors.push({ code: 'AC-003', message: `${p} must be an object`, path: p });
          return;
        }
        const m = el as Record<string, unknown>;

        if (!isNonEmptyString(m['id'])) {
          errors.push({ code: 'AC-003', message: `${p}.id is required`, path: p });
        } else {
          const mid = m['id'].trim();
          if (!MILESTONE_ID_RE.test(mid)) {
            errors.push({ code: 'AC-004', message: `${p}.id "${mid}" must match MILESTONE-[<middle>-]<INTEGER>`, path: p });
          }
          if (seenIds.has(mid)) {
            errors.push({ code: 'AC-004', message: `Duplicate milestone id "${mid}"`, path: p });
          } else {
            seenIds.add(mid);
          }
        }

        if (!isNonEmptyString(m['name'])) {
          errors.push({ code: 'AC-003', message: `${p}.name is required`, path: p });
        }

        if (!isNonEmptyString(m['date'])) {
          errors.push({ code: 'AC-003', message: `${p}.date is required`, path: p });
        } else if (!DATE_RE.test(m['date'])) {
          errors.push({
            code: 'AC-005',
            message: `${p}.date "${m['date']}" must be a quoted ISO 8601 date (YYYY-MM-DD)`,
            path: p,
          });
        }

        if (m['description'] !== undefined && typeof m['description'] !== 'string') {
          errors.push({ code: 'AC-003', message: `${p}.description must be a string`, path: p });
        }

        const dc = m['delivers_changes'];
        if (dc !== undefined) {
          if (!Array.isArray(dc)) {
            errors.push({ code: 'AC-006', message: `${p}.delivers_changes must be an array of CHANGE-… ids`, path: p });
          } else {
            dc.forEach((c) => {
              if (typeof c !== 'string' || !CHANGE_ID_RE.test(c)) {
                errors.push({
                  code: 'AC-006',
                  message: `${p}.delivers_changes[] entry "${String(c)}" must match CHANGE-[<middle>-]<INTEGER>`,
                  path: p,
                });
              }
            });
          }
        }
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
