/**
 * Coerce native `Date` instances inside a parsed YAML document into ISO
 * `YYYY-MM-DD` strings.
 *
 * Background: per the YAML 1.1 timestamp tag, a bare `2026-06-01` is parsed
 * by `js-yaml` as a native `Date`, not a string. Every notation validator in
 * this package expects ISO date strings (`typeof === 'string'` +
 * `YYYY-MM-DD` regex), so a Date reaching validation would falsely fail
 * shape checks even though the user followed the spec, minus quotes.
 *
 * The canonical, methodology-correct form is the quoted ISO string. This
 * coercion is a backstop so the unquoted form does not silently bite.
 *
 * UTC-safe: uses `getUTC*` so the JS process timezone cannot drift the day.
 * A bare `2026-06-01` parses to midnight UTC and round-trips to
 * `"2026-06-01"` regardless of `process.env.TZ`.
 *
 * Walks in place and returns the same reference for convenience.
 */
export function coerceDatesToIsoStrings<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) {
    return dateToIsoYmd(value) as unknown as T;
  }
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v = value[i];
      if (v instanceof Date) {
        value[i] = dateToIsoYmd(v) as unknown as typeof v;
      } else if (v !== null && typeof v === 'object') {
        coerceDatesToIsoStrings(v);
      }
    }
    return value;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v instanceof Date) {
      obj[key] = dateToIsoYmd(v);
    } else if (v !== null && typeof v === 'object') {
      coerceDatesToIsoStrings(v);
    }
  }
  return value;
}

function dateToIsoYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
