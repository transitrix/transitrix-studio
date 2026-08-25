// Requirement -> verification matrix builder.

import type { ComplianceIndex } from '../compliance/types.js';
import { buildGapReport } from '../compliance/gap-report.js';
import type {
  RequirementVerificationMatrix,
  RequirementVerificationMatrixOptions,
  RequirementVerificationRow,
} from './types.js';

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Builds the repository-wide requirement -> verification matrix.
 *
 * Pure projection over an already-built `ComplianceIndex`
 * (`compliance/reverse-index.ts`) — no I/O, no revalidation. Reuses
 * `buildGapReport`'s `REQ-VERIF-COVERAGE-001`/`-002` verdicts verbatim rather
 * than recomputing a competing coverage status.
 *
 * Ordering: requirements sorted by id; within a requirement, its verification
 * rows sorted by verification id. Both are explicit sorts over the index's
 * values, so the result is independent of the Map's insertion order (which —
 * for a caller that built the index from a filesystem walk — would otherwise
 * track directory enumeration order).
 */
export function buildRequirementVerificationMatrix(
  index: ComplianceIndex,
  options: RequirementVerificationMatrixOptions = {},
): RequirementVerificationMatrix {
  const gapReport = buildGapReport(index, options);
  const noVerification = new Set(gapReport.requirementsWithoutVerification.map(r => r.id));
  const unresolvedVerification = new Set(gapReport.requirementsWithUnresolvedVerification.map(r => r.id));

  const requirements = [...index.requirementById.values()].sort(byId);

  const rows: RequirementVerificationRow[] = [];
  let verificationRowCount = 0;
  let gapRequirementCount = 0;

  for (const requirement of requirements) {
    const parentId = requirement.parent;
    const parentLabel = parentId ? index.requirementById.get(parentId)?.name : undefined;

    const base: Pick<RequirementVerificationRow, 'requirementId' | 'requirementLabel' | 'parentId' | 'parentLabel'> = {
      requirementId: requirement.id,
      requirementLabel: requirement.name,
      ...(parentId !== undefined ? { parentId } : {}),
      ...(parentLabel !== undefined ? { parentLabel } : {}),
    };

    if (noVerification.has(requirement.id)) {
      gapRequirementCount++;
      rows.push({ ...base, coverageGap: 'REQ-VERIF-COVERAGE-001' });
      continue;
    }

    const gap = unresolvedVerification.has(requirement.id) ? ('REQ-VERIF-COVERAGE-002' as const) : undefined;
    if (gap) gapRequirementCount++;

    const verifications = [...(index.verificationsByRequirement.get(requirement.id) ?? [])].sort(byId);
    for (const verification of verifications) {
      verificationRowCount++;
      rows.push({
        ...base,
        verificationId: verification.id,
        verificationLabel: verification.protocol ?? verification.id,
        verificationOutcome: verification.outcome,
        ...(gap ? { coverageGap: gap } : {}),
      });
    }
  }

  return {
    rows,
    summary: {
      requirements: requirements.length,
      verifications: verificationRowCount,
      gaps: gapRequirementCount,
    },
  };
}
