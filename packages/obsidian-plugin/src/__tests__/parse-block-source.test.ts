import { describe, expect, it } from 'vitest';

import {
  MAX_BLOCK_BYTES,
  MAX_YAML_DEPTH,
  parseSelfContainedBlockSource,
} from '../parse-block-source.js';

/** Build a compact nested-alias YAML diamond that shared refs amplify without a visited set. */
function nestedAliasYaml(levels: number): string {
  const lines = ['a0: &a0', '  d: 2026-06-01'];
  for (let i = 1; i <= levels; i++) {
    lines.push(`a${i}: &a${i}`);
    lines.push(`  x: *a${i - 1}`);
    lines.push(`  y: *a${i - 1}`);
  }
  lines.push('notation: goals');
  lines.push(`root: *a${levels}`);
  return `${lines.join('\n')}\n`;
}

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

  it('normalizes nested YAML aliases without hanging the Reading-view path', () => {
    const levels = 10;
    const source = nestedAliasYaml(levels);
    expect(source.length).toBeLessThan(800);
    const started = Date.now();
    const result = parseSelfContainedBlockSource(source);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    let cur: unknown = (result.doc as { root: unknown }).root;
    for (let i = 0; i < levels; i++) {
      cur = (cur as { x: unknown }).x;
    }
    expect((cur as { d: unknown }).d).toBe('2026-06-01');
  });

  it('rejects YAML that exceeds the nesting depth budget', () => {
    let source = 'leaf: ok\n';
    for (let i = 0; i < MAX_YAML_DEPTH + 5; i++) {
      source = `n${i}:\n  nest:\n${source.split('\n').map((l) => (l ? `    ${l}` : l)).join('\n')}`;
    }
    const result = parseSelfContainedBlockSource(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe('YAML_PARSE');
    expect(result.errors[0]?.message).toMatch(/maxDepth/i);
  });
});
