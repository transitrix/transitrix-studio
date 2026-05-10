import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

import type { Bounds, ElementType, ProcessIr, SequenceFlowIr } from './ir.js';
import { dslSchemaPath } from './schema-path.js';

const SCHEMA = JSON.parse(readFileSync(dslSchemaPath(import.meta.url), 'utf8')) as object;

/** TODO(esm-no-require): Prefer native ESM imports for Ajv/ajv-formats once the Node + bundler lineup no longer forces CJS bridging; upstream context: ajv-validator/ajv tracker (dual‑package exports & NodeNext). */
const require = createRequire(import.meta.url);
type AjvClass = typeof import('ajv').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Ajv = require('ajv') as AjvClass;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addFormats = require('ajv-formats') as (instance: InstanceType<AjvClass>) => void;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateRaw = ajv.compile(SCHEMA);

export interface ParseError extends Error {
  errors?: string[];
}

function formatAjvErrors(): string[] {
  const e = validateRaw.errors;
  if (!e?.length) return [];
  return e.map(
    (err: { instancePath?: string; message?: string; keyword: string }) =>
      `${err.instancePath || '/'} ${err.message ?? err.keyword}`.trim(),
  );
}

export interface YamlDocumentRoot {
  process: {
    id: string;
    name: string;
    pools: {
      id: string;
      name: string;
      lanes: {
        id: string;
        name: string;
        elements: { id: string; type: string; name?: string }[];
      }[];
    }[];
    flows: { id?: string; from: string; to: string; condition?: string; default?: boolean; name?: string }[];
  };
}

export function validateDocument(data: unknown): asserts data is YamlDocumentRoot {
  if (!validateRaw(data)) {
    const err = new Error('DSL validation failed') as ParseError;
    err.errors = formatAjvErrors();
    throw err;
  }
}

function collectElements(doc: YamlDocumentRoot): ProcessIr {
  const p = doc.process;
  if (p.pools.length !== 1) {
    throw new Error(
      p.pools.length === 0
        ? 'At least one pool is required.'
        : `Multiple pools are not supported (found ${p.pools.length}). Use a single pool per process.`,
    );
  }
  const pool = p.pools[0];
  const seen = new Set<string>();

  const lanes = pool.lanes.map((lane) => ({
    id: lane.id,
    name: lane.name,
    elements: lane.elements.map((el) => {
      if (seen.has(el.id)) {
        throw new Error(`Duplicate element id: ${el.id}`);
      }
      seen.add(el.id);
      return {
        id: el.id,
        type: el.type as ElementType,
        name: el.name,
        poolId: pool.id,
        laneId: lane.id,
      };
    }),
  }));

  if (seen.has(pool.id)) {
    throw new Error(`Pool id must differ from element ids: ${pool.id}`);
  }
  for (const lane of pool.lanes) {
    if (seen.has(lane.id)) {
      throw new Error(`Lane id must differ from element ids: ${lane.id}`);
    }
  }

  // Collect explicit ids first so auto-generation can skip taken names.
  const explicitFlowIds = new Set(p.flows.filter((f) => f.id != null).map((f) => f.id as string));
  let autoIdx = 1;
  const flows: SequenceFlowIr[] = p.flows.map((f) => {
    let id: string;
    if (f.id != null) {
      id = f.id;
    } else {
      while (explicitFlowIds.has(`Flow_${autoIdx}`)) autoIdx++;
      id = `Flow_${autoIdx++}`;
    }
    return { id, from: f.from, to: f.to, condition: f.condition, default: f.default, name: f.name };
  });

  const seenFlowIds = new Set<string>();
  for (const f of flows) {
    if (seenFlowIds.has(f.id)) {
      throw new Error(`Duplicate flow id: ${f.id}`);
    }
    seenFlowIds.add(f.id);
  }

  for (const f of flows) {
    if (f.from === f.to) {
      throw new Error(`Self-loop flow is not supported: element "${f.from}" references itself`);
    }
    if (!seen.has(f.from)) {
      throw new Error(`Flow references unknown element (from): ${f.from}`);
    }
    if (!seen.has(f.to)) {
      throw new Error(`Flow references unknown element (to): ${f.to}`);
    }
  }

  return {
    id: p.id,
    name: p.name,
    poolId: pool.id,
    poolName: pool.name,
    lanes,
    flows,
  };
}

/**
 * Builds IR from YAML that already passed `validateDocument` (same shape as AJV-valid input).
 * For tests and advanced callers — prefer `parseYamlToIr`.
 */
export function irFromValidatedDsl(doc: YamlDocumentRoot): ProcessIr {
  return collectElements(doc);
}

export function parseYamlToIr(yamlText: string): ProcessIr {
  const data = yaml.load(yamlText);
  validateDocument(data);
  return collectElements(data);
}

export function elkNodeSize(kind: ElementType): Bounds {
  switch (kind) {
    case 'startEvent':
    case 'endEvent':
      return { x: 0, y: 0, width: 36, height: 36 };
    case 'exclusiveGateway':
    case 'parallelGateway':
      return { x: 0, y: 0, width: 50, height: 50 };
    default:
      return { x: 0, y: 0, width: 100, height: 80 };
  }
}
