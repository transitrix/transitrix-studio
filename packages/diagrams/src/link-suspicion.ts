// Link suspicion — methodology CONTRACT.md §16, reference implementation
// `scripts/check-link-suspicion.mjs`. Pure: content-identity normalisation
// (§16.1) and the suspicion verdict (§16.2 / §16.3's mechanical hatch) over
// already-fetched file text. Git plumbing (finding the anchor commit,
// reading a file at a ref) and the repo walk are IO and live in the CLI
// (`src/repo-validate.ts`), same split as the rest of this package.
//
// Nothing here is stored: a caller re-derives the verdict on every check;
// no file ever carries a `suspicious: true` flag (§16.2).

// The administrative envelope (§16.1) — field names CONTRACT.md already
// defines by name (§6 / §6.1 / §6.2 / §6.3 when present / §7). One list,
// defined once; a spec revision that adds an envelope field extends this
// list in the same revision rather than inventing a second mechanism.
export const ENVELOPE_FIELDS = [
  'zone', 'admitted_at', 'admitted_by', 'gate_checks', 'derived_from',
  'admission_state', 'proposed_at', 'proposed_by', 'owner_to_confirm',
  'rejected_at', 'rejected_by', 'rejection_reason',
  'reviewer_authority',
  'agreement', 'agreed_by', 'agreed_at',
  'valid_from', 'valid_to',
];

function stripComment(line: string): string {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === '#' && !inQuotes) return line.slice(0, i);
  }
  return line;
}

/** Every non-blank, non-comment line of the file, except those belonging to
 *  an `ENVELOPE_FIELDS` block (the key line and its more-indented
 *  continuation lines), whitespace-normalised and sorted —
 *  order-independent, formatting-independent, comment-independent. Not a
 *  general YAML parser — a flat, line-oriented pass over the already-known
 *  envelope field names, the same posture the methodology reference script
 *  takes (its own header comment cites `baseline-manifest.mjs` /
 *  `check-agreement.mjs` for precedent). */
export function statementLines(text: string): string[] {
  const kept: string[] = [];
  let skipIndent: number | null = null;
  for (const raw of text.split('\n')) {
    const stripped = stripComment(raw).replace(/\s+$/, '');
    if (!stripped.trim()) continue;
    const indent = stripped.match(/^ */)?.[0].length ?? 0;
    if (skipIndent !== null) {
      if (indent > skipIndent) continue;
      skipIndent = null;
    }
    const keyMatch = stripped.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*):/);
    if (keyMatch && keyMatch[1].length === 0 && ENVELOPE_FIELDS.includes(keyMatch[2])) {
      skipIndent = indent;
      continue;
    }
    kept.push(stripped.trim().replace(/\s+/g, ' '));
  }
  return kept.sort();
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

export interface LineEdit {
  from: string;
  to: string;
}

/** A parsed `migrations/<slug>/TRANSFORM.yaml` manifest (§16.3). */
export interface MigrationManifest {
  slug: string;
  mechanical: boolean;
  appliesTo: string[];
  lineEdits: LineEdit[];
}

function unquote(s: string): string {
  const m = s.match(/^"(.*)"$/);
  return m ? m[1] : s;
}

function normalizeEditLine(s: string): string {
  return unquote(s.trim()).trim().replace(/\s+/g, ' ');
}

/** Minimal parse of the fixed `TRANSFORM.yaml` shape — `mechanical: true`,
 *  `applies_to: [exact relative paths]`, `line_edits: [{from, to}]`. Not a
 *  general YAML parser, same posture as {@link statementLines}. */
export function parseMigrationManifest(text: string): Omit<MigrationManifest, 'slug'> {
  const manifest: Omit<MigrationManifest, 'slug'> = { mechanical: false, appliesTo: [], lineEdits: [] };
  let section: 'applies_to' | 'line_edits' | null = null;
  let current: LineEdit | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (topMatch) {
      const [, key, val] = topMatch;
      if (key === 'mechanical') {
        manifest.mechanical = val.trim() === 'true';
        section = null;
      } else if (key === 'applies_to') {
        section = 'applies_to';
      } else if (key === 'line_edits') {
        section = 'line_edits';
      }
      continue;
    }

    if (section === 'applies_to') {
      const m = line.match(/^\s*-\s*(.+)$/);
      if (m) manifest.appliesTo.push(unquote(m[1].trim()));
    } else if (section === 'line_edits') {
      const fromMatch = line.match(/^\s*-\s*from:\s*(.+)$/);
      if (fromMatch) {
        current = { from: normalizeEditLine(fromMatch[1]), to: '' };
        manifest.lineEdits.push(current);
        continue;
      }
      const toMatch = line.match(/^\s*to:\s*(.+)$/);
      if (toMatch && current) current.to = normalizeEditLine(toMatch[1]);
    }
  }
  return manifest;
}

/** Replay a manifest's declared `lineEdits` against the before-state and
 *  check the result matches the after-state exactly — the independent
 *  verification §16.3 requires: the tool's `mechanical: true` declaration is
 *  never trusted on its own; only a replay that reproduces the after-state
 *  suppresses suspicion. */
function replayExplains(beforeLines: string[], afterLines: string[], lineEdits: LineEdit[]): boolean {
  const working = [...beforeLines];
  for (const edit of lineEdits) {
    const idx = working.indexOf(edit.from);
    if (idx === -1) return false;
    working.splice(idx, 1, edit.to);
  }
  return sameLines([...working].sort(), [...afterLines].sort());
}

export interface SuspicionResult {
  suspicious: boolean;
  /** True when a manifest declared `mechanical: true` for this target but
   *  its replay did not fully explain the change — the hatch does not
   *  self-grant; suspicion stands regardless of the flag (§16.3). */
  hatchRefused?: boolean;
}

/**
 * §16.2: *Suspicious* ⟺ the target's content identity at the anchor commit
 * differs from its content identity now, **and** §16.3's hatch does not
 * explain the difference.
 *
 * `beforeText` / `afterText` are already-fetched (git IO lives in the
 * caller); `undefined` for either (no anchor, or the target no longer
 * exists) means nothing to compare — not suspicious, per the reference
 * script's `target-absent-at-anchor` / `target-absent-now` cases.
 */
export function checkSuspicion(
  beforeText: string | undefined,
  afterText: string | undefined,
  applicableManifests: Array<Omit<MigrationManifest, 'slug'>> = [],
): SuspicionResult {
  if (beforeText === undefined || afterText === undefined) return { suspicious: false };

  const beforeLines = statementLines(beforeText);
  const afterLines = statementLines(afterText);
  if (sameLines(beforeLines, afterLines)) return { suspicious: false };

  for (const manifest of applicableManifests) {
    if (replayExplains(beforeLines, afterLines, manifest.lineEdits)) {
      return { suspicious: false };
    }
  }
  return { suspicious: true, hatchRefused: applicableManifests.some((m) => m.mechanical) };
}
