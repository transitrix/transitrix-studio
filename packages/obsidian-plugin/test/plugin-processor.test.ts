import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import TransitrixStudioPlugin, { GOALS_CODE_BLOCK_LANGUAGE } from '../src/main.js';
import { ACTION_CODE_BLOCK_LANGUAGE } from '../src/notations/action.js';
import { ACTION_CARD_CODE_BLOCK_LANGUAGE } from '../src/notations/action-card.js';
import { BLOCKS_CODE_BLOCK_LANGUAGE } from '../src/notations/blocks.js';
import { DGCA_CODE_BLOCK_LANGUAGE } from '../src/notations/dgca.js';
import { DGA_CODE_BLOCK_LANGUAGE } from '../src/notations/dga.js';
import { PROCESS_BLUEPRINT_CODE_BLOCK_LANGUAGE } from '../src/notations/process-blueprint.js';
import { NOTATION_HANDLERS } from '../src/notations/registry.js';
import { mountPluginBlocks, type Plugin, unloadBlocks } from './obsidian-harness.js';

const demoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../demo');
const goalsDemo = readFileSync(path.join(demoDir, 'goals-preview.md'), 'utf8');
const fgcaDemo = readFileSync(path.join(demoDir, 'fgca-preview.md'), 'utf8');
const svgDemo = readFileSync(path.join(demoDir, 'svg-notations-preview.md'), 'utf8');

