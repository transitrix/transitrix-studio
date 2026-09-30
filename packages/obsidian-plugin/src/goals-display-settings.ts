import {
  DEFAULT_EDGE_CURVATURE,
  DEFAULT_EDGE_STYLE,
  parseEdgeStyle,
  type EdgeStyle,
} from '@transitrix/diagrams/edge-path.js';
import {
  parseNodeSizePreset,
  type NodeSizePreset,
} from '@transitrix/diagrams/node-size-presets.js';
import type { ThemeId } from '@transitrix/diagrams/theme/index.js';

/** Theme choices stored in plugin data. `obsidian` follows the host dark/light class. */
export type SvgThemeSetting = 'transitrix' | 'transitrix-dark' | 'obsidian';

/**
 * Shared display knobs for Reading-view SVG fences.
 * Not every notation consumes every field (see README); unsupported knobs are ignored.
 */
export interface SvgDisplaySettings {
  nodeSize: NodeSizePreset;
  edgeStyle: EdgeStyle;
  curvature: number;
  theme: SvgThemeSetting;
}

/** @deprecated Prefer {@link SvgDisplaySettings}. */
export type GoalsDisplaySettings = SvgDisplaySettings;
/** @deprecated Prefer {@link SvgThemeSetting}. */
export type GoalsThemeSetting = SvgThemeSetting;

export const DEFAULT_SVG_DISPLAY_SETTINGS: SvgDisplaySettings = {
  nodeSize: 'normal',
  edgeStyle: DEFAULT_EDGE_STYLE,
  curvature: DEFAULT_EDGE_CURVATURE,
  theme: 'transitrix',
};

/** @deprecated Prefer {@link DEFAULT_SVG_DISPLAY_SETTINGS}. */
export const DEFAULT_GOALS_DISPLAY_SETTINGS = DEFAULT_SVG_DISPLAY_SETTINGS;

const THEME_VALUES = new Set<SvgThemeSetting>(['transitrix', 'transitrix-dark', 'obsidian']);

function clampCurvature(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_EDGE_CURVATURE;
  return Math.min(3, Math.max(0, n));
}

function parseTheme(value: unknown): SvgThemeSetting {
  if (typeof value === 'string' && THEME_VALUES.has(value as SvgThemeSetting)) {
    return value as SvgThemeSetting;
  }
  return DEFAULT_SVG_DISPLAY_SETTINGS.theme;
}

/** Coerce persisted / partial plugin data into a full SVG display settings object. */
export function normalizeSvgDisplaySettings(raw: unknown): SvgDisplaySettings {
  const src = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  return {
    nodeSize: parseNodeSizePreset(typeof src.nodeSize === 'string' ? src.nodeSize : undefined),
    edgeStyle: parseEdgeStyle(src.edgeStyle),
    curvature: clampCurvature(src.curvature),
    theme: parseTheme(src.theme),
  };
}

/** @deprecated Prefer {@link normalizeSvgDisplaySettings}. */
export const normalizeGoalsDisplaySettings = normalizeSvgDisplaySettings;

/**
 * Map a plugin theme setting to an embeddable Studio ThemeId.
 * `obsidian` follows the host (`theme-dark` on documentElement/body).
 * `vscode-adaptive` is not offered — SVG embed cannot bind Obsidian CSS vars.
 */
export function resolveEmbedTheme(theme: SvgThemeSetting, isDarkHost: boolean): ThemeId {
  if (theme === 'obsidian') return isDarkHost ? 'transitrix-dark' : 'transitrix';
  return theme;
}

export function isObsidianDarkHost(doc: Document = document): boolean {
  return doc.body.classList.contains('theme-dark')
    || doc.documentElement.classList.contains('theme-dark');
}
