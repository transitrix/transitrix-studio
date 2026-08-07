// Pure logic for the changelog-fragment mechanism.
//
// A PR contributes its changelog entry as its own fragment file under
// changelog/fragments/ instead of editing CHANGELOG.md's Unreleased section
// directly, so two unrelated PRs never collide on the same lines.
// assembleChangelog() is the release-time step that folds fragments back
// into CHANGELOG.md, producing what a hand-edit would have produced.

export const SECTION_ORDER = ['Added', 'Changed', 'Fixed', 'Removed', 'Deprecated', 'Security', 'Packages'];

const SECTION_HEADER_RE = /^###\s+(.+?)\s*$/;
const UNRELEASED_HEADER_RE = /^##\s+Unreleased\s*$/;
const RELEASE_HEADER_RE = /^##\s+/;
const TITLE_RE = /^#\s+/;

// A fragment file is "### <Section>" followed by one or more bullet lines —
// exactly the block a contributor would otherwise have hand-inserted.
export function parseFragment(filename, content) {
  const lines = content.split('\n');
  const headerIdx = lines.findIndex((line) => SECTION_HEADER_RE.test(line));
  if (headerIdx === -1) {
    throw new Error(`${filename}: no "### <Section>" header found`);
  }
  const section = lines[headerIdx].match(SECTION_HEADER_RE)[1];
  const body = lines
    .slice(headerIdx + 1)
    .join('\n')
    .trim();
  if (!body) {
    throw new Error(`${filename}: no bullet content under "### ${section}"`);
  }
  return { section, body };
}

// fragments: [{ file, section, body }] — pass already sorted by `file` for a
// deterministic, reviewable assembly order.
export function groupFragments(fragments) {
  const bySection = new Map();
  for (const { section, body } of fragments) {
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(body);
  }
  const ordered = new Map();
  for (const section of SECTION_ORDER) {
    if (bySection.has(section)) ordered.set(section, bySection.get(section));
  }
  for (const [section, bodies] of bySection) {
    if (!ordered.has(section)) ordered.set(section, bodies);
  }
  return ordered;
}

function trimTrailingBlank(lines) {
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
}

function trimLeadingBlank(lines) {
  while (lines.length && lines[0].trim() === '') lines.shift();
}

// Folds `grouped` (section -> bodies, from groupFragments) into the
// "## Unreleased" block of `changelogText`. Everything outside that block —
// every already-released version section — is left byte-for-byte alone.
export function assembleChangelog(changelogText, grouped) {
  if (grouped.size === 0) return changelogText;

  let lines = changelogText.split('\n');
  let unreleasedIdx = lines.findIndex((line) => UNRELEASED_HEADER_RE.test(line));

  if (unreleasedIdx === -1) {
    const titleIdx = lines.findIndex((line) => TITLE_RE.test(line));
    const insertAt = titleIdx === -1 ? 0 : titleIdx + 1;
    lines = [...lines.slice(0, insertAt), '', '## Unreleased', ...lines.slice(insertAt)];
    unreleasedIdx = lines.findIndex((line) => UNRELEASED_HEADER_RE.test(line));
  }

  const blockStart = unreleasedIdx + 1;
  let blockEnd = lines.length;
  for (let i = blockStart; i < lines.length; i++) {
    if (RELEASE_HEADER_RE.test(lines[i])) {
      blockEnd = i;
      break;
    }
  }

  const existing = new Map();
  const order = [];
  let cur = null;
  for (const line of lines.slice(blockStart, blockEnd)) {
    const match = line.match(SECTION_HEADER_RE);
    if (match) {
      cur = match[1];
      if (!existing.has(cur)) {
        existing.set(cur, []);
        order.push(cur);
      }
      continue;
    }
    if (cur !== null) existing.get(cur).push(line);
  }
  for (const sectionLines of existing.values()) {
    trimLeadingBlank(sectionLines);
    trimTrailingBlank(sectionLines);
  }

  for (const [section, bodies] of grouped) {
    if (!existing.has(section)) {
      existing.set(section, []);
      order.push(section);
    }
    const sectionLines = existing.get(section);
    trimTrailingBlank(sectionLines);
    for (const body of bodies) {
      // Bullets within a section sit on adjacent lines, no blank separator —
      // matches the existing hand-edited CHANGELOG.md convention.
      sectionLines.push(...body.split('\n'));
    }
  }

  const canonicalOrder = [
    ...SECTION_ORDER.filter((section) => order.includes(section)),
    ...order.filter((section) => !SECTION_ORDER.includes(section)),
  ];

  const rebuilt = [];
  for (const section of canonicalOrder) {
    const sectionLines = existing.get(section);
    trimTrailingBlank(sectionLines);
    rebuilt.push(`### ${section}`, '', ...sectionLines, '');
  }
  trimTrailingBlank(rebuilt);

  const newLines = [...lines.slice(0, blockStart), '', ...rebuilt, '', ...lines.slice(blockEnd)];
  return newLines.join('\n');
}
