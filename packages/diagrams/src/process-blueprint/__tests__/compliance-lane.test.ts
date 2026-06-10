import { describe, it, expect } from 'vitest';
import { layoutProcessBlueprint } from '../layout.js';
import type {
  ComplianceLaneAssertion,
  ComplianceLaneInput,
  ComplianceLaneRequirement,
  ProcessBlueprintFile,
} from '../types.js';

// ── fixtures ────────────────────────────────────────────────────────────────

const STAGES: ProcessBlueprintFile['process_blueprint']['stages'] = [
  { id: 'STAGE-1', name: 'Receive', goal: 'g1', result: 'r1' },
  { id: 'STAGE-2', name: 'Process', goal: 'g2', result: 'r2' },
  { id: 'STAGE-3', name: 'Ship', goal: 'g3', result: 'r3' },
];

function buildFile(overrides: Partial<ProcessBlueprintFile['process_blueprint']> = {}): ProcessBlueprintFile {
  return {
    notation: 'process-blueprint',
    process_blueprint: { id: 'PROCESS_BLUEPRINT-T-1', name: 'Test', stages: STAGES, ...overrides },
  };
}

const REQ_A: ComplianceLaneRequirement = { id: 'REQ-1', derived_from: ['LAW-GDPR-1'] };
const REQ_B: ComplianceLaneRequirement = { id: 'REQ-2', derived_from: ['LAW-GDPR-1', 'LAW-SOX-2'] };
const REQ_DEADLINE: ComplianceLaneRequirement = {
  id: 'REQ-3',
  derived_from: ['LAW-PCI-3'],
  deadline: '2020-01-01', // past_due
};

// ── helpers ─────────────────────────────────────────────────────────────────

function makeAssertion(
  about: string,
  status: ComplianceLaneAssertion['status'],
  realisedVia: string[],
): ComplianceLaneAssertion {
  return { about, status, realised_via: realisedVia };
}

