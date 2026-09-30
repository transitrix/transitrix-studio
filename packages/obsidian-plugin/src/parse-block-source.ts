import yaml from 'js-yaml';
import { coerceDatesToIsoStrings } from '@transitrix/diagrams/yaml-normalize.js';

import { isRecord, type BlockDiagnostic, type BlockRenderResult } from './block-types.js';

/** Bound so a note cannot dump unbounded YAML into layout. */
export const MAX_BLOCK_BYTES = 32 * 1024;

/**
 * Nesting depth cap for `js-yaml` load (aliases do not inflate depth).
 * Combined with cycle-aware `coerceDatesToIsoStrings`, keeps Reading-view
 * parse/normalize from hanging on adversarial fences.
 */
export const MAX_YAML_DEPTH = 50;

/** Runtime options — `maxDepth` exists in js-yaml 4.3+; @types lag slightly. */
const YAML_LOAD_OPTIONS = {
  maxDepth: MAX_YAML_DEPTH,
} as yaml.LoadOptions;

export interface ParseBlockSourceCodes {
  invalidSource: string;
  oversize: string;
  empty: string;
  projection: string;
  projectionMessage: string;
}

export const DEFAULT_BLOCK_SOURCE_CODES: ParseBlockSourceCodes = {
  invalidSource: 'BLOCK-001',
  oversize: 'BLOCK-001',
  empty: 'BLOCK-001',
  projection: 'BLOCK-002',
  projectionMessage:
    'Repository-derived views are unsupported; supply a self-contained document in the code block.',
};

export type ParseBlockSourceOk = { ok: true; doc: unknown };
export type ParseBlockSourceErr = {
  ok: false;
  errors: BlockDiagnostic[];
  warnings: BlockDiagnostic[];
};
export type ParseBlockSourceResult = ParseBlockSourceOk | ParseBlockSourceErr;

export interface ParseBlockSourceOptions {
  codes?: ParseBlockSourceCodes;
  /**
   * Return true when `doc` is a repository projection that must be rejected.
   * Default: any document with `view_config` or `sources` (Goals-style).
   * FGCA may allow inline docs that also carry `view_config.layers`.
   */
  isProjection?: (doc: Record<string, unknown>) => boolean;
}

function defaultIsProjection(doc: Record<string, unknown>): boolean {
  return 'view_config' in doc || 'sources' in doc;
}

/**
 * Load YAML from a Markdown fence, enforce size, reject empty docs and
 * repository projection forms. Does not walk the vault.
 */
export function parseSelfContainedBlockSource(
  source: string,
  options: ParseBlockSourceOptions | ParseBlockSourceCodes = {},
): ParseBlockSourceResult {
  // Back-compat: Goals and early callers passed codes as the second argument.
  const opts: ParseBlockSourceOptions = isParseBlockSourceCodes(options)
    ? { codes: options }
    : options;
  const codes = opts.codes ?? DEFAULT_BLOCK_SOURCE_CODES;
  const isProjection = opts.isProjection ?? defaultIsProjection;

  if (typeof source !== 'string') {
    return fail(codes.invalidSource, 'Code block source must be text');
  }
  if (new TextEncoder().encode(source).length > MAX_BLOCK_BYTES) {
    return fail(codes.oversize, `Source must be at most ${MAX_BLOCK_BYTES} bytes`);
  }

  let doc: unknown;
  try {
    doc = coerceDatesToIsoStrings(yaml.load(source, YAML_LOAD_OPTIONS));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail('YAML_PARSE', message);
  }

  if (doc === null || doc === undefined) {
    return fail(codes.empty, 'Code block is empty');
  }

  if (isRecord(doc) && isProjection(doc)) {
    return fail(codes.projection, codes.projectionMessage);
  }

  return { ok: true, doc };
}

function isParseBlockSourceCodes(value: ParseBlockSourceOptions | ParseBlockSourceCodes): value is ParseBlockSourceCodes {
  return 'invalidSource' in value && 'projection' in value && 'projectionMessage' in value;
}

function fail(code: string, message: string): ParseBlockSourceErr {
  return { ok: false, errors: [{ code, message }], warnings: [] };
}

/** Narrow a failed parse into a {@link BlockRenderResult}. */
export function parseFailureAsRenderResult(parsed: ParseBlockSourceErr): BlockRenderResult {
  return { ok: false, errors: parsed.errors, warnings: parsed.warnings };
}
