import { describe, expect, it } from 'vitest';

import { assembleChangelog, groupFragments, parseFragment } from '../scripts/changelog-fragments.mjs';

describe('parseFragment', () => {
  it('extracts the section and bullet body', () => {
    const content = '### Added\n\n- **Thing.** Description.\n';
    expect(parseFragment('a.md', content)).toEqual({
      section: 'Added',
      body: '- **Thing.** Description.',
    });
  });

  it('supports a multi-line bullet body', () => {
    const content = '### Fixed\n\n- **Bug.** First line.\n  Second line.\n';
    expect(parseFragment('a.md', content)).toEqual({
      section: 'Fixed',
      body: '- **Bug.** First line.\n  Second line.',
    });
  });

  it('throws when no "### <Section>" header is present', () => {
    expect(() => parseFragment('bad.md', '- just a bullet\n')).toThrow(/no "### <Section>" header/);
  });

  it('throws when the header has no bullet content under it', () => {
    expect(() => parseFragment('empty.md', '### Added\n\n')).toThrow(/no bullet content/);
  });
});

describe('groupFragments', () => {
  it('groups fragments by section in canonical order regardless of input order', () => {
    const grouped = groupFragments([
      { file: 'b.md', section: 'Packages', body: '- pkg bump' },
      { file: 'a.md', section: 'Added', body: '- new thing' },
      { file: 'c.md', section: 'Fixed', body: '- fixed thing' },
    ]);
    expect([...grouped.keys()]).toEqual(['Added', 'Fixed', 'Packages']);
  });

  it('concatenates multiple fragments under the same section, preserving input order', () => {
    const grouped = groupFragments([
      { file: 'a.md', section: 'Added', body: '- first' },
      { file: 'b.md', section: 'Added', body: '- second' },
    ]);
    expect(grouped.get('Added')).toEqual(['- first', '- second']);
  });

  it('appends an unrecognized section after the canonical ones', () => {
    const grouped = groupFragments([
      { file: 'a.md', section: 'Added', body: '- new' },
      { file: 'b.md', section: 'Experimental', body: '- odd' },
    ]);
    expect([...grouped.keys()]).toEqual(['Added', 'Experimental']);
  });
});

describe('assembleChangelog', () => {
  it('is a no-op when there is nothing to assemble', () => {
    const text = '# Changelog\n\n## Unreleased\n\n## [1.0.0] — 2026-01-01\n';
    expect(assembleChangelog(text, new Map())).toBe(text);
  });

  it('creates a new section under an already-present Unreleased heading', () => {
    const text = '# Changelog\n\n## Unreleased\n\n## [1.0.0] — 2026-01-01\n\nold stuff\n';
    const grouped = groupFragments([{ file: 'a.md', section: 'Added', body: '- new thing' }]);
    const out = assembleChangelog(text, grouped);

    expect(out).toContain('## Unreleased\n\n### Added\n\n- new thing');
    expect(out).toContain('## [1.0.0] — 2026-01-01\n\nold stuff');
  });

  it('appends to an existing ### subsection already under Unreleased, after its current bullets', () => {
    const text = '# Changelog\n\n## Unreleased\n\n### Added\n\n- existing bullet\n\n## [1.0.0] — 2026-01-01\n';
    const grouped = groupFragments([{ file: 'a.md', section: 'Added', body: '- new bullet' }]);
    const out = assembleChangelog(text, grouped);

    const unreleasedBlock = out.slice(out.indexOf('## Unreleased'), out.indexOf('## [1.0.0]'));
    expect(unreleasedBlock).toContain('- existing bullet');
    expect(unreleasedBlock).toContain('- new bullet');
    expect(unreleasedBlock.indexOf('- existing bullet')).toBeLessThan(unreleasedBlock.indexOf('- new bullet'));
  });

  it('orders newly created sections canonically alongside pre-existing ones', () => {
    const text = '# Changelog\n\n## Unreleased\n\n### Packages\n\n- pkg bump\n\n## [1.0.0] — 2026-01-01\n';
    const grouped = groupFragments([{ file: 'a.md', section: 'Fixed', body: '- a fix' }]);
    const out = assembleChangelog(text, grouped);

    const unreleasedBlock = out.slice(out.indexOf('## Unreleased'), out.indexOf('## [1.0.0]'));
    expect(unreleasedBlock.indexOf('### Fixed')).toBeLessThan(unreleasedBlock.indexOf('### Packages'));
  });

  it('creates the Unreleased section when none exists yet', () => {
    const text = '# Changelog\n\n## [1.0.0] — 2026-01-01\n\nold stuff\n';
    const grouped = groupFragments([{ file: 'a.md', section: 'Added', body: '- new thing' }]);
    const out = assembleChangelog(text, grouped);

    expect(out.indexOf('## Unreleased')).toBeLessThan(out.indexOf('## [1.0.0]'));
    expect(out).toContain('### Added\n\n- new thing');
    expect(out).toContain('## [1.0.0] — 2026-01-01\n\nold stuff');
  });

  it('leaves already-released version sections byte-for-byte untouched', () => {
    const text =
      '# Changelog\n\n## Unreleased\n\n## [1.0.0] — 2026-01-01\n\n### Fixed\n\n- historic fix, keep exactly as written\n';
    const grouped = groupFragments([{ file: 'a.md', section: 'Added', body: '- new thing' }]);
    const out = assembleChangelog(text, grouped);

    expect(out).toContain('## [1.0.0] — 2026-01-01\n\n### Fixed\n\n- historic fix, keep exactly as written');
  });

  it('merges two independently-ordered fragments into the same new section deterministically by file order', () => {
    const text = '# Changelog\n\n## Unreleased\n\n## [1.0.0] — 2026-01-01\n';
    const grouped = groupFragments([
      { file: 'aaa.md', section: 'Added', body: '- from aaa' },
      { file: 'bbb.md', section: 'Added', body: '- from bbb' },
    ]);
    const out = assembleChangelog(text, grouped);
    const unreleasedBlock = out.slice(out.indexOf('## Unreleased'), out.indexOf('## [1.0.0]'));

    expect(unreleasedBlock.indexOf('- from aaa')).toBeLessThan(unreleasedBlock.indexOf('- from bbb'));
  });
});
