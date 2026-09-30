import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { renderSelfContainedActionBlock } from '../render-action-block.js';
import { renderSelfContainedActionCardBlock } from '../render-action-card-block.js';
import { renderSelfContainedBlocksBlock } from '../render-blocks-block.js';
import { renderSelfContainedProcessBlueprintBlock } from '../render-process-blueprint-block.js';
import { DEFAULT_SVG_DISPLAY_SETTINGS } from '../goals-display-settings.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const corpus = path.join(repoRoot, 'tests/fixtures/notation-corpus');

describe('renderSelfContainedActionBlock', () => {
  it('renders the shared Action fixture', () => {
    const source = readFileSync(path.join(corpus, 'action/discovery-research.action.transitrix.yaml'), 'utf8');
    const result = renderSelfContainedActionBlock(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('<svg ');
    expect(result.svg).toContain('Stakeholder interviews');
  });

  it('rejects view_config-only Action projections', () => {
    const result = renderSelfContainedActionBlock(`notation: action
id: ACTION-VIEW-1
view_config:
  scope:
    root_action: ACTION-1
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('ACTION-BLOCK-002');
  });

  it('escapes hostile activity names in the SVG', () => {
    const result = renderSelfContainedActionBlock(`notation: action
spec_version: "0.1"
title: Safe
actions:
  - id: ACTIVITY-XSS-1
    name: 'Drop <script>alert(1)</script>'
    duration: 1
    sort: 10
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain('<script>alert(1)</script>');
    expect(result.svg).toContain('&lt;script&gt;');
  });

  it('embeds dark theme tokens when theme is transitrix-dark', () => {
    const source = readFileSync(path.join(corpus, 'action/discovery-research.action.transitrix.yaml'), 'utf8');
    const dark = renderSelfContainedActionBlock(source, {
      ...DEFAULT_SVG_DISPLAY_SETTINGS,
      theme: 'transitrix-dark',
    }, false);
    expect(dark.ok).toBe(true);
    if (!dark.ok) return;
    expect(dark.svg).toContain('#0a1628');
  });

  it('suppresses Gantt-only advisories (ACT-009) for the network-only Obsidian path', () => {
    const source = readFileSync(path.join(corpus, 'action/discovery-research.action.transitrix.yaml'), 'utf8');
    const result = renderSelfContainedActionBlock(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.code === 'ACT-009')).toBe(false);
    expect(result.svg).toContain('Stakeholder interviews');
  });
});

describe('renderSelfContainedActionCardBlock', () => {
  it('renders a self-contained card shell with milestones', () => {
    const result = renderSelfContainedActionCardBlock(`notation: action-card
spec_version: "0.1"
action_card:
  id: ACTION_CARD-DEMO-1
  project: ACTION-DEMO-1
  milestones:
    - { id: MILESTONE-DEMO-1, name: Kick-off, date: "2026-06-01" }
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('<svg ');
    expect(result.svg).toContain('Kick-off');
    expect(result.svg).toContain('ACTION-DEMO-1');
  });

  it('rejects documents with sources', () => {
    const result = renderSelfContainedActionCardBlock(`notation: action-card
action_card:
  id: ACTION_CARD-DEMO-1
  project: ACTION-DEMO-1
sources: {}
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('ACTION-CARD-BLOCK-002');
  });

  it('embeds dark theme tokens when theme is transitrix-dark', () => {
    const dark = renderSelfContainedActionCardBlock(`notation: action-card
spec_version: "0.1"
action_card:
  id: ACTION_CARD-DEMO-1
  project: ACTION-DEMO-1
  milestones:
    - { id: MILESTONE-DEMO-1, name: Kick-off, date: "2026-06-01" }
`, {
      ...DEFAULT_SVG_DISPLAY_SETTINGS,
      theme: 'transitrix-dark',
    }, false);
    expect(dark.ok).toBe(true);
    if (!dark.ok) return;
    expect(dark.svg).toContain('#0a1628');
  });
});

describe('renderSelfContainedBlocksBlock', () => {
  it('renders nested blocks from the shared fixture', () => {
    const source = readFileSync(path.join(corpus, 'blocks/architecture.blocks.transitrix.yaml'), 'utf8');
    const result = renderSelfContainedBlocksBlock(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('Application Layer');
    expect(result.svg).toContain('React App');
  });

  it('renders the grid (RACI) form', () => {
    const source = readFileSync(path.join(corpus, 'blocks/raci.blocks.transitrix.yaml'), 'utf8');
    const result = renderSelfContainedBlocksBlock(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('Product Manager');
    expect(result.svg).toContain('Define release scope');
  });

  it('embeds dark theme tokens for nested blocks when theme is transitrix-dark', () => {
    const source = readFileSync(path.join(corpus, 'blocks/architecture.blocks.transitrix.yaml'), 'utf8');
    const dark = renderSelfContainedBlocksBlock(source, {
      ...DEFAULT_SVG_DISPLAY_SETTINGS,
      theme: 'transitrix-dark',
    }, false);
    expect(dark.ok).toBe(true);
    if (!dark.ok) return;
    expect(dark.svg).toContain('#0a1628');
  });
});

describe('renderSelfContainedProcessBlueprintBlock', () => {
  it('renders the shared Process Blueprint fixture', () => {
    const source = readFileSync(
      path.join(corpus, 'process-blueprint/order-fulfilment.process-blueprint.transitrix.yaml'),
      'utf8',
    );
    const result = renderSelfContainedProcessBlueprintBlock(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('Receive order');
    expect(result.svg).toContain('Order fulfilment');
  });

  it('reports validation failures without throwing', () => {
    const result = renderSelfContainedProcessBlueprintBlock(`notation: process-blueprint
process_blueprint:
  id: bad
  name: X
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('embeds dark theme tokens when theme is transitrix-dark', () => {
    const source = readFileSync(
      path.join(corpus, 'process-blueprint/order-fulfilment.process-blueprint.transitrix.yaml'),
      'utf8',
    );
    const dark = renderSelfContainedProcessBlueprintBlock(source, {
      ...DEFAULT_SVG_DISPLAY_SETTINGS,
      theme: 'transitrix-dark',
    }, false);
    expect(dark.ok).toBe(true);
    if (!dark.ok) return;
    expect(dark.svg).toContain('#0a1628');
  });
});
