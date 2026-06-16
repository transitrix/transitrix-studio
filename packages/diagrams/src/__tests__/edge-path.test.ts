import { describe, it, expect } from 'vitest';
import { horizontalCubicEdgePath, EDGE_MIN_HANDLE } from '../edge-path.js';

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
});
