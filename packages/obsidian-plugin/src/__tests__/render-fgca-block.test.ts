import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { renderSelfContainedFgcaBlock } from '../render-fgca-block.js';
import { DEFAULT_SVG_DISPLAY_SETTINGS } from '../goals-display-settings.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const DGCA_FIXTURE = readFileSync(
  path.join(repoRoot, 'tests/fixtures/notation-corpus/dgca/strategy-2026.dgca.transitrix.yaml'),
  'utf8',
);
const DGA_FIXTURE = readFileSync(
  path.join(repoRoot, 'tests/fixtures/notation-corpus/dga/strategy-2026.dga.transitrix.yaml'),
  'utf8',
);

describe('renderSelfContainedFgcaBlock', () => {
  it('renders the shared DGCA fixture', () => {
    const result = renderSelfContainedFgcaBlock(DGCA_FIXTURE, 'dgca');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg.startsWith('<svg ')).toBe(true);
    expect(result.svg).toContain('Grow revenue by 20%');
    expect(result.svg).toContain('Launch new product line');
    expect(result.svg).toContain('Market research');
  });

  it('renders the shared DGA fixture without a Changes column header', () => {
    const result = renderSelfContainedFgcaBlock(DGA_FIXTURE, 'dga');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('Expand market share');
    expect(result.svg).toContain('Launch in two new regions');
    expect(result.svg).not.toContain('Changes (C)');
  });

  it('reports YAML syntax errors without throwing', () => {
    const result = renderSelfContainedFgcaBlock('notation: [unterminated', 'dgca');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('YAML_PARSE');
  });

  it('rejects view_config-only repository projections', () => {
    const result = renderSelfContainedFgcaBlock(`notation: dgca
id: DGCA-1
name: Projected
view_config:
  goals:
    filter: all
`, 'dgca');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('FGCA-BLOCK-002');
  });

  it('allows inline FGCA that also sets view_config.layers (DGA-in-dgca)', () => {
    const result = renderSelfContainedFgcaBlock(`notation: dgca
spec_version: "0.1"
id: DGCA-LAYER-1
name: Layers off
view_config:
  layers:
    changes: off
factors:
  - { id: DRIVER-1, name: Pressure, type: external }
goals:
  - { id: GOAL-1, name: Grow, factors: [DRIVER-1] }
actions:
  - { id: ACTIVITY-1, name: Ship, goals: [GOAL-1] }
`, 'dgca');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('Grow');
    expect(result.svg).not.toContain('Changes (C)');
  });

  it('does not copy raw markup from a hostile factor name into the SVG', () => {
    const result = renderSelfContainedFgcaBlock(`notation: dgca
spec_version: "0.1"
id: DGCA-XSS-1
name: Safe
factors:
  - id: DRIVER-XSS-1
    name: 'Drop <script>alert(1)</script> & friends'
    type: external
goals:
  - { id: GOAL-1, name: Ok, factors: [DRIVER-XSS-1] }
changes:
  - { id: CHANGE-1, name: Ok, goals: [GOAL-1] }
actions:
  - { id: ACTIVITY-1, name: Ok, changes: [CHANGE-1] }
`, 'dgca');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain('<script>alert(1)</script>');
    expect(result.svg).toContain('&lt;script&gt;');
    expect(result.svg).toContain('&amp;');
  });

  it('widens the canvas for the wide node-size preset', () => {
    const compact = renderSelfContainedFgcaBlock(DGCA_FIXTURE, 'dgca', {
      ...DEFAULT_SVG_DISPLAY_SETTINGS,
      nodeSize: 'compact',
    });
    const wide = renderSelfContainedFgcaBlock(DGCA_FIXTURE, 'dgca', {
      ...DEFAULT_SVG_DISPLAY_SETTINGS,
      nodeSize: 'wide',
    });
    expect(compact.ok && wide.ok).toBe(true);
    if (!compact.ok || !wide.ok) return;
    const compactW = Number(/width="(\d+(?:\.\d+)?)"/.exec(compact.svg)?.[1] ?? NaN);
    const wideW = Number(/width="(\d+(?:\.\d+)?)"/.exec(wide.svg)?.[1] ?? NaN);
    expect(wideW).toBeGreaterThan(compactW);
  });

  it('embeds dark theme tokens when theme is transitrix-dark', () => {
    const light = renderSelfContainedFgcaBlock(DGCA_FIXTURE, 'dgca', {
      ...DEFAULT_SVG_DISPLAY_SETTINGS,
      theme: 'transitrix',
    }, false);
    const dark = renderSelfContainedFgcaBlock(DGCA_FIXTURE, 'dgca', {
      ...DEFAULT_SVG_DISPLAY_SETTINGS,
      theme: 'transitrix-dark',
    }, false);
    expect(light.ok && dark.ok).toBe(true);
    if (!light.ok || !dark.ok) return;
    expect(light.svg).not.toContain('#0a1628');
    expect(dark.svg).toContain('#0a1628');
  });
});
