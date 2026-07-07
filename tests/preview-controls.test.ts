import { describe, it, expect } from 'vitest';
import {
  buildControlsPanel,
  buildControlsScript,
  genNonce,
  type ControlsModel,
} from '../extension/src/preview-controls.js';

// Unit coverage for the in-preview control panel (vkgeorgia/strategy#75/#76/#77
// PR2). The panel + wiring script are pure string builders (no `vscode`), so
// the data-attribute contract between markup and script is testable here.

const spacingDefaults = { horizontalGap: 100, verticalGap: 24 };

function baseModel(overrides: Partial<ControlsModel> = {}): ControlsModel {
  return {
    spacing: { horizontalGap: 100, verticalGap: 24, defaults: spacingDefaults },
    curvature: { value: 1, default: 1 },
    ...overrides,
  };
}

describe('buildControlsPanel', () => {
  it('renders spacing and curvature rows with data-tx-control attributes', () => {
    const html = buildControlsPanel(baseModel());
    expect(html).toContain('data-tx-control="spacing" data-tx-field="horizontalGap"');
    expect(html).toContain('data-tx-control="spacing" data-tx-field="verticalGap"');
    expect(html).toContain('data-tx-control="curvature"');
    // Bounds mirror the package.json settings schema.
    expect(html).toContain('min="20"');
    expect(html).toContain('max="300"');
  });

  it('reflects current values into the inputs', () => {
    const html = buildControlsPanel(baseModel({
      spacing: { horizontalGap: 180, verticalGap: 40, defaults: spacingDefaults },
      curvature: { value: 2.5, default: 1 },
      nodeSize: { value: 'wide', default: 'normal' },
    }));
    expect(html).toContain('data-tx-control="nodeSize"');
    expect(html).toContain('value="wide" selected');
    expect(html).toContain('data-tx-field="horizontalGap"');
    expect(html).toContain('value="2.5"');
  });

  it('spacing inputs are range sliders that fire live on drag', () => {
    const html = buildControlsPanel(baseModel());
    expect(html).toContain('type="range" data-tx-control="spacing" data-tx-field="horizontalGap"');
    expect(html).toContain('type="range" data-tx-control="spacing" data-tx-field="verticalGap"');
    expect(html).toContain('data-tx-event="input"');
    // Output elements show the current value alongside each slider.
    expect(html).toContain('<output id="tx-hgap-out">');
    expect(html).toContain('<output id="tx-vgap-out">');
  });

  it('curvature slider fires live on drag', () => {
    const html = buildControlsPanel(baseModel());
    expect(html).toContain('type="range" data-tx-control="curvature" data-tx-event="input"');
    expect(html).toContain('<output id="tx-curv-out">');
  });

  it('omits the scope row when no scope model is given (Activities)', () => {
    const html = buildControlsPanel(baseModel());
    expect(html).not.toContain('data-tx-control="scope"');
  });

  it('renders the scope dropdown, level input and reset when scope is present', () => {
    const html = buildControlsPanel(baseModel({
      scope: { rootId: '', maxLevel: -1, maxLevelPresent: 3, goals: [
        { id: '1', name: 'Grow revenue' },
        { id: '2', name: 'Cut cost' },
      ] },
    }));
    expect(html).toContain('data-tx-control="scope" data-tx-field="rootId"');
    expect(html).toContain('data-tx-control="scope" data-tx-field="maxLevel"');
    expect(html).toContain('data-tx-field="reset"');
    expect(html).toContain('<option value="">— All goals —</option>');
    expect(html).toContain('Grow revenue (1)');
    // Level input is bounded to the document's deepest level.
    expect(html).toContain('max="3"');
  });

  it('escapes goal names in dropdown options', () => {
    const html = buildControlsPanel(baseModel({
      scope: { rootId: '', maxLevel: -1, maxLevelPresent: 1, goals: [
        { id: 'x"1', name: '<b>A & B</b>' },
      ] },
    }));
    expect(html).toContain('&lt;b&gt;A &amp; B&lt;/b&gt;');
    expect(html).not.toContain('<b>A & B</b>');
    expect(html).toContain('value="x&quot;1"');
  });

  it('marks the selected root option', () => {
    const html = buildControlsPanel(baseModel({
      scope: { rootId: '2', maxLevel: -1, maxLevelPresent: 2, goals: [
        { id: '1', name: 'A' },
        { id: '2', name: 'B' },
      ] },
    }));
    expect(html).toMatch(/<option value="2" selected>/);
  });

  it('disables the level input when the document has no level info', () => {
    const html = buildControlsPanel(baseModel({
      scope: { rootId: '', maxLevel: -1, maxLevelPresent: 0, goals: [] },
    }));
    expect(html).toMatch(/data-tx-field="maxLevel"[^>]*disabled/);
  });

  it('opens by default only when a control is non-default', () => {
    expect(buildControlsPanel(baseModel())).toContain('<details id="tx-ctl" class="tx-ctl">');
    const nonDefault = buildControlsPanel(baseModel({ curvature: { value: 0, default: 1 } }));
    expect(nonDefault).toContain('<details id="tx-ctl" class="tx-ctl" open>');
    const scopedNonDefault = buildControlsPanel(baseModel({
      scope: { rootId: '5', maxLevel: -1, maxLevelPresent: 2, goals: [] },
    }));
    expect(scopedNonDefault).toContain(' open>');
  });
});

describe('buildControlsScript', () => {
  it('embeds the nonce and posts transitrix:control messages', () => {
    const script = buildControlsScript('NONCE123');
    expect(script).toContain('<script nonce="NONCE123">');
    expect(script).toContain("type: 'transitrix:control'");
    expect(script).toContain('acquireVsCodeApi');
    // Persists panel open/closed state across host-driven re-renders.
    expect(script).toContain('setState');
  });
});

describe('genNonce', () => {
  it('returns distinct base64 nonces', () => {
    const a = genNonce();
    const b = genNonce();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(20);
  });
});
