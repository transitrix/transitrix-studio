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

/** Pull common frontmatter for the optional preview heading. */
export function readDocHeader(doc: unknown): {
  title?: string;
  subtitle?: string;
  version?: string;
  date?: string;
} {
  if (!doc || typeof doc !== 'object') return {};
  const raw = doc as Record<string, unknown>;
  const out: { title?: string; subtitle?: string; version?: string; date?: string } = {};
  if (typeof raw['title'] === 'string') out.title = raw['title'];
  if (typeof raw['description'] === 'string') out.subtitle = raw['description'];
  if (raw['version'] !== undefined) out.version = String(raw['version']);
  if (typeof raw['date'] === 'string') out.date = raw['date'];
  return out;
}
