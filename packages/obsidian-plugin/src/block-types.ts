/** Shared diagnostics / result shape for Reading-view SVG code blocks. */

export interface BlockDiagnostic {
  code: string;
  message: string;
  path?: string;
}

export type BlockRenderResult =
  | { ok: true; svg: string; warnings: BlockDiagnostic[] }
  | { ok: false; errors: BlockDiagnostic[]; warnings: BlockDiagnostic[] };

export function formatBlockDiagnostics(items: BlockDiagnostic[]): string {
  return items
    .map((d) => (d.path ? `${d.code} ${d.path}: ${d.message}` : `${d.code}: ${d.message}`))
    .join('\n');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
