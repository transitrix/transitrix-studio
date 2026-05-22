import { describe, it, expect } from 'vitest';
import { computeCpm } from '../cpm.js';
import type { Activity } from '../types.js';

// PMBoK textbook example (5-activity network):
//   A(5) → B(8) → D(7)
//   A(5) → C(3) → D(7)
//   D(7) → E(4)
// Critical path: A→B→D→E = 5+8+7+4 = 24
// A: ES=0, EF=5, LS=0, LF=5, slack=0 (critical)
// B: ES=5, EF=13, LS=5, LF=13, slack=0 (critical)
// C: ES=5, EF=8, LS=10, LF=13, slack=5
// D: ES=13, EF=20, LS=13, LF=20, slack=0 (critical)
// E: ES=20, EF=24, LS=20, LF=24, slack=0 (critical)

const pmBokActivities: Activity[] = [
  { id: 'A', name: 'A', duration: 5 },
  { id: 'B', name: 'B', duration: 8, predecessors: ['A'] },
  { id: 'C', name: 'C', duration: 3, predecessors: ['A'] },
  { id: 'D', name: 'D', duration: 7, predecessors: ['B', 'C'] },
  { id: 'E', name: 'E', duration: 4, predecessors: ['D'] },
];

describe('computeCpm — PMBoK textbook example', () => {
  const result = computeCpm(pmBokActivities);

  it('computes ES for each activity', () => {
    expect(result.get('A')!.es).toBe(0);
    expect(result.get('B')!.es).toBe(5);
    expect(result.get('C')!.es).toBe(5);
    expect(result.get('D')!.es).toBe(13);
    expect(result.get('E')!.es).toBe(20);
  });

  it('computes EF for each activity', () => {
    expect(result.get('A')!.ef).toBe(5);
    expect(result.get('B')!.ef).toBe(13);
    expect(result.get('C')!.ef).toBe(8);
    expect(result.get('D')!.ef).toBe(20);
    expect(result.get('E')!.ef).toBe(24);
  });

  it('computes LS for each activity', () => {
    expect(result.get('A')!.ls).toBe(0);
    expect(result.get('B')!.ls).toBe(5);
    expect(result.get('C')!.ls).toBe(10);
    expect(result.get('D')!.ls).toBe(13);
    expect(result.get('E')!.ls).toBe(20);
  });

  it('computes LF for each activity', () => {
    expect(result.get('A')!.lf).toBe(5);
    expect(result.get('B')!.lf).toBe(13);
    expect(result.get('C')!.lf).toBe(13);
    expect(result.get('D')!.lf).toBe(20);
    expect(result.get('E')!.lf).toBe(24);
  });

  it('computes slack', () => {
    expect(result.get('A')!.slack).toBe(0);
    expect(result.get('B')!.slack).toBe(0);
    expect(result.get('C')!.slack).toBe(5);
    expect(result.get('D')!.slack).toBe(0);
    expect(result.get('E')!.slack).toBe(0);
  });

  it('marks critical path activities', () => {
    expect(result.get('A')!.isCritical).toBe(true);
    expect(result.get('B')!.isCritical).toBe(true);
    expect(result.get('C')!.isCritical).toBe(false);
    expect(result.get('D')!.isCritical).toBe(true);
    expect(result.get('E')!.isCritical).toBe(true);
  });
});

describe('computeCpm — edge cases', () => {
  it('returns empty map for empty input', () => {
    const result = computeCpm([]);
    expect(result.size).toBe(0);
  });

  it('single node with no predecessors: ES=0, EF=duration, slack=0', () => {
    const result = computeCpm([{ id: 'A', name: 'A', duration: 5 }]);
    expect(result.get('A')!.es).toBe(0);
    expect(result.get('A')!.ef).toBe(5);
    expect(result.get('A')!.slack).toBe(0);
    expect(result.get('A')!.isCritical).toBe(true);
  });

  it('activity with no duration treated as zero-duration', () => {
    const result = computeCpm([{ id: 'A', name: 'Milestone' }]);
    expect(result.get('A')!.ef).toBe(0);
  });

  it('linear chain A(3)→B(5)→C(2): total=10, all critical', () => {
    const activities: Activity[] = [
      { id: 'A', name: 'A', duration: 3 },
      { id: 'B', name: 'B', duration: 5, predecessors: ['A'] },
      { id: 'C', name: 'C', duration: 2, predecessors: ['B'] },
    ];
    const result = computeCpm(activities);
    expect(result.get('A')!.ef).toBe(3);
    expect(result.get('B')!.ef).toBe(8);
    expect(result.get('C')!.ef).toBe(10);
    expect(result.get('A')!.isCritical).toBe(true);
    expect(result.get('B')!.isCritical).toBe(true);
    expect(result.get('C')!.isCritical).toBe(true);
  });

  it('parallel paths: longer path is critical, shorter has positive slack', () => {
    // A(1) → C(10)
    // B(5) → C(10)
    // merge at D(2): predecessors [C]
    // path via A: 1+10+2=13; path via B: 5+10+2=17 → critical
    const activities: Activity[] = [
      { id: 'A', name: 'A', duration: 1 },
      { id: 'B', name: 'B', duration: 5 },
      { id: 'C', name: 'C', duration: 10, predecessors: ['A', 'B'] },
      { id: 'D', name: 'D', duration: 2, predecessors: ['C'] },
    ];
    const result = computeCpm(activities);
    // C.es = max(EF[A], EF[B]) = max(1,5) = 5
    expect(result.get('C')!.es).toBe(5);
    expect(result.get('A')!.isCritical).toBe(false);
    expect(result.get('B')!.isCritical).toBe(true);
    expect(result.get('C')!.isCritical).toBe(true);
    expect(result.get('D')!.isCritical).toBe(true);
    expect(result.get('A')!.slack).toBe(4);
    expect(result.get('B')!.slack).toBe(0);
  });
});

describe('computeCpm — cycle defence', () => {
  // Pre-release should-fix: Kahn's topo-order silently omits cyclic nodes.
  // The validator's ACT-006 is the authoritative cycle error, but
  // layoutActivities is reachable without validation, so computeCpm must
  // still produce an entry for every activity (filled with neutral values
  // for omitted cyclic ones) — otherwise consumers see `undefined` and
  // bars render without CPM data.

  it('emits entries for every activity on a 2-node mutual cycle', () => {
    const result = computeCpm([
      { id: 'A', name: 'A', duration: 3, predecessors: ['B'] },
      { id: 'B', name: 'B', duration: 2, predecessors: ['A'] },
    ]);
    expect(result.size).toBe(2);
    expect(result.get('A')).toMatchObject({ es: 0, ef: 0, slack: 0, isCritical: false });
    expect(result.get('B')).toMatchObject({ es: 0, ef: 0, slack: 0, isCritical: false });
  });

  it('keeps real CPM data for the acyclic prefix when a cycle exists downstream', () => {
    // A → B is acyclic; C ↔ D is a mutual cycle disconnected from A/B.
    const result = computeCpm([
      { id: 'A', name: 'A', duration: 5 },
      { id: 'B', name: 'B', duration: 3, predecessors: ['A'] },
      { id: 'C', name: 'C', duration: 2, predecessors: ['D'] },
      { id: 'D', name: 'D', duration: 2, predecessors: ['C'] },
    ]);
    expect(result.get('A')?.ef).toBe(5);
    expect(result.get('B')?.ef).toBe(8);
    expect(result.get('C')).toMatchObject({ es: 0, ef: 0, isCritical: false });
    expect(result.get('D')).toMatchObject({ es: 0, ef: 0, isCritical: false });
  });
});
