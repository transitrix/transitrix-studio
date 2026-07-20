// Resolved element/relation records for `validate --scope=repo --json --include-model`
// (vkgeorgia/strategy#669). A non-JS consumer (DSM's Go backend) needs the
// canon model this CLI already parses without re-implementing the notation
// schema — this is a pure projection over the same `RepoModelInput` the
// repo-scope validator consumes, not a second parse pass, so the two never
// drift out of sync.

import { docId, endpointId } from './validate-repo.js';
import type {
  RepoDoc,
  RepoModelInput,
  ResolvedElementRecord,
  ResolvedRelationRecord,
  ResolvedRepoModel,
} from './types.js';

/** Matches the `<NN>_<layer>` folder segment under `canon/elements/`, e.g.
 *  `01_motivation` -> `motivation` (ELEMENT_PRIMITIVES.md §2/§6). */
const LAYER_FOLDER_RE = /^\d+_(.+)$/;

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Derive `layer` from the `canon/elements/<NN>_<layer>/…` folder segment when
 *  the doc has no explicit `layer` field — the folder is authoritative
 *  (ELEMENT_PRIMITIVES.md §3, `ELEM-003`). */
function layerFromPath(path: string): string | undefined {
  const segs = path.split('/');
  const layerSeg = segs[2]; // canon / elements / <NN>_<layer> / …
  if (!layerSeg) return undefined;
  const m = LAYER_FOLDER_RE.exec(layerSeg);
  return m ? m[1] : undefined;
}

function resolveElement(doc: RepoDoc): ResolvedElementRecord | null {
  const id = docId(doc);
  if (!id || !doc.data) return null;
  return {
    id,
    name: readString(doc.data, 'name') ?? '',
    notation: readString(doc.data, 'notation') ?? '',
    type: readString(doc.data, 'type'),
    layer: readString(doc.data, 'layer') ?? layerFromPath(doc.path),
    sourceFile: doc.path,
  };
}

function resolveRelation(doc: RepoDoc): ResolvedRelationRecord | null {
  if (!doc.data) return null;
  const source = endpointId(doc.data['from']) ?? endpointId(doc.data['source']);
  const target = endpointId(doc.data['to']) ?? endpointId(doc.data['target']);
  if (!source || !target) return null;
  return {
    id: docId(doc) ?? '',
    kind: readString(doc.data, 'type'),
    source,
    target,
    sourceFile: doc.path,
  };
}

/** Project a loaded canon model into the resolved element/relation records a
 *  non-JS consumer can read directly, without depending on this repo's YAML
 *  parsing internals. Pure: no IO. */
export function resolveRepoModel(input: RepoModelInput): ResolvedRepoModel {
  const elements: ResolvedElementRecord[] = [];
  for (const doc of input.elements) {
    const rec = resolveElement(doc);
    if (rec) elements.push(rec);
  }
  const relations: ResolvedRelationRecord[] = [];
  for (const doc of input.relations) {
    const rec = resolveRelation(doc);
    if (rec) relations.push(rec);
  }
  return { elements, relations };
}