function layout(
  file: ProcessBlueprintFile,
  input: ComplianceLaneInput,
  overrides: { jurisdictions?: string[]; previousSnapshot?: Record<string, string[]> } = {},
) {
  return layoutProcessBlueprint(file, {
    complianceLane: { enabled: true, ...overrides },
    complianceInput: input,
  });
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('compliance lane derivation', () => {
  it('returns no complianceRow when lane is disabled (default)', () => {
    const l = layoutProcessBlueprint(buildFile(), {});
    expect(l.complianceRow).toBeUndefined();
  });

  it('returns no complianceRow when enabled but no input provided', () => {
    const l = layoutProcessBlueprint(buildFile(), { complianceLane: { enabled: true } });
    expect(l.complianceRow).toBeUndefined();
  });

  it('returns no complianceRow when assertions have no realised_via matching stage IDs', () => {
    const input: ComplianceLaneInput = {
      assertions: [makeAssertion('REQ-1', 'compliant', ['STEP-99'])],
      requirements: [REQ_A],
    };
    const l = layout(buildFile(), input);
    expect(l.complianceRow).toBeUndefined();
  });

  it('derives a chip for each law-stage pair', () => {
    const input: ComplianceLaneInput = {
      assertions: [makeAssertion('REQ-1', 'compliant', ['STAGE-1'])],
      requirements: [REQ_A],
    };
    const l = layout(buildFile(), input);
    expect(l.complianceRow).toBeDefined();
    const chips = l.complianceRow!.chips;
    expect(chips).toHaveLength(1);
    expect(chips[0].lawId).toBe('LAW-GDPR-1');
    expect(chips[0].stageIndex).toBe(0);
  });

  it('produces one chip per law per stage (same law, two stages → two chips)', () => {
    const input: ComplianceLaneInput = {
      assertions: [makeAssertion('REQ-1', 'compliant', ['STAGE-1', 'STAGE-2'])],
      requirements: [REQ_A],
    };
    const l = layout(buildFile(), input);
    const chips = l.complianceRow!.chips;
    expect(chips).toHaveLength(2);
    expect(chips.map(c => c.stageIndex).sort()).toEqual([0, 1]);
    expect(chips.every(c => c.lawId === 'LAW-GDPR-1')).toBe(true);
  });

  it('merges multiple assertions for the same law-stage into one chip', () => {
    const input: ComplianceLaneInput = {
      assertions: [
        makeAssertion('REQ-1', 'compliant', ['STAGE-1']),
        makeAssertion('REQ-1', 'partial', ['STAGE-1']),
      ],
      requirements: [REQ_A],
    };
    const l = layout(buildFile(), input);
    expect(l.complianceRow!.chips).toHaveLength(1);
  });

  describe('decoration: new', () => {
    it('marks chip as new when law is not in previous snapshot', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-1', 'compliant', ['STAGE-1'])],
        requirements: [REQ_A],
      };
      const l = layout(buildFile(), input, { previousSnapshot: { 'STAGE-1': [] } });
      expect(l.complianceRow!.chips[0].decorations).toContain('new');
    });

    it('does not mark chip as new when law is in previous snapshot', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-1', 'compliant', ['STAGE-1'])],
        requirements: [REQ_A],
      };
      const l = layout(buildFile(), input, { previousSnapshot: { 'STAGE-1': ['LAW-GDPR-1'] } });
      expect(l.complianceRow!.chips[0].decorations).not.toContain('new');
    });
  });

  describe('decoration: gap', () => {
    it('marks chip as gap when assertion status is non_compliant', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-1', 'non_compliant', ['STAGE-1'])],
        requirements: [REQ_A],
      };
      const l = layout(buildFile(), input);
      expect(l.complianceRow!.chips[0].decorations).toContain('gap');
    });

    it('marks chip as gap when assertion status is partial', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-1', 'partial', ['STAGE-2'])],
        requirements: [REQ_A],
      };
      const l = layout(buildFile(), input);
      expect(l.complianceRow!.chips[0].decorations).toContain('gap');
    });

    it('does not mark chip as gap for compliant assertion', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-1', 'compliant', ['STAGE-1'])],
        requirements: [REQ_A],
      };
      const l = layout(buildFile(), input);
      expect(l.complianceRow!.chips[0].decorations).not.toContain('gap');
    });

    it('propagates gap if any assertion for the same law-stage is non-compliant', () => {
      const input: ComplianceLaneInput = {
        assertions: [
          makeAssertion('REQ-1', 'compliant', ['STAGE-1']),
          makeAssertion('REQ-1', 'non_compliant', ['STAGE-1']),
        ],
        requirements: [REQ_A],
      };
      const l = layout(buildFile(), input);
      expect(l.complianceRow!.chips[0].decorations).toContain('gap');
    });
  });

  describe('decoration: deadline', () => {
    it('marks chip as deadline when gap exists and requirement deadline is past_due', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-3', 'non_compliant', ['STAGE-1'])],
        requirements: [REQ_DEADLINE],
      };
      const l = layout(buildFile(), input);
      const d = l.complianceRow!.chips[0].decorations;
      expect(d).toContain('gap');
      expect(d).toContain('deadline');
    });

    it('does not mark deadline when gap is absent even if deadline is past_due', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-3', 'compliant', ['STAGE-1'])],
        requirements: [REQ_DEADLINE],
      };
      const l = layout(buildFile(), input);
      expect(l.complianceRow!.chips[0].decorations).not.toContain('deadline');
    });

    it('does not mark deadline when no deadline on requirement', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-1', 'non_compliant', ['STAGE-1'])],
        requirements: [REQ_A],
      };
      const l = layout(buildFile(), input);
      expect(l.complianceRow!.chips[0].decorations).not.toContain('deadline');
    });

    it('all three decorations can stack on the same chip', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-3', 'non_compliant', ['STAGE-1'])],
        requirements: [REQ_DEADLINE],
      };
      const l = layout(buildFile(), input, { previousSnapshot: { 'STAGE-1': [] } });
      const d = l.complianceRow!.chips[0].decorations;
      expect(d).toContain('new');
      expect(d).toContain('gap');
      expect(d).toContain('deadline');
    });
  });

  describe('jurisdiction filter', () => {
    it('passes through all laws when no jurisdictions filter', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-2', 'compliant', ['STAGE-1'])],
        requirements: [REQ_B], // derived_from: [LAW-GDPR-1, LAW-SOX-2]
        codexJurisdictions: { 'LAW-GDPR-1': 'EU', 'LAW-SOX-2': 'US' },
      };
      const l = layout(buildFile(), input, { jurisdictions: [] });
      expect(l.complianceRow!.chips).toHaveLength(2);
    });

    it('filters to only the selected jurisdictions', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-2', 'compliant', ['STAGE-1'])],
        requirements: [REQ_B],
        codexJurisdictions: { 'LAW-GDPR-1': 'EU', 'LAW-SOX-2': 'US' },
      };
      const l = layout(buildFile(), input, { jurisdictions: ['EU'] });
      expect(l.complianceRow!.chips).toHaveLength(1);
      expect(l.complianceRow!.chips[0].lawId).toBe('LAW-GDPR-1');
    });

    it('returns no row when jurisdiction filter excludes all laws', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-2', 'compliant', ['STAGE-1'])],
        requirements: [REQ_B],
        codexJurisdictions: { 'LAW-GDPR-1': 'EU', 'LAW-SOX-2': 'US' },
      };
      const l = layout(buildFile(), input, { jurisdictions: ['AU'] });
      expect(l.complianceRow).toBeUndefined();
    });
  });

  describe('null-guards', () => {
    it('tolerates null assertion entries without throwing', () => {
      const input: ComplianceLaneInput = {
        assertions: [null as unknown as ComplianceLaneAssertion, makeAssertion('REQ-1', 'compliant', ['STAGE-1'])],
        requirements: [REQ_A],
      };
      expect(() => layout(buildFile(), input)).not.toThrow();
    });

    it('skips assertions with no realised_via', () => {
      const input: ComplianceLaneInput = {
        assertions: [{ about: 'REQ-1', status: 'compliant' }],
        requirements: [REQ_A],
      };
      const l = layout(buildFile(), input);
      expect(l.complianceRow).toBeUndefined();
    });

    it('skips assertions whose requirement is not in the input', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-MISSING', 'non_compliant', ['STAGE-1'])],
        requirements: [REQ_A],
      };
      const l = layout(buildFile(), input);
      expect(l.complianceRow).toBeUndefined();
    });
  });

  describe('legend', () => {
    it('adds a compliance legend entry when the row is present', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-1', 'compliant', ['STAGE-1'])],
        requirements: [REQ_A],
      };
      const l = layout(buildFile(), input);
      const complianceLegend = l.legend.find(entry => entry.kind === 'compliance');
      expect(complianceLegend).toBeDefined();
      expect(complianceLegend!.label).toBe('Compliance');
    });

    it('does not add compliance legend when row is absent', () => {
      const l = layoutProcessBlueprint(buildFile(), {});
      expect(l.legend.some(e => e.kind === 'compliance')).toBe(false);
    });
  });

  describe('layout geometry', () => {
    it('total height grows by the compliance row height', () => {
      const withoutLane = layoutProcessBlueprint(buildFile(), {});
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-1', 'compliant', ['STAGE-1'])],
        requirements: [REQ_A],
      };
      const withLane = layout(buildFile(), input);
      expect(withLane.bounds.height).toBeGreaterThan(withoutLane.bounds.height);
      expect(withLane.bounds.height).toBe(withoutLane.bounds.height + withLane.complianceRow!.height);
    });

    it('chip x aligns to the stage column', () => {
      const input: ComplianceLaneInput = {
        assertions: [makeAssertion('REQ-1', 'compliant', ['STAGE-2'])],
        requirements: [REQ_A],
      };
      const l = layout(buildFile(), input);
      const chip = l.complianceRow!.chips[0];
      // Chip x must be at the start of stage-2's column (index 1) + cellPadding.
      const expectedX = l.legendColumnWidth + 1 * l.stageColumnWidth + 8; // default cellPadding = 8
      expect(chip.x).toBe(expectedX);
    });
  });
});
