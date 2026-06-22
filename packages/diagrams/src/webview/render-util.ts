/**
 * Small set of host-neutral helpers shared by the `render-*.ts` modules.
 *
 * The webview bundle (ADR 0001) runs inside JCEF without access to any host
 * APIs, so all string/markup utilities must stay framework-free here.
 */

export function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Same encoding as `escXml`; aliased so HTML-table renderers read clearly. */
export const escHtml = escXml;

/**
 * Extracts standard diagram-level metadata from a raw parsed YAML document.
 *
 * Per CONTRACT §1.1, every notation stores its canonical metadata at the root level:
 *   name:         "Human-readable diagram title"  # required
 *   generated_at: "YYYY-MM-DD"                    # optional
 *
 * Backward-compat reads: `title` (legacy alias for `name`), `date` (legacy alias
 * for `generated_at`), and `description`/`version` which are not in the standard
 * but widely present in existing files.
 *
 * Host-neutral so both the VS Code preview chrome and the webview bundle share a
 * single metadata reader (review E). Accepts `unknown` and guards internally.
 */
export function extractDiagramMeta(doc: unknown): {
  title: string | undefined;
  subtitle: string | undefined;
  date: string | undefined;
  version: string | undefined;
} {
  const raw = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>;
  const name = typeof raw['name'] === 'string' ? raw['name'] : undefined;
  const title = name ?? (typeof raw['title'] === 'string' ? raw['title'] : undefined);
  const subtitle = typeof raw['description'] === 'string' ? raw['description'] : undefined;
  const genAt = typeof raw['generated_at'] === 'string' ? raw['generated_at'] : undefined;
  const date = genAt ?? (typeof raw['date'] === 'string' ? raw['date'] : undefined);
  const version = raw['version'] !== undefined ? String(raw['version']) : undefined;
  return { title, subtitle, date, version };
}
