/**
 * Unit tests for renderActivitiesSvg — project-node suppression (#421).
 *
 * Convention: activities with activity_type === 'project' are omitted from
 * the Network/PSND layout by default (suppressProjectNodes: true). Text/Tree
 * views keep them via the caller; data is never mutated.
 */
import { describe, it, expect } from 'vitest';
import { renderActivitiesSvg } from '../render-activities.js';
import type { ActivityDoc } from '../../activities/types.js';

/** Point at parameter `t` on cubic `P0 C P1 P2 P3`. */
function cubicPointAt(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const u = 1 - t;
  const x = u ** 3 * p0[0] + 3 * u ** 2 * t * p1[0] + 3 * u * t ** 2 * p2[0] + t ** 3 * p3[0];
  const y = u ** 3 * p0[1] + 3 * u ** 2 * t * p1[1] + 3 * u * t ** 2 * p2[1] + t ** 3 * p3[1];
  return [x, y];
}

const BASE_DOC: ActivityDoc = {
  notation: 'action',
  activities: [
    {
      id: 'PROJ-1',
      name: 'Platform Launch',
      activity_type: 'project',
    },
    {
      id: 'TASK-1',
      name: 'Design',
      activity_type: 'task',
      parent: 'PROJ-1',
    },
    {
      id: 'TASK-2',
      name: 'Implement',
      activity_type: 'task',
      parent: 'PROJ-1',
      predecessors: ['TASK-1'],
    },
  ],
};

describe('renderActivitiesSvg — project-node suppression (#421)', () => {
  it('suppresses project-type nodes in the network SVG by default', () => {
    const svg = renderActivitiesSvg(BASE_DOC);
    // TASK-1 and TASK-2 should appear as rendered nodes.
    expect(svg).toContain('TASK-1');
    expect(svg).toContain('TASK-2');
    // The project container should not appear as a rendered node.
    expect(svg).not.toContain('PROJ-1');
  });

  it('suppresses project nodes when suppressProjectNodes is explicitly true', () => {
    const svg = renderActivitiesSvg(BASE_DOC, { suppressProjectNodes: true });
    expect(svg).not.toContain('PROJ-1');
    expect(svg).toContain('TASK-1');
  });

  it('renders project nodes when suppressProjectNodes is false', () => {
    const svg = renderActivitiesSvg(BASE_DOC, { suppressProjectNodes: false });
    expect(svg).toContain('PROJ-1');
    expect(svg).toContain('TASK-1');
    expect(svg).toContain('TASK-2');
  });

  it('does not mutate the original doc', () => {
    const original = BASE_DOC.activities.length;
    renderActivitiesSvg(BASE_DOC);
    expect(BASE_DOC.activities).toHaveLength(original);
  });

  it('suppresses project_type matching case-insensitively', () => {
    const doc: ActivityDoc = {
      notation: 'action',
      activities: [
        { id: 'P1', name: 'Container', activity_type: 'Project' },
        { id: 'T1', name: 'Leaf', activity_type: 'task' },
      ],
    };
    const svg = renderActivitiesSvg(doc);
    expect(svg).not.toContain('P1');
    expect(svg).toContain('T1');
  });

  it('renders a valid SVG when all activities are project-type (graceful degrade)', () => {
    const doc: ActivityDoc = {
      notation: 'action',
      activities: [{ id: 'P1', name: 'Only project', activity_type: 'project' }],
    };
    const svg = renderActivitiesSvg(doc);
    // When all activities are filtered out, the renderer returns an empty SVG.
    expect(svg).toContain('<svg');
  });

  it('renders activities without activity_type unchanged', () => {
    const doc: ActivityDoc = {
      notation: 'action',
      activities: [
        { id: 'A1', name: 'Analysis', duration: 5 },
        { id: 'A2', name: 'Design', duration: 3, predecessors: ['A1'] },
      ],
    };
    const svg = renderActivitiesSvg(doc);
    expect(svg).toContain('A1');
    expect(svg).toContain('A2');
  });
});

