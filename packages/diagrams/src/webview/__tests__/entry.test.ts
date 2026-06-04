import { describe, expect, it } from 'vitest';

import { api, render } from '../entry.js';

const VALID_GOALS_DOC = `
notation: goals
id: GOALS-WEBVIEW-1
name: "Webview entry smoke test"
goal_types:
  - { name: "Strategy", level: 0 }
goals:
  - id: GOAL-MOON-1
    name: "Reach the moon"
    type: "Strategy"
    level: 0
`;

describe('webview/entry — Step 2 host API', () => {
  it('exposes a version + supportedKinds + render() trio', () => {
    expect(api.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(api.supportedKinds).toContain('goals');
    expect(typeof api.render).toBe('function');
  });

  it('parses + validates + renders SVG for a well-formed goals document', () => {
    const r = render('goals', VALID_GOALS_DOC);
    expect(r.notation).toBe('goals');
    expect(r.status).toBe('ok');
    expect(r.errors).toEqual([]);
    // Step 3 wires the goals renderer — SVG must now be non-empty and contain
    // the goal name from the YAML.
    expect(r.svg).toContain('<svg ');
    expect(r.svg).toContain('Reach the moon');
  });

  it('returns YAML-PARSE on malformed input — no exception escapes to the host', () => {
    const r = render('goals', 'goals:\n  - id: g1\n    name: [unterminated');
    expect(r.status).toBe('error');
    expect(r.errors[0].code).toBe('YAML-PARSE');
  });

  it('returns KIND-UNKNOWN for a non-Transitrix notation kind', () => {
    const r = render('plantuml', VALID_GOALS_DOC);
    expect(r.status).toBe('error');
    expect(r.errors[0].code).toBe('KIND-UNKNOWN');
  });

  it('returns NOTATION-NOT-WIRED for kinds that parse but have no Step 2 renderer', () => {
    // fgca is a supported kind but Step 4 wires its validator into the bundle.
    const r = render('fgca', 'changes: []\n');
    expect(r.status).toBe('error');
    expect(r.errors[0].code).toBe('NOTATION-NOT-WIRED');
  });

  it('surfaces goals validation errors structurally (e.g. missing notation header)', () => {
    const r = render('goals', 'goals: []\n');
    expect(r.status).toBe('error');
    // parseCanonicalGoals emits GOALS-* codes for canonical-shape violations.
    expect(r.errors.some((e) => e.code.startsWith('GOALS-'))).toBe(true);
  });
});
