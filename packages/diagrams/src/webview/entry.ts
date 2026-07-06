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
 * Step 2 scope: wire YAML parsing, dispatch to the right validator, surface
 * validation/parse errors in a structured JSON shape.
 * Step 3 scope: wire the `goals` SVG renderer so the bundle returns non-empty
 * `svg` for a valid goals document.
 * Step 4 scope (this PR): wire the remaining eleven notations — each one
 * validates the parsed YAML and, when valid, renders host-neutral markup
 * (SVG for the diagram notations, an HTML fragment for the catalogue
 * notations). The JVM host drops whatever `svg` carries into the DOM, so the
 * field name is historical — it transports any self-contained markup.
 *
 * Import validators/types from leaf modules (e.g. `capability-map/validate.js`),
 * never from package `index.ts` barrels that also re-export React views —
 * esbuild cannot tree-shake those and the JCEF bundle would pull in React.
 */
import yaml from 'js-yaml';

import { validateActivities } from '../activities/index.js';
import type { ActivityDoc } from '../activities/index.js';
import { validateActivityCard } from '../activity-card/index.js';
import type { ActivityCardDoc } from '../activity-card/index.js';
import { validateApplicationsCatalogue } from '../applications/index.js';
import type { ApplicationsCatalogueFile } from '../applications/index.js';
import { validateNestedBlocks } from '../blocks/index.js';
import type { BlocksFile } from '../blocks/index.js';
import { validateCapabilityMap } from '../capability-map/validate.js';
import type { CapabilityMapFile } from '../capability-map/types.js';
import { parseCanonicalFGCA, parseCanonicalFGA } from '../fgca/parse-canonical.js';
import { parseCanonicalGoals } from '../goals/parse-canonical.js';
import { validateProcessBlueprint } from '../process-blueprint/index.js';
import type { ProcessBlueprintFile } from '../process-blueprint/index.js';
import { validateProcessMap } from '../process-map/index.js';
import type { ProcessMapFile } from '../process-map/index.js';
import { validateProductsCatalogue } from '../products/index.js';
import type { ProductsCatalogueFile } from '../products/index.js';
import { validateScenario } from '../scenarios/index.js';
import type { ScenarioFile } from '../scenarios/index.js';
import { coerceDatesToIsoStrings } from '../yaml-normalize.js';

import { renderActivitiesSvg } from './render-activities.js';
import { renderActivityCardSvg } from './render-activity-card.js';
import { renderApplicationsHtml } from './render-applications.js';
import { renderBlocksSvg } from './render-blocks.js';
import { renderCapabilityMapHtml } from './render-capability-map.js';
import { renderFgcaSvg } from './render-fgca.js';
import { renderGoalsSvg } from './render-goals.js';
import { renderProcessBlueprintSvg } from './render-process-blueprint.js';
import { renderProcessMapHtml } from './render-process-map.js';
import { renderProductsHtml } from './render-products.js';
import { renderScenarioHtml } from './render-scenarios.js';

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
  /**
   * Self-contained markup for the rendered notation — an `<svg>` for the
   * diagram notations, an HTML `<section>` for the catalogue notations. Empty
   * on validation failure (the host shows the error panel instead). The field
   * name is historical; the JVM host injects whatever it carries into the DOM.
   */
  svg: string;
  errors: RenderError[];
  warnings: RenderWarning[];
}

/**
 * Notation kinds the host can request. Mirrors the `*.<kind>.<…>` suffix
 * convention used by the VS Code extension's `activationEvents`. All twelve
 * are wired to their validator + renderer as of Step 4.
 */
export type NotationKind =
  | 'goals'
  | 'dgca'
  | 'dga'
  | 'action'
  | 'action-card'
  | 'applications'
  | 'products'
  | 'process-map'
  | 'process-blueprint'
  | 'scenarios'
  | 'capability-map'
  | 'blocks';

