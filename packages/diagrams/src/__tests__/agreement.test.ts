import { describe, it, expect } from 'vitest';
import { checkAgreement, looksLikeTool, AGREEMENT_VALUES } from '../agreement.js';

const codes = (record: Record<string, unknown>): string[] =>
  checkAgreement(record).map((e) => e.code);

describe('looksLikeTool', () => {
  it('flags npm-scoped and *-cli/*-reviewer/*-bot/*-scanner ids as tools', () => {
    expect(looksLikeTool('@transitrix/ingest-cli')).toBe(true);
    expect(looksLikeTool('decisions-cli')).toBe(true);
    expect(looksLikeTool('regulatory-reviewer')).toBe(true);
    expect(looksLikeTool('regulatory-reviewer-eu')).toBe(true);
    expect(looksLikeTool('compliance-bot')).toBe(true);
    expect(looksLikeTool('codex-scanner')).toBe(true);
  });

  it('does not flag a human handle', () => {
    expect(looksLikeTool('v.korobeinikov')).toBe(false);
    expect(looksLikeTool('Valerii Korobeinikov')).toBe(false);
  });

  it('does not flag an absent/undefined id', () => {
    expect(looksLikeTool(undefined)).toBe(false);
  });
});

describe('checkAgreement', () => {
  it('is clean when agreement is absent (back-compat — absent ⇒ agreed)', () => {
    expect(codes({})).toEqual([]);
  });

  it('accepts each permitted value with agreed_by present', () => {
    for (const agreement of AGREEMENT_VALUES) {
      expect(codes({ agreement, agreed_by: 'v.korobeinikov' })).toEqual([]);
    }
  });

  it('AGREE-001 — agreement present but out of the closed vocabulary', () => {
    expect(codes({ agreement: 'approved', agreed_by: 'v.korobeinikov' })).toEqual(['AGREE-001']);
  });

  it('AGREE-003 — agreement present but agreed_by missing or blank', () => {
    expect(codes({ agreement: 'draft' })).toEqual(['AGREE-003']);
    expect(codes({ agreement: 'agreed', agreed_by: '   ' })).toEqual(['AGREE-003']);
  });

  it('AGREE-002 — agreement: agreed written by something that looks like a tool', () => {
    expect(codes({ agreement: 'agreed', agreed_by: '@transitrix/ingest-cli' })).toEqual(['AGREE-002']);
    expect(codes({ agreement: 'agreed', agreed_by: 'decisions-cli' })).toEqual(['AGREE-002']);
  });

  it('agreed written by a human handle is clean', () => {
    expect(codes({ agreement: 'agreed', agreed_by: 'v.korobeinikov' })).toEqual([]);
  });

  it('draft/disputed written by a tool-looking id is clean — only "agreed" is human-only', () => {
    expect(codes({ agreement: 'draft', agreed_by: 'decisions-cli' })).toEqual([]);
    expect(codes({ agreement: 'disputed', agreed_by: 'decisions-cli' })).toEqual([]);
  });

  it('reports AGREE-003 only, not also AGREE-002, when both would describe the record', () => {
    expect(codes({ agreement: 'agreed' })).toEqual(['AGREE-003']);
  });
});
