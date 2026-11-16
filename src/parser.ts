import { readFileSync } from 'node:fs';
import { dslSchemaPath } from './schema-path.js';
import { createBpmnParser, type BpmnParser, type YamlDocumentRoot } from './parser-core.js';

export { elkNodeSize, irFromValidatedDsl } from './parser-core.js';
export type { ParseError, YamlDocumentRoot } from './parser-core.js';

const parser: BpmnParser = createBpmnParser(JSON.parse(readFileSync(dslSchemaPath(import.meta.url), 'utf8')));

export function validateDocument(data: unknown): asserts data is YamlDocumentRoot {
  parser.validateDocument(data);
}

export const parseYamlToIr = parser.parseYamlToIr;
