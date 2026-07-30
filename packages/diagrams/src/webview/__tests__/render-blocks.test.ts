/**
 * Unit tests for the host-neutral nested-blocks SVG renderer used by both the
 * VS Code blocks preview and the IntelliJ JCEF webview bundle. These tests pin
 * the per-node label rule (CLAUDE.md "Entity block layout"): leaf nodes wrap
 * the name to at most 3 lines and the ID to at most 2 lines, with `…`
 * truncation beyond that; container headers stack name + ID, each truncated
 * with `…` to fit the block width. No label may extend past the rect.
 */
import { describe, expect, it } from 'vitest';

import type { BlocksFile, GridFile } from '../../blocks/types.js';
import { layoutGrid } from '../../blocks/layout.js';
import { renderBlocksSvg, renderGridSvg, renderGridLayoutSvg } from '../render-blocks.js';
import { CHAR_W_PRIMARY as CHAR_W, CHAR_W_ID, TEXT_MARGIN_X } from '../entity-text-layout.js';
import { ENTITY_NODE_SIZE } from '../../node-size-presets.js';
import { generateWebviewCss } from '../../theme/index.js';

const LEAF_W = ENTITY_NODE_SIZE.normal.width;
const LEAF_H = ENTITY_NODE_SIZE.normal.height;

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
    const longId =
      'VERY_LONG_BLOCK_IDENTIFIER_WITH_MANY_SEGMENTS_AND_MORE_AND_MORE_EXTRA_TAIL_TO_FORCE_TRUNCATION';
    const svg = renderBlocksSvg(leafDoc('Short name', longId));
    const idLines = extractLabels(svg).filter((l) => l.cls === 'text-id');
    expect(idLines.length).toBeGreaterThan(0);
    expect(idLines.length).toBeLessThanOrEqual(2);
    if (idLines.length === 2) {
      expect(idLines[1].text.endsWith('…')).toBe(true);
    }
  });

  it(`keeps every label inside the ${LEAF_W}px leaf width (approximated by CHAR_W * length)`, () => {
    const svg = renderBlocksSvg(
      leafDoc(
        'Personal data records that linger after consent withdrawal across many systems',
        'PII_RECORDS_WITH_A_FAIRLY_LONG_IDENTIFIER_HERE',
      ),
    );
    const labels = extractLabels(svg);
    const inner = LEAF_W - TEXT_MARGIN_X * 2;
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
    // Container width derives from its single leaf child: leafW + 2×padding.
    const containerW = LEAF_W + 24;
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
    const containerW = LEAF_W + 24;
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

// Matrix subset (08-blocks.md §4a) — modelled on the real RACI template
// (methodology `templates/raci/raci.blocks.transitrix.yaml`).
const RACI_GRID: GridFile = {
  notation: 'blocks',
  spec_version: '0.1',
  grid: {
    columns: [
      { id: 'ROLE-PRODUCT', name: 'Product Owner' },
      { id: 'ROLE-LEAD-ARCH', name: 'Lead Architect' },
      { id: 'ROLE-REVIEW-BOARD', name: 'Architecture Review Board' },
    ],
    rows: [
      {
        id: 'ACT-PROPOSE',
        name: 'Propose a change',
        assign: { 'ROLE-PRODUCT': 'A', 'ROLE-LEAD-ARCH': 'C', 'ROLE-REVIEW-BOARD': 'I' },
      },
      {
        id: 'ACT-DECIDE',
        name: 'Approve / reject',
        assign: { 'ROLE-REVIEW-BOARD': 'A', 'ROLE-LEAD-ARCH': 'R' },
      },
    ],
  },
};

describe('renderGridSvg — matrix subset', () => {
  it('renders one text-header line per column and one text-primary line per row', () => {
    const svg = renderGridSvg(RACI_GRID);
    for (const col of RACI_GRID.grid.columns) {
      // Column names are wrapped to up to 2 lines, so match on a fragment.
      expect(svg).toMatch(new RegExp(`<text class="text-header"[\\s\\S]*?${col.name.split(' ')[0]}`));
    }
    for (const row of RACI_GRID.grid.rows) {
      expect(svg).toMatch(new RegExp(`<text class="text-primary"[\\s\\S]*?${row.name.split(' ')[0]}`));
    }
  });

  it('renders every non-blank assign value as text-secondary', () => {
    const svg = renderGridSvg(RACI_GRID);
    const values = svg.match(/<text class="text-secondary"[^>]*>([^<]*)<\/text>/g) ?? [];
    expect(values.some((t) => t.includes('>A<'))).toBe(true);
    expect(values.some((t) => t.includes('>R<'))).toBe(true);
    expect(values.some((t) => t.includes('>C<'))).toBe(true);
    expect(values.some((t) => t.includes('>I<'))).toBe(true);
  });

  it('does not emit a text-secondary element for a blank cell', () => {
    const svg = renderGridSvg(RACI_GRID);
    // 3 columns x 2 rows = 6 cells; only 5 are assigned (ACT-DECIDE has no
    // ROLE-PRODUCT entry), so exactly 5 value texts should render.
    const values = svg.match(/<text class="text-secondary"[^>]*>[^<]*<\/text>/g) ?? [];
    expect(values).toHaveLength(5);
  });

  it('returns a zero-size svg for an empty grid', () => {
    const svg = renderGridSvg({ notation: 'blocks', grid: { columns: [], rows: [] } });
    expect(svg).toContain('width="0" height="0"');
  });
});

// Regression for HUB-853: the grid preview rendered as a solid black
// rectangle in the VS Code webview (CLI validation and `nested_blocks`
// preview were unaffected). Root cause: the full-bounds border rect —
// the last, topmost element emitted — carried a CSS class
// (`.blocks-grid-border`) that was only ever defined in a locally-embedded
// `<style>` block passed by the CLI/IntelliJ host path. The live VS Code
// webview builds its SVG body via `renderGridLayoutSvg` *without*
// `embedCssTheme` (see `extension/src/blocks-preview.ts`'s `gridLayoutToSvg`)
// and supplies CSS separately via the webview shell — so that class never
// resolved there, and the rect fell back to SVG's default opaque black fill,
// painting over every header/cell beneath it.
describe('renderGridLayoutSvg — webview render pipeline (no embedded CSS)', () => {
  const layout = layoutGrid(RACI_GRID);

  it('the full-bounds border rect is explicitly fill="none", independent of any CSS class resolving', () => {
    // This is the path blocks-preview.ts (VS Code) actually takes: no
    // embedCssTheme, CSS supplied live by the webview shell instead.
    const svg = renderGridLayoutSvg(layout);
    const borderRect = svg.match(/<rect class="blocks-grid-border"[^>]*\/>/)?.[0];
    expect(borderRect).toBeDefined();
    expect(borderRect).toContain('fill="none"');
  });

  it('does not paint an opaque rect on top of the header/cell content', () => {
    const svg = renderGridLayoutSvg(layout);
    // Any <rect> without an explicit fill="none" and without a
    // .diagram-node/level-N class relies on the webview to supply the fill —
    // guard that only the known, level-classed background/header/row rects
    // do that; every other rect must be self-defensive.
    const rects = svg.match(/<rect[^>]*\/>/g) ?? [];
    for (const rect of rects) {
      const hasLevelClass = /class="diagram-node level-\d"/.test(rect);
      const hasExplicitFillNone = /fill="none"/.test(rect);
      expect(hasLevelClass || hasExplicitFillNone).toBe(true);
    }
  });

  it('the live webview theme CSS (both themes) defines .blocks-grid-border with fill:none', () => {
    for (const themeId of ['transitrix', 'transitrix-dark'] as const) {
      const css = generateWebviewCss(themeId);
      expect(css).toMatch(/\.blocks-grid-border\{fill:none;stroke:var\(--ts-border\);\}/);
    }
  });
});
