// Snapshot file utilities — pure functions, no `vscode` imports, fully unit-testable.
//
// The snapshot envelope format is specified in CONTRACT.md §14.5:
//   view_id, generated_at, methodology_version, captured_at_date
// Files are written to `views/<notation-name>/snapshots/YYYY-MM-DDTHHMMSSZ.yaml`
// alongside the open `.view.yaml` document.

import yaml from 'js-yaml';

/** Generates a compact UTC timestamp suitable for a snapshot filename.
 *  Format: YYYY-MM-DDTHHMMSSZ (no colons, no fractional seconds).
 *  Example: "2026-06-20T143000Z.yaml" */
export function snapshotFilename(now: Date = new Date()): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  const Y = now.getUTCFullYear();
  const M = pad(now.getUTCMonth() + 1);
  const D = pad(now.getUTCDate());
  const h = pad(now.getUTCHours());
  const m = pad(now.getUTCMinutes());
  const s = pad(now.getUTCSeconds());
  return `${Y}-${M}-${D}T${h}${m}${s}Z.yaml`;
}

export interface SnapshotContentOpts {
  viewId: string;
  /** ISO-8601 UTC string, e.g. "2026-06-20T14:30:00Z" */
  generatedAt: string;
  methodologyVersion: string;
  /** YYYY-MM-DD date the user chose in the input box */
  capturedAtDate: string;
}

/** Builds the snapshot YAML content per CONTRACT.md §14.5. */
export function buildSnapshotContent(opts: SnapshotContentOpts): string {
  const doc = {
    view_id: opts.viewId,
    generated_at: opts.generatedAt,
    methodology_version: opts.methodologyVersion,
    captured_at_date: opts.capturedAtDate,
  };
  return yaml.dump(doc, { lineWidth: -1, quotingType: '"', forceQuotes: false });
}

/** Parses the view document YAML to extract `view.id` and `methodology_version`.
 *  Returns safe fallbacks ('unknown' / '0.0.0') when fields are absent. */
export function extractViewMeta(yamlText: string): { viewId: string; methodologyVersion: string } {
  let viewId = 'unknown';
  let methodologyVersion = '0.0.0';
  try {
    const parsed = yaml.load(yamlText);
    if (parsed && typeof parsed === 'object') {
      const doc = parsed as Record<string, unknown>;
      // view.id nested under a 'view' key, or flat 'view_id' at root.
      const viewObj = doc['view'];
      if (viewObj && typeof viewObj === 'object') {
        const id = (viewObj as Record<string, unknown>)['id'];
        if (typeof id === 'string' && id.trim()) viewId = id.trim();
        else if (typeof id === 'number') viewId = String(id);
      }
      if (typeof doc['view_id'] === 'string' && doc['view_id'].trim()) {
        viewId = doc['view_id'].trim();
      }
      if (typeof doc['methodology_version'] === 'string' && doc['methodology_version'].trim()) {
        methodologyVersion = doc['methodology_version'].trim();
      }
    }
  } catch {
    // Malformed YAML — return fallbacks.
  }
  return { viewId, methodologyVersion };
}

/** Filters a list of file names to those that look like snapshot files
 *  (*.yaml), then sorts them ascending (oldest first by filename, which
 *  sorts lexicographically because the timestamp format is sortable). */
export function listSnapshotFiles(files: string[]): string[] {
  return files
    .filter(f => f.endsWith('.yaml'))
    .sort((a, b) => a.localeCompare(b));
}

export interface SnapshotDisplay {
  viewId: string;
  generatedAt: string;
  capturedAtDate: string | undefined;
}

/** Parses a snapshot file's content and extracts key display fields. */
export function parseSnapshotForDisplay(yamlText: string): SnapshotDisplay {
  let viewId = '';
  let generatedAt = '';
  let capturedAtDate: string | undefined;
  try {
    const parsed = yaml.load(yamlText);
    if (parsed && typeof parsed === 'object') {
      const doc = parsed as Record<string, unknown>;
      if (typeof doc['view_id'] === 'string') viewId = doc['view_id'];
      if (typeof doc['generated_at'] === 'string') generatedAt = doc['generated_at'];
      if (typeof doc['captured_at_date'] === 'string') capturedAtDate = doc['captured_at_date'];
    }
  } catch {
    // Malformed — return empty fields.
  }
  return { viewId, generatedAt, capturedAtDate };
}
