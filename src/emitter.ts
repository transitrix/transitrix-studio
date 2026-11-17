import type { LayoutIr } from './ir.js';
import { emitBpmnXmlWithVersion } from './emitter-core.js';
import { transitrixPackageVersion } from './package-version.js';

export function emitBpmnXml(layout: LayoutIr): string {
  return emitBpmnXmlWithVersion(layout, transitrixPackageVersion());
}
