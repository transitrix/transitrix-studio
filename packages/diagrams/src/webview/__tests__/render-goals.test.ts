/**
 * Unit tests for the host-neutral goals SVG renderer used by the IntelliJ
 * JCEF preview bundle. The IntelliJ build can't run inside Vitest, so these
 * tests are the only place the goals rendering path is exercised on the
 * webview-bundle side of the codebase.
 */
import { describe, expect, it } from 'vitest';

import type { GoalTree } from '../../goals/types.js';
import { renderGoalsSvg } from '../render-goals.js';

const SIMPLE_TREE: GoalTree = {
  goal_types: [
    { name: 'Strategy', level: 0 },
    { name: 'Tactic', level: 1 },
  ],
  goals: [
    { id: 1, name: 'Reach the moon', type: 'Strategy', level: 0, parent_id: 0 },
    { id: 2, name: 'Build a rocket', type: 'Tactic', level: 1, parent_id: 1 },
  ],
};

describe('renderGoalsSvg', () => {
  it('produces a self-contained <svg> with embedded theme CSS', () => {
    const svg = renderGoalsSvg(SIMPLE_TREE, { treeName: 'Apollo' });
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<style>');
    // The shared theme CSS contract: diagram classes are defined inline.
    expect(svg).toContain('.diagram-node');
    expect(svg).toContain('.diagram-edge');
    // Both goal names made it into the output.
    expect(svg).toContain('Reach the moon');
    expect(svg).toContain('Build a rocket');
    // The strategy → tactic parent link rendered as an edge with the arrow marker.
    expect(svg).toContain('marker-end="url(#arrow)"');
    // Title block is present when treeName is supplied.
    expect(svg).toContain('Goal tree — Apollo');
  });

  it('escapes user-controlled strings (XML safety)', () => {
    const tree: GoalTree = {
      goal_types: [{ name: 'Strategy', level: 0 }],
      goals: [
        {
          id: 1,
          name: 'Drop <script>alert(1)</script> & friends',
          type: 'Strategy',
          level: 0,
          parent_id: 0,
        },
      ],
    };
    const svg = renderGoalsSvg(tree);
    expect(svg).not.toContain('<script>alert(1)</script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&amp;');
  });

  it('returns an empty SVG when the tree has no goals', () => {
    const empty: GoalTree = { goal_types: [{ name: 'Strategy', level: 0 }], goals: [] };
    const svg = renderGoalsSvg(empty);
    expect(svg).toContain('<svg ');
    expect(svg).toContain('width="0"');
    expect(svg).toContain('height="0"');
  });

  it('renders name, type, and id on separate lines without overlap', () => {
    const tree: GoalTree = {
      goal_types: [
        { name: 'Strategic', level: 0 },
        { name: 'Objective', level: 1 },
      ],
      goals: [
        {
          id: 1,
          canonical_id: 'GOAL-VALUE-1',
          name: 'Grow enterprise value',
          type: 'Strategic',
          level: 0,
          parent_id: 0,
        },
        {
          id: 2,
          canonical_id: 'GOAL-COST-1',
          name: 'Reduce run cost 20%',
          type: 'Objective',
          level: 1,
          parent_id: 1,
        },
      ],
    };
    const svg = renderGoalsSvg(tree);
    expect(svg).toContain('Grow enterprise value');
    expect(svg).toContain('Strategic');
    expect(svg).toContain('GOAL-VALUE-1');
    const typeMatches = [...svg.matchAll(/class="text-secondary"[^>]*y="(\d+)"/g)];
    const nameMatches = [...svg.matchAll(/class="text-primary"[^>]*y="(\d+)"/g)];
    expect(typeMatches.length).toBeGreaterThan(0);
    for (const type of typeMatches) {
      const typeY = Number(type[1]);
      const nearestName = nameMatches
        .map((m) => Number(m[1]))
        .filter((y) => y < typeY)
        .sort((a, b) => b - a)[0];
      expect(typeY - nearestName).toBeGreaterThanOrEqual(18);
    }
  });

  it('shows canonical goal ids in node labels when present', () => {
    const tree: GoalTree = {
      goal_types: [{ name: 'Strategy', level: 0 }],
      goals: [
        {
          id: 1,
          canonical_id: 'GOAL-REVENUE-1',
          name: 'Triple revenue',
          type: 'Strategy',
          level: 0,
          parent_id: 0,
        },
      ],
    };
    const svg = renderGoalsSvg(tree);
    expect(svg).toContain('GOAL-REVENUE-1');
    expect(svg).not.toMatch(/>\s*1\s*</);
  });
});
