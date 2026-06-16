import { describe, it, expect } from 'vitest';
import { buildDiagramFrame } from '../extension/src/diagram-frame.js';

// The shared preview shell. `buildDiagramFrame` is a pure string builder (no
// `vscode`), so the error-strip markup/CSS contract is testable here.

const base = { filename: 'demo.goals.transitrix.yaml', notation: 'Goal tree' };

describe('buildDiagramFrame error strip', () => {
  it('renders a collapsible error strip driven by the CSS-only checkbox+label', () => {
    const html = buildDiagramFrame({
      ...base,
      svgContent: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      errorMsg: 'GL-001: broke\nGL-002: also broke',
    });
    // Hidden checkbox + label summary + body — the same script-free mechanism
    // the Title/Zoom toggles use, so it collapses in enableScripts:false
    // previews (a native <details> did not).
    expect(html).toContain('<input type="checkbox" id="ts-err-toggle" class="tx-err-toggle-cb">');
    expect(html).toContain('<label for="ts-err-toggle" class="tx-err-summary">');
    expect(html).toContain('class="tx-err-body"');
    // The `:checked ~` sibling rule that actually folds the body away.
    expect(html).toContain('.tx-err-toggle-cb:checked ~ .tx-err .tx-err-body{display:none;}');
    // The old native-<details> strip (which didn't collapse in static previews) is gone.
    expect(html).not.toContain('<details class="tx-err"');
    expect(html).toContain('2 errors');
  });

  it('counts a single error as "1 error"', () => {
    const html = buildDiagramFrame({ ...base, errorMsg: 'GL-001: just one' });
    expect(html).toContain('1 error<');
  });

  it('emits no error control when there is no error', () => {
    const html = buildDiagramFrame({ ...base, svgContent: '<svg/>' });
    // The CSS lives in the <style> block unconditionally; assert no error
    // *markup* (the checkbox control + the strip div) is emitted.
    expect(html).not.toContain('ts-err-toggle');
    expect(html).not.toContain('<div class="tx-err">');
  });
});
