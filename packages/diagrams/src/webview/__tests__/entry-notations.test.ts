/**
 * Step 4 parity check: every supported notation must render through the
 * webview bundle's `render(kind, source)` API from the same example fixtures
 * the VS Code previews consume — a valid document yields `status: 'ok'` with
 * non-empty markup, and a malformed document degrades to the error panel
 * (structured errors, no thrown exception reaching the JVM host).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { api, render, type NotationKind } from '../entry.js';

const EXAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../tests/fixtures/notation-corpus');

interface Fixture {
  kind: NotationKind;
  file: string;
  /** The markup wrapper the renderer emits: an <svg> diagram or an HTML <section>. */
  markup: 'svg' | 'section';
}

// Mirrors the fixtures used by the VS Code previews. One representative
// example per notation is enough to prove the dispatch + renderer wiring.
const FIXTURES: Fixture[] = [
  { kind: 'goals', file: 'goals/strategy-2026.goals.transitrix.yaml', markup: 'svg' },
  { kind: 'dgca', file: 'dgca/strategy-2026.dgca.transitrix.yaml', markup: 'svg' },
  { kind: 'dga', file: 'dga/strategy-2026.dga.transitrix.yaml', markup: 'svg' },
  { kind: 'action', file: 'action/platform-launch.action.transitrix.yaml', markup: 'svg' },
  { kind: 'action-card', file: 'action-card/eu-programme.action-card.transitrix.yaml', markup: 'svg' },
  { kind: 'process-blueprint', file: 'process-blueprint/order-fulfilment.process-blueprint.transitrix.yaml', markup: 'svg' },
  { kind: 'blocks', file: 'blocks/architecture.blocks.transitrix.yaml', markup: 'svg' },
  { kind: 'applications', file: 'applications/portfolio-2026.applications.transitrix.yaml', markup: 'section' },
  { kind: 'products', file: 'products/portfolio-2026.products.transitrix.yaml', markup: 'section' },
  { kind: 'process-map', file: 'process-map/enterprise.process-map.transitrix.yaml', markup: 'section' },
  { kind: 'scenarios', file: 'scenarios/omnichannel-2028.scenarios.transitrix.yaml', markup: 'section' },
  { kind: 'capability-map', file: 'capability-map/business.capability-map.transitrix.yaml', markup: 'section' },
];

describe('webview/entry — Step 4 notation coverage', () => {
  it('wires every supported kind (no kind left on NOTATION-NOT-WIRED)', () => {
    // The fixture table must cover the full supported-kinds surface, so a new
    // kind added to the bundle without a renderer fails this test loudly.
    const covered = new Set(FIXTURES.map((f) => f.kind));
    for (const kind of api.supportedKinds) {
      expect(covered.has(kind)).toBe(true);
    }
  });

  for (const fx of FIXTURES) {
    it(`renders ${fx.kind} from its example fixture`, () => {
      const source = readFileSync(path.join(EXAMPLES, fx.file), 'utf8');
      const r = render(fx.kind, source);
      expect(r.notation).toBe(fx.kind);
      expect(r.errors).toEqual([]);
      expect(r.status).toBe('ok');
      expect(r.svg.length).toBeGreaterThan(0);
      expect(r.svg).toContain(fx.markup === 'svg' ? '<svg ' : '<section');
    });
  }

  it('degrades malformed input to the error panel for a diagram notation', () => {
    const r = render('process-blueprint', 'process_blueprint:\n  stages: "not a list"\n');
    expect(r.status).toBe('error');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.svg).toBe('');
  });

  it('degrades malformed input to the error panel for a catalogue notation', () => {
    const r = render('applications', 'applications_catalogue:\n  applications: "not a list"\n');
    expect(r.status).toBe('error');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.svg).toBe('');
  });
});
