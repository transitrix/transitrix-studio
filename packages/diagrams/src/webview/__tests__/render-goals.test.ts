/**
 * Unit tests for the host-neutral goals SVG renderer used by the IntelliJ
 * JCEF preview bundle. The IntelliJ build can't run inside Vitest, so these
 * tests are the only place the goals rendering path is exercised on the
 * webview-bundle side of the codebase.
 */
import { readFileSync } from 'node:fs';
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

  it.each([false, true])('reserves title space above every node (branched=%s)', (branched) => {
    const tree: GoalTree = {
      ...SIMPLE_TREE,
      goals: branched
        ? [...SIMPLE_TREE.goals, { id: 3, name: 'Train the crew', type: 'Tactic', level: 1, parent_id: 1 }]
        : SIMPLE_TREE.goals,
    };
    const titled = renderGoalsSvg(tree, { treeName: 'Apollo' });
    const plain = renderGoalsSvg(tree);
    const titleY = Number(titled.match(/<text class="text-header"[^>]* y="([\d.]+)"/)![1]);
    const nodeTops = (svg: string) => [...svg.matchAll(/<rect class="diagram-node[^>]* y="([\d.]+)"/g)].map(m => Number(m[1]));
    expect(Math.min(...nodeTops(titled)) - titleY).toBeGreaterThanOrEqual(24);
    expect(Math.min(...nodeTops(plain))).toBe(24);
    expect(titled.match(/class="diagram-edge"/g)?.length).toBe(tree.goals.length - 1);
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

// Use the actual emitted title color and shipped host surface, not a mock theme.
it('keeps the default SVG title readable on the JCEF canvas', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const svg = renderGoalsSvg(SIMPLE_TREE, { treeName: 'Contrast check' });
  const foreground = svg.match(/--ts-header-text:(#[0-9a-f]{6})/i)![1];
  const background = css.match(/\.tx-svg-host\s*\{[^}]*background:\s*(#[0-9a-f]{6})/i)![1];
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const contrast = (a: string, b: string) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(foreground, '#1e1f22')).toBeLessThan(4.5);
});
