import { isMap, isScalar, parseDocument, type Scalar } from 'yaml';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Nodes } from 'mdast';

export type Span = [number, number];
export interface MappedField { value: string; segments: Span[][] }
export interface Exclusion { span: Span; reason: string }
const scalarLength = (s: string) => Array.from(s).length;

/** Coordinates are decoded Unicode scalars and original UTF-8 bytes, respectively. */
export function extractRequirement(bytes: Uint8Array): {
  id?: string; fields: Partial<Record<'name' | 'description', MappedField>>; limitation?: string;
} {
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return { fields: {}, limitation: 'malformed-source' }; }
  let doc: ReturnType<typeof parseDocument>;
  try { doc = parseDocument(source, { version: '1.2', uniqueKeys: true, keepSourceTokens: true }); }
  catch { return { fields: {}, limitation: 'malformed-source' }; }
  if (doc.errors.length || !isMap(doc.contents)) return { fields: {}, limitation: 'malformed-source' };
  if (doc.get('notation') !== 'requirement' || typeof doc.get('id') !== 'string')
    return { fields: {}, limitation: 'unsupported-input' };
  const id = doc.get('id') as string;
  const fields: Partial<Record<'name' | 'description', MappedField>> = {};
  if (doc.contents.items.some(p => String(p.key) === '<<')) return { id, fields, limitation: 'unsupported-source-syntax' };
  for (const key of ['name', 'description'] as const) {
    const node = doc.get(key, true);
    if (!isScalar(node) || node.tag || typeof node.value !== 'string' || /[\uD800-\uDFFF]/u.test(node.value)) continue;
    const mapped = mapScalar(source, node);
    if (mapped) fields[key] = mapped;
  }
  return { id, fields };
}

function mapScalar(source: string, node: Scalar): MappedField | undefined {
  const token = node.srcToken;
  if (!token || !('source' in token) || typeof node.value !== 'string') return;
  let raw = token.source, offset = token.offset;
  const units: { char: string; span: Span }[] = [];
  const byte = (n: number) => Buffer.byteLength(source.slice(0, n), 'utf8');
  const add = (char: string, start: number, end: number) => {
    for (const c of char) units.push({ char: c, span: [byte(start), byte(end)] });
  };
  if (token.type === 'block-scalar') {
    offset += token.props.reduce((sum, p) => sum + ('source' in p ? p.source.length : 0), 0);
    const header = 'source' in token.props[0] ? token.props[0].source : '';
    const explicit = /[1-9]/.exec(header);
    const indent = explicit ? token.indent + Number(explicit[0]) : /^ *(?=\S)/m.exec(raw)?.[0].length ?? 0;
    let pos = 0;
    for (const line of raw.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? []) {
      if (!line) continue;
      const trim = Math.min(indent, /^ */.exec(line)![0].length);
      for (let i = trim; i < line.length;) {
        const c = String.fromCodePoint(line.codePointAt(i)!);
        const width = c === '\r' && line[i + 1] === '\n' ? 2 : c.length;
        add(c === '\r' ? '\n' : c, offset + pos + i, offset + pos + i + width);
        i += width;
      }
      pos += line.length;
    }
  } else {
    const quoted = token.type === 'single-quoted-scalar' || token.type === 'double-quoted-scalar';
    const end = raw.length - (quoted ? 1 : 0);
    for (let i = quoted ? 1 : 0; i < end;) {
      let c = String.fromCodePoint(raw.codePointAt(i)!); let width = c.length;
      if (token.type === 'single-quoted-scalar' && raw.slice(i, i + 2) === "''") { c = "'"; width = 2; }
      else if (token.type === 'double-quoted-scalar' && c === '\\') {
        const match = /^\\(?:x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[^\r\n])/.exec(raw.slice(i));
        if (!match) {
          const continuation = /^\\(?:\r\n|\r|\n)[ \t]*/.exec(raw.slice(i));
          if (!continuation) return;
          i += continuation[0].length; continue;
        }
        const decoded = parseDocument('"' + match[0] + '"');
        if (decoded.errors.length || typeof decoded.toJSON() !== 'string') return;
        c = decoded.toJSON(); width = match[0].length;
      } else if (c === '\r') { c = '\n'; width = raw[i + 1] === '\n' ? 2 : 1; }
      add(c, offset + i, offset + i + width); i += width;
    }
  }
  const value = Array.from(node.value); const segments: Span[][] = [];
  let at = 0;
  const whitespace = (c: string) => c === ' ' || c === '\n' || c === '\t';
  for (let i = 0; i < value.length;) {
    if (!whitespace(value[i])) {
      while (at < units.length && whitespace(units[at].char)) at++;
      if (units[at]?.char !== value[i]) return;
      segments.push([units[at++].span]); i++; continue;
    }
    let end = i; while (end < value.length && whitespace(value[end])) end++;
    let tail = at; while (tail < units.length && whitespace(units[tail].char)) tail++;
    const actual = units.slice(at, tail), wanted = value.slice(i, end).join('');
    if (actual.map(u => u.char).join('') === wanted) segments.push(...actual.map(u => [u.span]));
    else if (wanted === ' ' && actual.filter(u => u.char === '\n').length === 1 && units[tail]) {
      // A folded space includes the physical newline and following indentation.
      const newline = actual.find(u => u.char === '\n')!;
      segments.push([[newline.span[0], units[tail].span[0]]]);
    } else return;
    at = tail; i = end;
  }
  if (units.slice(at).some(u => !whitespace(u.char))) return;
  return { value: node.value, segments };
}

/** CommonMark positions refer to the unmodified decoded string. */
export function exclusions(value: string): { exclusions: Exclusion[]; links: string[] } {
  const result: Exclusion[] = []; const links: string[] = [];
  const excluded = new Set(['code', 'inlineCode', 'blockquote', 'html', 'link', 'image', 'linkReference', 'imageReference', 'definition']);
  const visit = (node: Nodes): void => {
    if (node.type === 'link' || node.type === 'definition') links.push(node.url);
    if (excluded.has(node.type) && node.position) {
      result.push({ span: [scalarLength(value.slice(0, node.position.start.offset!)), scalarLength(value.slice(0, node.position.end.offset!))], reason: node.type });
      return;
    }
    if ('children' in node) node.children.forEach(visit);
  };
  visit(fromMarkdown(value));
  const chars = Array.from(value);
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '\\' && /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(chars[i + 1] ?? '')) {
      result.push({ span: [i, i + 2], reason: 'escaped-markup' }); i++; continue;
    }
    const closer = ({ '"': '"', '“': '”', '‘': '’' } as Record<string, string>)[chars[i]];
    if (!closer || result.some(e => i >= e.span[0] && i < e.span[1])) continue;
    let j = i + 1;
    while (j < chars.length && chars[j] !== '\n') {
      if (chars[j] === '\\' && j + 1 < chars.length) { j += 2; continue; }
      if (chars[j] === closer) break;
      j++;
    }
    if (chars[j] === closer) { result.push({ span: [i, j + 1], reason: 'quotation' }); i = j; }
  }
  return { exclusions: result.sort((a, b) => a.span[0] - b.span[0]), links };
}

export function sourceSegments(field: MappedField, span: Span): Span[] {
  const output: Span[] = [];
  for (const segment of field.segments.slice(...span).flat()) {
    const last = output.at(-1);
    if (last && segment[0] <= last[1]) last[1] = Math.max(last[1], segment[1]);
    else output.push([...segment]);
  }
  return output;
}
