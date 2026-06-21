import { describe, it, expect } from 'vitest';
import {
  snapshotFilename,
  buildSnapshotContent,
  extractViewMeta,
  listSnapshotFiles,
  parseSnapshotForDisplay,
} from '../extension/src/snapshot-writer.js';

// Unit coverage for the snapshot-writer utilities (issue #303).
// These functions are pure (no vscode, no fs) so they are fully testable here.

describe('snapshotFilename', () => {
  it('produces YYYY-MM-DDTHHMMSSZ.yaml format', () => {
    const d = new Date('2026-06-20T14:30:05Z');
    expect(snapshotFilename(d)).toBe('2026-06-20T143005Z.yaml');
  });

  it('zero-pads single-digit months, days, hours, minutes, seconds', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    expect(snapshotFilename(d)).toBe('2026-01-02T030405Z.yaml');
  });

  it('two calls on different dates produce different filenames', () => {
    const a = snapshotFilename(new Date('2026-06-20T10:00:00Z'));
    const b = snapshotFilename(new Date('2026-06-20T10:00:01Z'));
    expect(a).not.toBe(b);
  });

  it('defaults to current time when no argument provided', () => {
    const before = Date.now();
    const fname = snapshotFilename();
    const after = Date.now();
    // The filename must end with Z.yaml and be parseable as a UTC date.
    expect(fname).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}Z\.yaml$/);
    // The year embedded must be the current UTC year.
    const year = new Date(before).getUTCFullYear();
    expect(fname.startsWith(String(year))).toBe(true);
    void after; // suppress unused warning
  });
});

describe('buildSnapshotContent', () => {
  const base = {
    viewId: 'my-view',
    generatedAt: '2026-06-20T14:30:00Z',
    methodologyVersion: '1.2.3',
    capturedAtDate: '2026-06-20',
  };

  it('emits all required §14.5 envelope fields', () => {
    const content = buildSnapshotContent(base);
    expect(content).toContain('view_id:');
    expect(content).toContain('generated_at:');
    expect(content).toContain('methodology_version:');
    expect(content).toContain('captured_at_date:');
  });

  it('embeds correct values', () => {
    const content = buildSnapshotContent(base);
    expect(content).toContain('my-view');
    expect(content).toContain('2026-06-20T14:30:00Z');
    expect(content).toContain('1.2.3');
    expect(content).toContain('2026-06-20');
  });

  it('produces valid YAML (round-trips)', () => {
    const content = buildSnapshotContent(base);
    // Must be parseable without throwing.
    const { load } = await import('js-yaml');
    const parsed = load(content) as Record<string, unknown>;
    expect(parsed['view_id']).toBe('my-view');
    expect(parsed['methodology_version']).toBe('1.2.3');
    expect(parsed['captured_at_date']).toBe('2026-06-20');
  });
});

describe('extractViewMeta', () => {
  it('extracts view.id nested under view key', () => {
    const yaml = `view:\n  id: my-notation-view\nmethodology_version: "2.0.0"\n`;
    const { viewId, methodologyVersion } = extractViewMeta(yaml);
    expect(viewId).toBe('my-notation-view');
    expect(methodologyVersion).toBe('2.0.0');
  });

  it('extracts flat view_id at root level', () => {
    const yaml = `view_id: flat-id\nmethodology_version: "1.0"\n`;
    const { viewId } = extractViewMeta(yaml);
    expect(viewId).toBe('flat-id');
  });

  it('returns fallbacks when fields are absent', () => {
    const { viewId, methodologyVersion } = extractViewMeta('goals: []\n');
    expect(viewId).toBe('unknown');
    expect(methodologyVersion).toBe('0.0.0');
  });

  it('returns fallbacks on malformed YAML', () => {
    const { viewId, methodologyVersion } = extractViewMeta(': : invalid ::');
    expect(viewId).toBe('unknown');
    expect(methodologyVersion).toBe('0.0.0');
  });
});

describe('listSnapshotFiles', () => {
  it('filters to .yaml files only', () => {
    const files = ['2026-06-20T143000Z.yaml', 'README.md', '2026-06-19T090000Z.yaml', '.DS_Store'];
    const result = listSnapshotFiles(files);
    expect(result).toEqual(['2026-06-19T090000Z.yaml', '2026-06-20T143000Z.yaml']);
  });

  it('sorts ascending (oldest first)', () => {
    const files = [
      '2026-06-21T000000Z.yaml',
      '2026-06-19T000000Z.yaml',
      '2026-06-20T000000Z.yaml',
    ];
    expect(listSnapshotFiles(files)).toEqual([
      '2026-06-19T000000Z.yaml',
      '2026-06-20T000000Z.yaml',
      '2026-06-21T000000Z.yaml',
    ]);
  });

  it('returns empty array when no yaml files', () => {
    expect(listSnapshotFiles(['foo.json', 'bar.md'])).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(listSnapshotFiles([])).toEqual([]);
  });
});

describe('parseSnapshotForDisplay', () => {
  it('reads back what buildSnapshotContent wrote', () => {
    const content = buildSnapshotContent({
      viewId: 'roundtrip-view',
      generatedAt: '2026-06-20T14:30:00Z',
      methodologyVersion: '1.0.0',
      capturedAtDate: '2026-06-20',
    });
    const { viewId, generatedAt, capturedAtDate } = parseSnapshotForDisplay(content);
    expect(viewId).toBe('roundtrip-view');
    expect(generatedAt).toBe('2026-06-20T14:30:00Z');
    expect(capturedAtDate).toBe('2026-06-20');
  });

  it('returns empty strings for absent fields', () => {
    const { viewId, generatedAt, capturedAtDate } = parseSnapshotForDisplay('unrelated: true\n');
    expect(viewId).toBe('');
    expect(generatedAt).toBe('');
    expect(capturedAtDate).toBeUndefined();
  });

  it('returns empty strings on malformed YAML', () => {
    const { viewId } = parseSnapshotForDisplay(': : invalid');
    expect(viewId).toBe('');
  });
});
