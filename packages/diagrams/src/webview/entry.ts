/**
 * Browser-bundle entry point for the IntelliJ JCEF preview surface (and any
 * other host that wants the same in-browser API).
 *
 * Why: ADR 0001 picks JCEF + a bundled `@transitrix/diagrams` over a JVM-side
 * re-implementation. This module is the API contract between the JVM host
 * (which posts raw document text + the notation kind) and the rendering JS
 * (which parses, validates, and — Step 3+ — renders SVG). Centralising the
 * surface in one file means the JVM side only has to know about
 * `window.transitrix.render(kind, source)` regardless of which notation the
 * user opened.
 *
 * Step 2 scope (this PR): wire YAML parsing, dispatch to the right validator,
 * surface validation/parse errors in a structured JSON shape. SVG output is
 * intentionally left empty for every notation; Step 3 swaps `goals` in first,
 * Step 4 fills the remaining ten.
 */
import yaml from 'js-yaml';

import { parseCanonicalGoals } from '../goals/parse-canonical.js';

export interface RenderError {
  code: string;
  message: string;
  path?: string;
}

export interface RenderWarning {
  code: string;
  message: string;
  path?: string;
}

export type RenderStatus = 'ok' | 'error';

export interface RenderResult {
  status: RenderStatus;
  notation: string;
  /** SVG markup once the renderer for `notation` is wired (Step 3+). Empty until then. */
  svg: string;
  errors: RenderError[];
  warnings: RenderWarning[];
}

/**
 * Notation kinds the host can request. Mirrors the `*.<kind>.<…>` suffix
 * convention used by the VS Code extension's `activationEvents`. Step 4 fills
 * the remaining ten; Step 2 only wires `goals` to its validator.
 */
export type NotationKind =
  | 'goals'
  | 'fgca'
  | 'fga'
  | 'activities'
  | 'activity-card'
  | 'applications'
  | 'products'
  | 'process-map'
  | 'process-blueprint'
  | 'scenarios'
  | 'capability-map'
  | 'blocks';

const SUPPORTED_KINDS: readonly NotationKind[] = [
  'goals',
  'fgca',
  'fga',
  'activities',
  'activity-card',
  'applications',
  'products',
  'process-map',
  'process-blueprint',
  'scenarios',
  'capability-map',
  'blocks',
];

const VERSION = '0.1.0';

function emptyResult(notation: string, status: RenderStatus): RenderResult {
  return { status, notation, svg: '', errors: [], warnings: [] };
}

function errorResult(notation: string, code: string, message: string, path?: string): RenderResult {
  const r = emptyResult(notation, 'error');
  r.errors.push(path !== undefined ? { code, message, path } : { code, message });
  return r;
}

function parseYaml(source: string): { doc?: unknown; error?: string } {
  try {
    return { doc: yaml.load(source) };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function dispatchValidate(kind: NotationKind, doc: unknown): RenderResult {
  switch (kind) {
    case 'goals': {
      const v = parseCanonicalGoals(doc);
      const r = emptyResult('goals', v.valid ? 'ok' : 'error');
      r.errors.push(...v.errors);
      r.warnings.push(...v.warnings);
      return r;
    }
    // Step 4 wires the remaining notations. Until then they parse successfully
    // and surface a clear "not wired" error rather than crashing — the JVM
    // host can show the user a meaningful message instead of an empty panel.
    default:
      return errorResult(
        kind,
        'NOTATION-NOT-WIRED',
        `Notation '${kind}' is not wired into the IntelliJ bundle yet.`,
      );
  }
}

export function render(notationKind: string, source: string): RenderResult {
  if (typeof notationKind !== 'string' || notationKind.length === 0) {
    return errorResult('', 'KIND-MISSING', 'notationKind is required');
  }
  if (typeof source !== 'string') {
    return errorResult(notationKind, 'SOURCE-INVALID', 'source must be a string');
  }
  if (!SUPPORTED_KINDS.includes(notationKind as NotationKind)) {
    return errorResult(
      notationKind,
      'KIND-UNKNOWN',
      `Unknown notation kind: '${notationKind}'. Expected one of: ${SUPPORTED_KINDS.join(', ')}.`,
    );
  }
  const parsed = parseYaml(source);
  if (parsed.error !== undefined) {
    return errorResult(notationKind, 'YAML-PARSE', parsed.error);
  }
  return dispatchValidate(notationKind as NotationKind, parsed.doc);
}

export const api = {
  version: VERSION,
  supportedKinds: SUPPORTED_KINDS,
  render,
};

export type TransitrixWebviewApi = typeof api;

// Install the API on `window.transitrix` when running in a browser-ish host
// (JCEF qualifies). In a Node/Vitest context `window` is undefined and the
// install is a no-op — the named exports remain available for unit tests.
declare const window: { transitrix?: TransitrixWebviewApi } | undefined;
if (typeof window !== 'undefined') {
  (window as { transitrix?: TransitrixWebviewApi }).transitrix = api;
}

export default api;
