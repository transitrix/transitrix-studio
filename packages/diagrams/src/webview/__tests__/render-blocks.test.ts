/**
 * Unit tests for the host-neutral nested-blocks SVG renderer used by both the
 * VS Code blocks preview and the IntelliJ JCEF webview bundle. These tests pin
 * the per-node label rule (CLAUDE.md "Entity block layout"): leaf nodes wrap
 * the name to at most 3 lines and the ID to at most 2 lines, with `…`
 * truncation beyond that; container headers stack name + ID, each truncated
 * with `…` to fit the block width. No label may extend past the rect.
 */
import { describe, expect, it } from 'vitest';

import type { BlocksFile } from '../../blocks/types.js';
import { renderBlocksSvg } from '../render-blocks.js';

// Approximate character widths used by the renderer when sizing labels.
// Kept in sync with `CHAR_W` / `CHAR_W_ID` in render-blocks.ts so the test
// can compute the same overflow bounds the renderer uses.
const CHAR_W = 7;
const CHAR_W_ID = 6;

// Same horizontal margin the renderer reserves so text never abuts the rect.
const TEXT_MARGIN_X = 8;

function leafDoc(name: string, id: string): BlocksFile {
  return {
    notation: 'blocks',
    spec_version: '0.1',
    nested_blocks: {
      id: 'BLOCKS-T-1',
      name: 'Test',
      blocks: [{ id, name }],
    },
  };
}

function containerDoc(name: string, id: string, childId = 'CHILD', childName = 'Child'): BlocksFile {
  return {
    notation: 'blocks',
    spec_version: '0.1',
    nested_blocks: {
      id: 'BLOCKS-T-1',
      name: 'Test',
      blocks: [
        {
          id,
          name,
          children: [{ id: childId, name: childName }],
        },
      ],
    },
  };
}

/** Pull every text-primary / text-id line out of an SVG, in document order. */
function extractLabels(svg: string): Array<{ cls: string; text: string }> {
  const re = /<text class="(text-(?:primary|id))"[^>]*>([^<]*)<\/text>/g;
  const out: Array<{ cls: string; text: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) out.push({ cls: m[1], text: m[2] });
  return out;
}

/** Extract {class, y} for each text element in SVG document order. */
function extractTextY(svg: string): Array<{ cls: string; y: number }> {
  const re = /<text class="(text-(?:primary|id))"[^>]*\by="([^"]+)"/g;
  const out: Array<{ cls: string; y: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) out.push({ cls: m[1], y: parseFloat(m[2]) });
  return out;
}

describe('renderBlocksSvg — leaf labels', () => {
  it('wraps a long name to at most 3 lines and truncates with …', () => {
    const longName =
      'Personal data records that linger after consent withdrawal across many systems and ' +
      'archives — known erasure gap';
    const svg = renderBlocksSvg(leafDoc(longName, 'PII'));
    const nameLines = extractLabels(svg).filter((l) => l.cls === 'text-primary');
    expect(nameLines.length).toBeGreaterThan(0);
    expect(nameLines.length).toBeLessThanOrEqual(3);
    // If the name needed truncation, the final visible line must end with `…`.
    if (nameLines.length === 3) {
      expect(nameLines[2].text.endsWith('…')).toBe(true);
    }
  });

  it('wraps a long ID to at most 2 lines and truncates with …', () => {
    const longId = 'VERY_LONG_BLOCK_IDENTIFIER_WITH_MANY_SEGMENTS_AND_MORE_AND_MORE';
    const svg = renderBlocksSvg(leafDoc('Short name', longId));
    const idLines = extractLabels(svg).filter((l) => l.cls === 'text-id');
    expect(idLines.length).toBeGreaterThan(0);
    expect(idLines.length).toBeLessThanOrEqual(2);
    if (idLines.length === 2) {
      expect(idLines[1].text.endsWith('…')).toBe(true);
    }
  });

  it('keeps every label inside the 160px leaf width (approximated by CHAR_W * length)', () => {
    const svg = renderBlocksSvg(
      leafDoc(
        'Personal data records that linger after consent withdrawal across many systems',
        'PII_RECORDS_WITH_A_FAIRLY_LONG_IDENTIFIER_HERE',
      ),
    );
    const labels = extractLabels(svg);
    const inner = 160 - TEXT_MARGIN_X * 2;
    for (const l of labels) {
      const cw = l.cls === 'text-primary' ? CHAR_W : CHAR_W_ID;
      expect(l.text.length * cw).toBeLessThanOrEqual(inner);
    }
  });
});

