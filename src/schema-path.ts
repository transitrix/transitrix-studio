import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `schemas/bpmn-dsl.schema.json` next to `dist/` or `extension/compiler/`. */
export function dslSchemaPath(fromImportMetaUrl: string): string {
  const here = dirname(fileURLToPath(fromImportMetaUrl));
  return join(here, '..', 'schemas', 'bpmn-dsl.schema.json');
}
