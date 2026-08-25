import { describe, it, expect } from 'vitest';
import {
  collectInEffectProcessParentEdges,
  relationInEffectAt,
} from '../check-process-parent.js';
import type { RepoDoc, RepoModelInput } from '../types.js';

function el(path: string, data: Record<string, unknown>): RepoDoc {
  return { path, data };
}

describe('relationInEffectAt', () => {
  it('treats a null valid_to as still in effect', () => {
    expect(relationInEffectAt({ valid_from: '2026-01-01', valid_to: null }, '2026-08-25')).toBe(true);
  });

  it('is inclusive at both ends', () => {
    expect(relationInEffectAt({ valid_from: '2026-01-01', valid_to: '2026-08-25' }, '2026-08-25')).toBe(true);
    expect(relationInEffectAt({ valid_from: '2026-08-25', valid_to: null }, '2026-08-25')).toBe(true);
  });

  it('excludes a window that has not started or has ended', () => {
    expect(relationInEffectAt({ valid_from: '2026-09-01', valid_to: null }, '2026-08-25')).toBe(false);
    expect(relationInEffectAt({ valid_from: '2026-01-01', valid_to: '2026-06-30' }, '2026-08-25')).toBe(false);
  });
});

describe('collectInEffectProcessParentEdges', () => {
  it('keeps an in-effect process_parent and drops an expired one', () => {
    const input: RepoModelInput = {
      elements: [],
      relations: [
        el('canon/relations/REL-LIVE.yaml', {
          type: 'process_parent',
          from: 'PROCESS-A-1',
          to: 'PROCESS-P-1',
          valid_from: '2026-01-01',
          valid_to: null,
        }),
        el('canon/relations/REL-DEAD.yaml', {
          type: 'process_parent',
          from: 'PROCESS-B-1',
          to: 'PROCESS-P-1',
          valid_from: '2025-01-01',
          valid_to: '2026-06-30',
        }),
      ],
    };
    expect(collectInEffectProcessParentEdges(input, '2026-08-25')).toEqual([
      { from: 'PROCESS-A-1', to: 'PROCESS-P-1' },
    ]);
  });
});