const SUPPORTED_KINDS: readonly NotationKind[] = [
  'goals',
  'dgca',
  'dga',
  'action',
  'action-card',
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
    // Coerce native `Date`s (bare `2026-06-01` per YAML 1.1) back to ISO
    // strings before validation — every notation validator expects string
    // dates, and the VS Code previews apply the same normalisation. Without
    // it the canonical-minus-quotes form would falsely fail shape checks.
    return { doc: coerceDatesToIsoStrings(yaml.load(source)) };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

interface ValidationLike {
  valid: boolean;
  errors: RenderError[];
  warnings: RenderWarning[];
}

/**
 * Shared shape for the validate-then-render notations: copy the validator's
 * errors/warnings into the result, and render markup only once the document is
 * valid. `renderMarkup` is a thunk so the (type-asserted) render call never
 * runs against a document the validator rejected.
 */
function renderFromValidation(
  kind: NotationKind,
  result: ValidationLike,
  renderMarkup: () => string,
): RenderResult {
  const r = emptyResult(kind, result.valid ? 'ok' : 'error');
  r.errors.push(...result.errors);
  r.warnings.push(...result.warnings);
  if (result.valid) {
    r.svg = renderMarkup();
  }
  return r;
}

function dispatchValidate(kind: NotationKind, doc: unknown): RenderResult {
  switch (kind) {
    case 'goals': {
      const v = parseCanonicalGoals(doc);
      const r = emptyResult('goals', v.valid ? 'ok' : 'error');
      r.errors.push(...v.errors);
      r.warnings.push(...v.warnings);
      if (v.valid && v.parsed) {
        const meta = (doc ?? {}) as { name?: unknown };
        const treeName = typeof meta.name === 'string' ? meta.name : '';
        r.svg = renderGoalsSvg(v.parsed, { treeName });
      }
      return r;
    }
    case 'dgca': {
      const v = parseCanonicalFGCA(doc);
      const r = emptyResult(kind, v.valid ? 'ok' : 'error');
      r.errors.push(...v.errors);
      r.warnings.push(...v.warnings);
      if (v.valid && v.parsed) {
        r.svg = renderFgcaSvg(v.parsed, { variant: 'fgca' });
      }
      return r;
    }
    case 'dga': {
      const v = parseCanonicalFGA(doc);
      const r = emptyResult(kind, v.valid ? 'ok' : 'error');
      r.errors.push(...v.errors);
      r.warnings.push(...v.warnings);
      if (v.valid && v.parsed) {
        r.svg = renderFgcaSvg(v.parsed, { variant: 'fga' });
      }
      return r;
    }
    case 'action':
      return renderFromValidation('action', validateActivities(doc), () =>
        renderActivitiesSvg(doc as ActivityDoc),
      );
    case 'action-card':
      return renderFromValidation('action-card', validateActivityCard(doc), () =>
        renderActivityCardSvg(doc as ActivityCardDoc),
      );
    case 'process-blueprint':
      return renderFromValidation('process-blueprint', validateProcessBlueprint(doc), () =>
        renderProcessBlueprintSvg(doc as ProcessBlueprintFile),
      );
    case 'blocks':
      return renderFromValidation('blocks', validateNestedBlocks(doc), () =>
        renderBlocksSvg(doc as BlocksFile),
      );
    // Catalogue notations render an HTML fragment from the header nested under
    // their top-level wrapper key (`<thing>_catalogue` / `scenario` / …).
    case 'applications':
      return renderFromValidation('applications', validateApplicationsCatalogue(doc), () =>
        renderApplicationsHtml((doc as ApplicationsCatalogueFile).applications_catalogue),
      );
    case 'products':
      return renderFromValidation('products', validateProductsCatalogue(doc), () =>
        renderProductsHtml((doc as ProductsCatalogueFile).products_catalogue),
      );
    case 'process-map':
      return renderFromValidation('process-map', validateProcessMap(doc), () =>
        renderProcessMapHtml((doc as ProcessMapFile).process_map),
      );
    case 'scenarios':
      return renderFromValidation('scenarios', validateScenario(doc), () =>
        renderScenarioHtml((doc as ScenarioFile).scenario),
      );
    case 'capability-map':
      return renderFromValidation('capability-map', validateCapabilityMap(doc), () =>
        renderCapabilityMapHtml((doc as CapabilityMapFile).capability_map),
      );
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