describe('renderBlocksSvg — container headers', () => {
  it('renders the name and ID as two separate stacked text elements', () => {
    const svg = renderBlocksSvg(containerDoc('Active systems', 'ACTIVE_SYSTEMS'));
    const labels = extractLabels(svg);
    // Container header contributes one text-primary (name) and one text-id (id);
    // the leaf child contributes another pair. So 2 of each kind in total.
    const primaries = labels.filter((l) => l.cls === 'text-primary').map((l) => l.text);
    const ids = labels.filter((l) => l.cls === 'text-id').map((l) => l.text);
    expect(primaries).toContain('Active systems');
    expect(ids).toContain('ACTIVE_SYSTEMS');
    // The legacy "(id)" suffix on the name line must not appear — id has its own row.
    for (const t of primaries) expect(t).not.toContain('(');
  });

  it('truncates a long container ID so it does not overflow the block width', () => {
    const svg = renderBlocksSvg(
      containerDoc(
        'Short name',
        'VERY_LONG_CONTAINER_IDENTIFIER_THAT_WOULD_OTHERWISE_OVERFLOW',
        'CHILD',
        'Child',
      ),
    );
    const labels = extractLabels(svg);
    // The container width derives from its single 160px child: 160 + 2*12 (padding) = 184.
    const containerW = 160 + 24;
    const inner = containerW - TEXT_MARGIN_X * 2;
    for (const l of labels) {
      const cw = l.cls === 'text-primary' ? CHAR_W : CHAR_W_ID;
      expect(l.text.length * cw).toBeLessThanOrEqual(inner);
    }
    // The full ID was too long to fit on one line of `inner / CHAR_W_ID` chars, so
    // the rendered ID must be the truncated form ending in `…`.
    const renderedIds = labels.filter((l) => l.cls === 'text-id').map((l) => l.text);
    expect(renderedIds.some((t) => t.endsWith('…'))).toBe(true);
  });

  it('truncates a long container name with … to fit the block width', () => {
    const longName =
      'Active systems that are erasure-reachable within the standard 30-day operational window';
    const svg = renderBlocksSvg(containerDoc(longName, 'ACTIVE'));
    const labels = extractLabels(svg);
    const containerW = 160 + 24;
    const inner = containerW - TEXT_MARGIN_X * 2;
    const primaries = labels.filter((l) => l.cls === 'text-primary');
    for (const l of primaries) {
      expect(l.text.length * CHAR_W).toBeLessThanOrEqual(inner);
    }
    // At least one primary line must have been truncated.
    expect(primaries.some((l) => l.text.endsWith('…'))).toBe(true);
  });
});

describe('renderBlocksSvg — name/ID vertical overlap regression (follows-up on #419)', () => {
  // Root cause: NAME_ID_GAP was 6 px. text-primary is 12 px tall (±6 px around
  // centre) and text-id is 10 px tall (±5 px around centre). The minimum gap
  // between centres to avoid overlap is 11 px; a gap of 6 caused 5 px of overlap.
  // Fix: NAME_ID_GAP = 14 (3 px visual buffer, matching the gap between name lines).

  const NAME_HALF_H = 6;  // half of text-primary font size (12 px)
  const ID_HALF_H = 5;    // half of text-id font size (10 px)

  it('leaf node: last name line bottom does not overlap first ID line top (1 name + 1 ID)', () => {
    const svg = renderBlocksSvg(leafDoc('Short', 'BLK-1'));
    const positions = extractTextY(svg);
    const nameY = positions.filter(p => p.cls === 'text-primary').map(p => p.y);
    const idY = positions.filter(p => p.cls === 'text-id').map(p => p.y);
    expect(nameY.length).toBeGreaterThan(0);
    expect(idY.length).toBeGreaterThan(0);
    const lastNameBottom = Math.max(...nameY) + NAME_HALF_H;
    const firstIdTop = Math.min(...idY) - ID_HALF_H;
    expect(firstIdTop).toBeGreaterThan(lastNameBottom);
  });

  it('leaf node: no overlap with a 3-word name (2 name lines + 1 ID)', () => {
    const svg = renderBlocksSvg(leafDoc('Three Word Name', 'BLK-001'));
    const positions = extractTextY(svg);
    const nameY = positions.filter(p => p.cls === 'text-primary').map(p => p.y);
    const idY = positions.filter(p => p.cls === 'text-id').map(p => p.y);
    const lastNameBottom = Math.max(...nameY) + NAME_HALF_H;
    const firstIdTop = Math.min(...idY) - ID_HALF_H;
    expect(firstIdTop).toBeGreaterThan(lastNameBottom);
  });

  it('leaf node: no overlap with a long name (3 name lines) and wrapped ID (2 lines)', () => {
    const longName =
      'Personal data records that linger after consent withdrawal across many systems and archives';
    const longId = 'VERY_LONG_BLOCK_IDENTIFIER_WITH_MANY_SEGMENTS_AND_MORE';
    const svg = renderBlocksSvg(leafDoc(longName, longId));
    const positions = extractTextY(svg);
    const nameY = positions.filter(p => p.cls === 'text-primary').map(p => p.y);
    const idY = positions.filter(p => p.cls === 'text-id').map(p => p.y);
    const lastNameBottom = Math.max(...nameY) + NAME_HALF_H;
    const firstIdTop = Math.min(...idY) - ID_HALF_H;
    expect(firstIdTop).toBeGreaterThan(lastNameBottom);
  });
});