describe('renderActivitiesSvg — skip-edge arcs over an intermediate node', () => {
  // Reproduces the reported bug: A-003 depends on both A-001 and A-002, so
  // A-001 lands two columns before A-003 while A-002 (one column ahead of
  // A-001) shares A-003's row — the direct A-001->A-003 edge used to draw a
  // straight line right across A-002's box.
  const doc: ActivityDoc = {
    notation: 'action',
    activities: [
      { id: 'A-001', name: 'Build REQUIREMENT baseline', duration: 3 },
      { id: 'A-002', name: 'Model HAZARD and RISK_CONTROL', duration: 2, predecessors: ['A-001'] },
      { id: 'A-003', name: 'Define VERIFICATION protocols', duration: 3, predecessors: ['A-001', 'A-002'] },
    ],
  };

  it('routes the A-001->A-003 edge above A-002 instead of through it', () => {
    const svg = renderActivitiesSvg(doc);
    // A-002's node rect: parse its x/y/width/height from the emitted SVG.
    const nodeMatch = svg.match(/<rect class="[^"]*" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*\/>\s*<text[^>]*>Model HAZARD/);
    expect(nodeMatch).not.toBeNull();
    const [, nx, ny, nw] = nodeMatch!.map(Number);
    const obstacle = { x: nx, y: ny, width: nw };

    // Every cubic edge path in the SVG; find the one spanning A-001's column
    // to A-003's column (i.e. one whose x-range covers the obstacle's).
    const paths = [...svg.matchAll(/<path d="M([\d.]+),([\d.]+) C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.]+),([\d.]+)"/g)]
      .map((m) => m.slice(1).map(Number) as [number, number, number, number, number, number, number, number]);
    const skipEdge = paths.find(([x0, , , , , , x3]) => x0 < obstacle.x && x3 > obstacle.x + obstacle.width);
    expect(skipEdge).toBeDefined();
    const [x0, y0, x1, y1, x2, y2, x3, y3] = skipEdge!;

    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const [x, y] = cubicPointAt([x0, y0], [x1, y1], [x2, y2], [x3, y3], t);
      if (x >= obstacle.x && x <= obstacle.x + obstacle.width) {
        expect(y).toBeLessThan(obstacle.y);
      }
    }
  });

  it('grows the canvas so the bow never draws above y=0 (would otherwise be clipped)', () => {
    // The blocking node sits in the topmost (and only) row, so a naive bow
    // would need to rise above the SVG's own y=0 — the canvas must grow to
    // absorb that instead of letting the arc get clipped by the viewBox.
    const svg = renderActivitiesSvg(doc);
    const paths = [...svg.matchAll(/<path d="M([\d.]+),([\d.]+) C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.]+),([\d.]+)"/g)]
      .map((m) => m.slice(1).map(Number) as [number, number, number, number, number, number, number, number]);
    for (const [, , , y1, , y2] of paths) {
      expect(y1).toBeGreaterThanOrEqual(0);
      expect(y2).toBeGreaterThanOrEqual(0);
    }
  });

  it('with a title present, never bows into the title\'s reserved zone', () => {
    // Regression: an earlier version of the top-pad calc floored the bow
    // against the canvas's literal y=0 rather than the diagram's own
    // un-padded top, so a bow could rise straight through the title text
    // sitting between y=0 and the diagram area — the "arrow enters the
    // title zone" bug. The title itself never moves (drawn at a fixed N_PAD
    // offset independent of the bow), so the bow must stay at/below the
    // diagram's un-padded top edge, i.e. N_PAD + titleH.
    const N_PAD = 24;
    const titleH = 24;
    const svg = renderActivitiesSvg(doc, { title: 'Network view' });
    const paths = [...svg.matchAll(/<path d="M([\d.]+),([\d.]+) C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.]+),([\d.]+)"/g)]
      .map((m) => m.slice(1).map(Number) as [number, number, number, number, number, number, number, number]);
    for (const [, , , y1, , y2] of paths) {
      expect(y1).toBeGreaterThanOrEqual(N_PAD + titleH);
      expect(y2).toBeGreaterThanOrEqual(N_PAD + titleH);
    }
  });

  it('leaves non-colliding edges as a plain horizontal-tangent curve', () => {
    const svg = renderActivitiesSvg(doc);
    // A-001->A-002 (adjacent columns, nothing in between) keeps the
    // historical flat-tangent shape: both control points share their
    // endpoint's own Y. Locate it as the shortest-span edge.
    const paths = [...svg.matchAll(/<path d="M([\d.]+),([\d.]+) C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.]+),([\d.]+)"/g)]
      .map((mm) => mm.slice(1).map(Number) as [number, number, number, number, number, number, number, number]);
    const adjacentEdge = paths.reduce((shortest, p) => (p[6] - p[0] < shortest[6] - shortest[0] ? p : shortest));
    const [x0, y0, , y1, , y2, , y3] = adjacentEdge;
    expect(y1).toBe(y0);
    expect(y2).toBe(y3);
  });
});
