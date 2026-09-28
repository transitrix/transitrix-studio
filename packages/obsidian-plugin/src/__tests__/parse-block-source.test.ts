import { describe, expect, it } from 'vitest';

import {
  MAX_BLOCK_BYTES,
  parseSelfContainedBlockSource,
} from '../parse-block-source.js';

describe('parseSelfContainedBlockSource', () => {
  it('parses a simple YAML mapping', () => {
    const result = parseSelfContainedBlockSource('notation: goals\nid: GOALS-1\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc).toMatchObject({ notation: 'goals', id: 'GOALS-1' });
  });

  it('rejects projection documents', () => {
    const result = parseSelfContainedBlockSource('notation: goals\nview_config: {}\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('BLOCK-002');
  });

  it('reports YAML syntax errors', () => {
    const result = parseSelfContainedBlockSource('notation: [unterminated');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('YAML_PARSE');
  });

  it('rejects oversize sources', () => {
    const result = parseSelfContainedBlockSource(`${'x'.repeat(MAX_BLOCK_BYTES)}\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('BLOCK-001');
  });
});
