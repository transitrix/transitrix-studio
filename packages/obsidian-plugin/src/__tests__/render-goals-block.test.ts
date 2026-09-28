import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GOALS_DISPLAY_SETTINGS,
  normalizeGoalsDisplaySettings,
  resolveEmbedTheme,
} from '../goals-display-settings.js';
import { MAX_GOALS_BLOCK_BYTES, renderSelfContainedGoalsBlock } from '../render-goals-block.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SERVICE_FIXTURE = readFileSync(
  path.join(repoRoot, 'packages/viewer/examples/service.goals.transitrix.yaml'),
  'utf8',
);

const MINIMAL = `notation: goals
spec_version: "0.1"
id: GOALS-SERVICE-1
name: Reliable service
goal_types:
  - { name: Strategy, level: 0 }
goals:
  - { id: GOAL-SERVICE-1, name: Deliver reliable service, type: Strategy, level: 0 }
`;

function svgWidth(svg: string): number {
  const match = /width="(\d+(?:\.\d+)?)"/.exec(svg);
  return match ? Number(match[1]) : NaN;
}

describe('normalizeGoalsDisplaySettings', () => {
  it('fills defaults for empty input', () => {
    expect(normalizeGoalsDisplaySettings(undefined)).toEqual(DEFAULT_GOALS_DISPLAY_SETTINGS);
  });

  it('clamps curvature and rejects unknown enums', () => {
    expect(normalizeGoalsDisplaySettings({
      nodeSize: 'huge',
      edgeStyle: 'diagonal',
      curvature: 99,
      theme: 'neon',
    })).toEqual({
      nodeSize: 'normal',
      edgeStyle: 'bezier',
      curvature: 3,
      theme: 'transitrix',
    });
  });
});

describe('resolveEmbedTheme', () => {
  it('maps fixed themes and follows Obsidian host', () => {
    expect(resolveEmbedTheme('transitrix', true)).toBe('transitrix');
    expect(resolveEmbedTheme('transitrix-dark', false)).toBe('transitrix-dark');
    expect(resolveEmbedTheme('obsidian', true)).toBe('transitrix-dark');
    expect(resolveEmbedTheme('obsidian', false)).toBe('transitrix');
  });
});

describe('renderSelfContainedGoalsBlock display options', () => {
  it('renders the shared Goals fixture through parse, validate and SVG', () => {
    const result = renderSelfContainedGoalsBlock(SERVICE_FIXTURE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg.startsWith('<svg ')).toBe(true);
    expect(result.svg).toContain('Deliver reliable service');
    expect(result.svg).toContain('Reduce response time');
  });

  it('widens the canvas for the wide node-size preset', () => {
    const compact = renderSelfContainedGoalsBlock(MINIMAL, {
      ...DEFAULT_GOALS_DISPLAY_SETTINGS,
      nodeSize: 'compact',
    });
    const wide = renderSelfContainedGoalsBlock(MINIMAL, {
      ...DEFAULT_GOALS_DISPLAY_SETTINGS,
      nodeSize: 'wide',
    });
    expect(compact.ok && wide.ok).toBe(true);
    if (!compact.ok || !wide.ok) return;
    expect(svgWidth(wide.svg)).toBeGreaterThan(svgWidth(compact.svg));
  });

  it('changes edge geometry when edgeStyle is straight', () => {
    const bezier = renderSelfContainedGoalsBlock(SERVICE_FIXTURE, {
      ...DEFAULT_GOALS_DISPLAY_SETTINGS,
      edgeStyle: 'bezier',
    });
    const straight = renderSelfContainedGoalsBlock(SERVICE_FIXTURE, {
      ...DEFAULT_GOALS_DISPLAY_SETTINGS,
      edgeStyle: 'straight',
    });
    expect(bezier.ok && straight.ok).toBe(true);
    if (!bezier.ok || !straight.ok) return;
    const bezierPath = /<path d="([^"]+)" class="diagram-edge"/.exec(bezier.svg)?.[1] ?? '';
    const straightPath = /<path d="([^"]+)" class="diagram-edge"/.exec(straight.svg)?.[1] ?? '';
    expect(bezierPath).not.toBe('');
    expect(straightPath).not.toBe('');
    expect(straightPath).not.toBe(bezierPath);
    expect(straightPath.startsWith('M')).toBe(true);
    expect(straightPath.includes('C')).toBe(false);
  });

  it('embeds dark theme tokens when theme is transitrix-dark', () => {
    const light = renderSelfContainedGoalsBlock(MINIMAL, {
      ...DEFAULT_GOALS_DISPLAY_SETTINGS,
      theme: 'transitrix',
    }, false);
    const dark = renderSelfContainedGoalsBlock(MINIMAL, {
      ...DEFAULT_GOALS_DISPLAY_SETTINGS,
      theme: 'transitrix-dark',
    }, false);
    expect(light.ok && dark.ok).toBe(true);
    if (!light.ok || !dark.ok) return;
    expect(dark.svg).toContain('#0a1628');
    expect(light.svg).not.toContain('#0a1628');
    expect(light.svg).toContain('#ffffff');
  });

  it('follows Obsidian dark host when theme is obsidian', () => {
    const darkHost = renderSelfContainedGoalsBlock(MINIMAL, {
      ...DEFAULT_GOALS_DISPLAY_SETTINGS,
      theme: 'obsidian',
    }, true);
    expect(darkHost.ok).toBe(true);
    if (!darkHost.ok) return;
    expect(darkHost.svg).toContain('#0a1628');
  });

  it('reports YAML syntax errors without throwing', () => {
    const result = renderSelfContainedGoalsBlock('notation: [unterminated');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('YAML_PARSE');
  });

  it('rejects canonical validation failures', () => {
    const result = renderSelfContainedGoalsBlock('notation: goals\nid: not-valid\nname: X\ngoal_types: []\ngoals: []\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === 'GOALS-002' || e.code === 'GOALS-004')).toBe(true);
  });

  it('rejects repository projection documents', () => {
    const result = renderSelfContainedGoalsBlock(`notation: goals
id: GOALS-1
name: Projected
view_config:
  scope:
    root_goal: GOAL-1
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('GOALS-BLOCK-002');
  });

  it('does not copy raw markup from a hostile goal name into the SVG', () => {
    const result = renderSelfContainedGoalsBlock(`notation: goals
spec_version: "0.1"
id: GOALS-XSS-1
name: "<img src=x onerror=alert(1)>"
goal_types:
  - { name: Strategy, level: 0 }
goals:
  - id: GOAL-XSS-1
    name: 'Drop <script>alert(1)</script> & friends'
    type: Strategy
    level: 0
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain('<script>alert(1)</script>');
    expect(result.svg).not.toContain('<img src=x onerror=alert(1)>');
    expect(result.svg).toContain('&lt;script&gt;');
    expect(result.svg).toContain('&amp;');
  });

  it('rejects oversize sources', () => {
    const padding = 'x'.repeat(MAX_GOALS_BLOCK_BYTES);
    const result = renderSelfContainedGoalsBlock(`${padding}\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('GOALS-BLOCK-001');
  });
});