describe('TransitrixStudioPlugin Markdown processor', () => {
  it('registers transitrix-goals and renders the demo note fences', async () => {
    const plugin = new TransitrixStudioPlugin();
    await plugin.onload();
    const harness = plugin as unknown as Plugin;
    expect(harness.processors.has(GOALS_CODE_BLOCK_LANGUAGE)).toBe(true);
    expect(harness.processors.has(DGCA_CODE_BLOCK_LANGUAGE)).toBe(true);
    expect(harness.processors.has(DGA_CODE_BLOCK_LANGUAGE)).toBe(true);
    expect(harness.processors.has(ACTION_CODE_BLOCK_LANGUAGE)).toBe(true);
    expect(harness.processors.has(ACTION_CARD_CODE_BLOCK_LANGUAGE)).toBe(true);
    expect(harness.processors.has(BLOCKS_CODE_BLOCK_LANGUAGE)).toBe(true);
    expect(harness.processors.has(PROCESS_BLUEPRINT_CODE_BLOCK_LANGUAGE)).toBe(true);
    expect(harness.processors.size).toBe(NOTATION_HANDLERS.length);
    expect(harness.settingTabs.length).toBe(1);

    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const mounted = mountPluginBlocks(harness, goalsDemo, parent);
    expect(mounted.length).toBeGreaterThanOrEqual(2);
    await Promise.resolve();
    await Promise.resolve();

    const images = parent.querySelectorAll('img.transitrix-goals-block__image');
    const errors = parent.querySelectorAll('.transitrix-goals-block__error');
    expect(images.length).toBeGreaterThanOrEqual(1);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(decodeURIComponent(images[0]!.src)).toContain('Deliver reliable service');

    unloadBlocks(mounted);
    expect(parent.querySelector('img')).toBeNull();
  });

  it('re-renders open Goals blocks when display settings change', async () => {
    const plugin = new TransitrixStudioPlugin();
    await plugin.onload();
    const harness = plugin as unknown as Plugin;
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const mounted = mountPluginBlocks(harness, goalsDemo, parent);
    await Promise.resolve();
    await Promise.resolve();

    const before = decodeURIComponent(parent.querySelector('img')!.src);
    expect(before).not.toContain('#0a1628');

    await plugin.updateDisplaySettings({ theme: 'transitrix-dark' });
    await Promise.resolve();
    await Promise.resolve();

    const after = decodeURIComponent(parent.querySelector('img')!.src);
    expect(after).toContain('#0a1628');
    expect(plugin.settings.theme).toBe('transitrix-dark');

    unloadBlocks(mounted);
  });

  it('re-renders open Goals blocks when Follow Obsidian host theme changes', async () => {
    const plugin = new TransitrixStudioPlugin();
    await plugin.onload();
    await plugin.updateDisplaySettings({ theme: 'obsidian' });
    const harness = plugin as unknown as Plugin;
    document.body.classList.remove('theme-dark');
    document.documentElement.classList.remove('theme-dark');

    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const mounted = mountPluginBlocks(harness, goalsDemo, parent);
    await Promise.resolve();
    await Promise.resolve();

    const before = decodeURIComponent(parent.querySelector('img')!.src);
    expect(before).not.toContain('#0a1628');

    document.body.classList.add('theme-dark');
    harness.app.workspace.trigger('css-change');
    await Promise.resolve();
    await Promise.resolve();

    const after = decodeURIComponent(parent.querySelector('img')!.src);
    expect(after).toContain('#0a1628');

    unloadBlocks(mounted);
    document.body.classList.remove('theme-dark');
  });

  it('re-renders open DGCA blocks when node size changes', async () => {
    const plugin = new TransitrixStudioPlugin();
    await plugin.onload();
    const harness = plugin as unknown as Plugin;
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const mounted = mountPluginBlocks(harness, fgcaDemo, parent, DGCA_CODE_BLOCK_LANGUAGE);
    await Promise.resolve();
    await Promise.resolve();

    const before = decodeURIComponent(parent.querySelector('img')!.src);
    const beforeW = Number(/width="(\d+(?:\.\d+)?)"/.exec(before)?.[1] ?? NaN);

    await plugin.updateDisplaySettings({ nodeSize: 'wide' });
    await Promise.resolve();
    await Promise.resolve();

    const after = decodeURIComponent(parent.querySelector('img')!.src);
    const afterW = Number(/width="(\d+(?:\.\d+)?)"/.exec(after)?.[1] ?? NaN);
    expect(afterW).toBeGreaterThan(beforeW);
    expect(plugin.settings.nodeSize).toBe('wide');

    unloadBlocks(mounted);
  });

  it('renders DGCA and DGA demo fences independently', async () => {
    const plugin = new TransitrixStudioPlugin();
    await plugin.onload();
    const harness = plugin as unknown as Plugin;
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const dgcaMounted = mountPluginBlocks(harness, fgcaDemo, parent, DGCA_CODE_BLOCK_LANGUAGE);
    const dgaMounted = mountPluginBlocks(harness, fgcaDemo, parent, DGA_CODE_BLOCK_LANGUAGE);
    await Promise.resolve();
    await Promise.resolve();

    expect(dgcaMounted.length).toBeGreaterThanOrEqual(3);
    expect(dgaMounted.length).toBeGreaterThanOrEqual(1);

    const images = parent.querySelectorAll('img.transitrix-svg-block__image');
    const errors = parent.querySelectorAll('.transitrix-svg-block__error');
    expect(images.length).toBeGreaterThanOrEqual(2);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(decodeURIComponent(images[0]!.src)).toContain('Grow reliably');

    unloadBlocks([...dgcaMounted, ...dgaMounted]);
  });

  it('renders Action and Blocks fences from the SVG notations demo', async () => {
    const plugin = new TransitrixStudioPlugin();
    await plugin.onload();
    const harness = plugin as unknown as Plugin;
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const actionMounted = mountPluginBlocks(harness, svgDemo, parent, ACTION_CODE_BLOCK_LANGUAGE);
    const blocksMounted = mountPluginBlocks(harness, svgDemo, parent, BLOCKS_CODE_BLOCK_LANGUAGE);
    await Promise.resolve();
    await Promise.resolve();

    expect(actionMounted.length).toBeGreaterThanOrEqual(2);
    expect(blocksMounted.length).toBeGreaterThanOrEqual(2);

    const images = parent.querySelectorAll('img.transitrix-svg-block__image');
    expect(images.length).toBeGreaterThanOrEqual(3);
    expect(decodeURIComponent(images[0]!.src)).toContain('Interview stakeholders');

    unloadBlocks([...actionMounted, ...blocksMounted]);
  });
});
