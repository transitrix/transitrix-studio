/**
 * Unit tests for the host-neutral metadata reader shared by the VS Code preview
 * chrome and the IntelliJ JCEF webview bundle (review E — single metadata
 * reader). Locks the CONTRACT §1.1 precedence: `name` over legacy `title`, and
 * `generated_at` over legacy `date`.
 */
import { describe, expect, it } from 'vitest';

import { escHtml, escXml, extractDiagramMeta } from '../render-util.js';

describe('escXml / escHtml', () => {
  it('escapes XML-significant characters and aliases escHtml', () => {
    expect(escXml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
    expect(escHtml).toBe(escXml);
  });
});

describe('extractDiagramMeta', () => {
  it('reads canonical name/generated_at and version/description', () => {
    expect(
      extractDiagramMeta({
        name: 'Quarterly goals',
        description: 'Q3 plan',
        generated_at: '2026-06-22',
        version: 3,
      }),
    ).toEqual({
      title: 'Quarterly goals',
      subtitle: 'Q3 plan',
      date: '2026-06-22',
      version: '3',
    });
  });

  it('prefers name over legacy title and generated_at over legacy date', () => {
    expect(
      extractDiagramMeta({
        name: 'Canonical',
        title: 'Legacy title',
        generated_at: '2026-01-01',
        date: '2020-12-31',
      }),
    ).toMatchObject({ title: 'Canonical', date: '2026-01-01' });
  });

  it('falls back to legacy title/date when canonical keys are absent', () => {
    expect(
      extractDiagramMeta({ title: 'Legacy title', date: '2020-12-31' }),
    ).toMatchObject({ title: 'Legacy title', date: '2020-12-31' });
  });

  it('returns all-undefined for non-object input', () => {
    expect(extractDiagramMeta(null)).toEqual({
      title: undefined,
      subtitle: undefined,
      date: undefined,
      version: undefined,
    });
    expect(extractDiagramMeta('not a doc')).toEqual({
      title: undefined,
      subtitle: undefined,
      date: undefined,
      version: undefined,
    });
  });
});
