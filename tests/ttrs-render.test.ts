// Pure-rendering tests for extension/src/ttrs-render.ts — no vscode import in
// that module, so no stub is needed here. Exercises the acceptance criteria
// from transitrix-hq#57: the four resolver states surface distinctly, a
// deferred `each`/`trace` construct reads as "recognised, not implemented"
// rather than a generic error, suspicion is reported as not-computed rather
// than omitted, an instruction slot is visibly pending, and the
// no-repository case is bannered rather than folded into per-reference noise.

import { describe, expect, it } from 'vitest';
import { renderTtrsResult, type Pass1Result, type FigureEmbed } from '../extension/src/ttrs-render.js';

function baseResult(overrides: Partial<Pass1Result> = {}): Pass1Result {
  return {
    ok: true,
    markdown: '',
    instructionSlots: [],
    figures: [],
    errors: [],
    findings: [],
    states: {},
    suspicion: {
      computed: false,
      state: 'not-computed',
      reason: 'link suspicion (⚑S) is not computed in pass 1',
    },
    profile: 'review',
    ...overrides,
  };
}

describe('renderTtrsResult — reference states', () => {
  it('renders an unresolved reference marker with a distinct, named style', () => {
    const result = baseResult({
      markdown: '# Title\n\nSee «unresolved: REQ-99».',
      findings: [{ code: 'TTRS-010', state: 'unresolved', flag: '⚑U', id: 'REQ-99', file: 'x.mrd.ttrs' }],
    });
    const { bodyContent } = renderTtrsResult(result, new Map());
    expect(bodyContent).toContain('ttrs-state-error');
    expect(bodyContent).toContain('REQ-99');
    expect(bodyContent).toContain('unresolved');
  });

  it('renders an out-of-validity flag distinctly from unresolved/not-admitted', () => {
    const result = baseResult({ markdown: 'Some value ⚑V here.' });
    const { bodyContent } = renderTtrsResult(result, new Map());
    expect(bodyContent).toContain('ttrs-state-warning');
  });

  it('lists every finding state in the reference-issues panel, not folded into one bucket', () => {
    const result = baseResult({
      markdown: '# Doc',
      findings: [
        { code: 'TTRS-010', state: 'unresolved', flag: '⚑U', id: 'A-1', file: 'x' },
        { code: 'TTRS-014', state: 'not-admitted', flag: '⚑A', id: 'B-1', file: 'x' },
        { code: 'TTRS-015', state: 'out-of-validity', flag: '⚑V', id: 'C-1', file: 'x' },
      ],
    });
    const { bodyContent } = renderTtrsResult(result, new Map());
    expect(bodyContent).toContain('unresolved');
    expect(bodyContent).toContain('not admitted');
    expect(bodyContent).toContain('out of validity');
  });
});

describe('renderTtrsResult — no-repository case', () => {
  it('shows a distinct banner rather than folding into per-reference findings', () => {
    const result = baseResult({
      markdown: 'See «unresolved: REQ-1».',
      findings: [{ code: 'TTRS-011', state: 'no-repository', flag: null, id: null, file: 'x' }],
      errors: [{ code: 'TTRS-011', message: 'x.mrd.ttrs: template references a model object but no repository is configured' }],
    });
    const { bodyContent, errorMsg } = renderTtrsResult(result, new Map());
    expect(bodyContent).toContain('No repository configured');
    // TTRS-011 is bannered, not repeated in the hard-error box.
    expect(errorMsg).toBe('');
  });
});

describe('renderTtrsResult — deferred constructs (each/trace)', () => {
  it('surfaces TTRS-004 as "recognised, not implemented", distinct from a hard error', () => {
    const result = baseResult({
      markdown: '# Doc',
      errors: [
        { code: 'TTRS-004', message: '"{{ each REQ }}": the `each` block is a construct of the directive language that pass 1 does not implement — recognised, not implemented in this pass' },
      ],
    });
    const { bodyContent, errorMsg } = renderTtrsResult(result, new Map());
    expect(bodyContent).toContain('Recognised, not implemented in this pass');
    expect(bodyContent).toContain('each');
    // Never reported as a broken-syntax hard error.
    expect(errorMsg).toBe('');
  });

  it('still reports a genuine syntax error (TTRS-002) as a hard error', () => {
    const result = baseResult({
      markdown: '# Doc',
      ok: false,
      errors: [{ code: 'TTRS-002', message: 'unrecognised directive "{{ nonsense }}"' }],
    });
    const { errorMsg } = renderTtrsResult(result, new Map());
    expect(errorMsg).toContain('TTRS-002');
  });
});

describe('renderTtrsResult — suspicion', () => {
  it('always reports suspicion as not-computed, never omitted', () => {
    const result = baseResult({ markdown: '# Doc' });
    const { bodyContent } = renderTtrsResult(result, new Map());
    expect(bodyContent).toContain('not computed');
    expect(bodyContent).toContain('⚑S');
  });
});

describe('renderTtrsResult — instruction slots', () => {
  it('marks an instruction slot as pending, distinct from resolved content', () => {
    const result = baseResult({
      markdown: '# Doc\n\n{{# instruct market-size }}\nquestion: How big?\nsufficient: A number.\n{{/ instruct }}',
      instructionSlots: [
        { slotId: 'market-size', question: 'How big?', inputs: [], sufficient: 'A number.' },
      ],
    });
    const { bodyContent } = renderTtrsResult(result, new Map());
    expect(bodyContent).toContain('ttrs-instruct');
    expect(bodyContent).toContain('pending');
    expect(bodyContent).toContain('How big?');
    // The raw directive syntax must not leak through unstyled.
    expect(bodyContent).not.toContain('{{#');
  });
});

describe('renderTtrsResult — figures', () => {
  it('inlines rendered SVG when the host resolved one', () => {
    const embeds = new Map<number, FigureEmbed>([[1, { svg: '<svg><rect/></svg>' }]]);
    const result = baseResult({ markdown: '![context](#ttrs-fig-1)' });
    const { bodyContent } = renderTtrsResult(result, embeds);
    expect(bodyContent).toContain('<svg><rect/></svg>');
  });

  it('shows a labelled placeholder, never a broken image, when unavailable', () => {
    const embeds = new Map<number, FigureEmbed>([[1, { unavailable: 'rendering not available for this notation' }]]);
    const result = baseResult({ markdown: '![context](#ttrs-fig-1)' });
    const { bodyContent } = renderTtrsResult(result, embeds);
    expect(bodyContent).toContain('not rendered in this preview');
    expect(bodyContent).not.toContain('<img');
  });
});

describe('renderTtrsResult — headings and bold survive escaping', () => {
  it('renders a heading and bold text as HTML, not literal Markdown', () => {
    const result = baseResult({ markdown: '# Market Requirements\n\n**REQ-14** — the text.' });
    const { bodyContent } = renderTtrsResult(result, new Map());
    expect(bodyContent).toContain('<h1>Market Requirements</h1>');
    expect(bodyContent).toContain('<strong>REQ-14</strong>');
  });

  it('escapes HTML-significant characters in document text', () => {
    const result = baseResult({ markdown: 'Value < 5 & > 3 "quoted"' });
    const { bodyContent } = renderTtrsResult(result, new Map());
    expect(bodyContent).toContain('&lt; 5 &amp; &gt; 3');
  });
});
