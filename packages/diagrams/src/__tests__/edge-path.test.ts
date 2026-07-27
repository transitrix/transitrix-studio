import { describe, it, expect } from 'vitest';
import { horizontalCubicEdgePath, bowedCubicEdgePath, EDGE_MIN_HANDLE } from '../edge-path.js';

/** Point at parameter `t` on cubic `P0 C P1 P2 P3` (`d` in `M.. C..`/coords form). */
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

describe('horizontalCubicEdgePath', () => {
  // A short horizontal edge: |dx|=40 < EDGE_MIN_HANDLE*2, |dy|=0, so the
  // base handle is the floor (64).
  const sx = 0, sy = 0, tx = 40, ty = 0;

  it('curvature 1 uses the floor handle (historical appearance)', () => {
    const d = horizontalCubicEdgePath(sx, sy, tx, ty, 1);
    // handle = max(64, 20, 0) = 64
    expect(d).toBe(`M0,0 C${EDGE_MIN_HANDLE},0 ${40 - EDGE_MIN_HANDLE},0 40,0`);
  });

  it('default curvature equals explicit curvature 1', () => {
    expect(horizontalCubicEdgePath(sx, sy, tx, ty)).toBe(horizontalCubicEdgePath(sx, sy, tx, ty, 1));
  });

  it('curvature 0 collapses control points onto the endpoints (straight line)', () => {
    const d = horizontalCubicEdgePath(sx, sy, tx, ty, 0);
    expect(d).toBe('M0,0 C0,0 40,0 40,0');
  });

  it('changing curvature changes the path output (AC#6)', () => {
    const a = horizontalCubicEdgePath(sx, sy, tx, ty, 1);
    const b = horizontalCubicEdgePath(sx, sy, tx, ty, 2);
    expect(b).not.toBe(a);
  });

  it('larger curvature pushes the control handles further out', () => {
    const handleOf = (curv: number) => {
      // First control point x is `sx + handle`; parse it back out.
      const m = horizontalCubicEdgePath(0, 0, 40, 0, curv).match(/^M0,0 C(-?\d+(?:\.\d+)?),0/);
      return Number(m![1]);
    };
    expect(handleOf(2)).toBeGreaterThan(handleOf(1));
    expect(handleOf(0.5)).toBeLessThan(handleOf(1));
    expect(handleOf(2)).toBe(2 * EDGE_MIN_HANDLE);
  });

  it('handle scales with the vertical span for stacked nodes', () => {
    // |dy|=200 ⇒ base handle = max(64, 0, 160) = 160; ×1 = 160.
    const d = horizontalCubicEdgePath(0, 0, 0, 200, 1);
    expect(d).toBe('M0,0 C160,0 -160,200 0,200');
  });

  it('entryCurvature independently scales the arrival handle', () => {
    // exit handle = max(64,20,0)*1 = 64; entry handle = max(64,20,0)*2 = 128.
    const d = horizontalCubicEdgePath(0, 0, 40, 0, 1, 2);
    expect(d).toBe(`M0,0 C${EDGE_MIN_HANDLE},0 ${40 - EDGE_MIN_HANDLE * 2},0 40,0`);
  });

  it('omitting entryCurvature gives symmetric handles (historical behaviour)', () => {
    expect(horizontalCubicEdgePath(0, 0, 40, 0, 0.5)).toBe(
      horizontalCubicEdgePath(0, 0, 40, 0, 0.5, 0.5),
    );
  });

  it('caps the handle for a tall edge with a narrow column gap, instead of overshooting the target', () => {
    // A network-view edge spanning several rows (|dy|=500) with a typical
    // adjacent-column gap (dx=80): uncapped, |dy|*0.8=400 would push the exit
    // control point 320px past the target's x, producing an exaggerated
    // S-bow. Capped at 160, the control points stay close to the endpoints.
    const d = horizontalCubicEdgePath(0, 0, 80, 500, 1);
    expect(d).toBe('M0,0 C160,0 -80,500 80,500');
  });
});

describe('bowedCubicEdgePath', () => {
  it('both control points target bowY, not the endpoints\' own Y', () => {
    const d = bowedCubicEdgePath(0, 100, 400, 100, 20, 1);
    const m = d.match(/^M0,100 C(-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+) 400,100$/);
    expect(m).not.toBeNull();
    expect(Number(m![2])).toBe(20);
    expect(Number(m![4])).toBe(20);
  });

  it('clears a same-row obstacle sitting on the direct sy=ty line (arrow drawn through the node)', () => {
    // Reproduces the SDS-workflow scenario: A-001 (col 0) -> A-003 (col 2),
    // with A-002 (col 1) occupying the same row in between.
    const sx = 274, sy = 138, tx = 752, ty = 138; // A-001 right edge -> A-003 left edge
    const obstacle = { x: 388, y: 98, width: 250, height: 80 }; // A-002's box
    const clearance = obstacle.height; // matches render-activities.ts's bowY()
    const bowYAt = obstacle.y - clearance;
    const d = bowedCubicEdgePath(sx, sy, tx, ty, bowYAt, 1);
    const m = d.match(/^M([\d.]+),([\d.]+) C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.]+),([\d.]+)$/);
    expect(m).not.toBeNull();
    const [, x0, y0, x1, y1, x2, y2, x3, y3] = m!.map(Number);
    // Sample densely; wherever the curve's x falls inside the obstacle's
    // horizontal span, its y must be above (numerically less than) the box's
    // top edge — i.e. the arc clears over the node instead of crossing it.
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const [x, y] = cubicPointAt([x0, y0], [x1, y1], [x2, y2], [x3, y3], t);
      if (x >= obstacle.x && x <= obstacle.x + obstacle.width) {
        expect(y).toBeLessThan(obstacle.y);
      }
    }
  });
});
