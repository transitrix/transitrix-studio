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

// #420 — Title header: BPMN (and other diagram types) pass a `title` option so
// the frame renders a .frame-header block matching the standard visual treatment.
describe('buildDiagramFrame title header', () => {
  it('renders frame-header when title is provided', () => {
    const html = buildDiagramFrame({
      ...base,
      svgContent: '<svg/>',
      title: 'Order Fulfilment Process',
    });
    expect(html).toContain('class="frame-header"');
    expect(html).toContain('class="frame-title"');
    expect(html).toContain('Order Fulfilment Process');
  });

  it('emits no frame-header when title is omitted', () => {
    const html = buildDiagramFrame({ ...base, svgContent: '<svg/>' });
    expect(html).not.toContain('class="frame-header"');
    expect(html).not.toContain('class="frame-title"');
  });

  it('escapes special characters in the title', () => {
    const html = buildDiagramFrame({
      ...base,
      svgContent: '<svg/>',
      title: '<Process> & "Test"',
    });
    expect(html).toContain('&lt;Process&gt; &amp; &quot;Test&quot;');
    expect(html).not.toContain('<Process>');
  });

  it('renders subtitle when provided alongside title', () => {
    const html = buildDiagramFrame({
      ...base,
      svgContent: '<svg/>',
      title: 'Main title',
      subtitle: 'Sub description',
    });
    expect(html).toContain('class="frame-subtitle"');
    expect(html).toContain('Sub description');
  });
});

describe('buildDiagramFrame warnings strip', () => {
  it('renders warnings in a collapsible strip, collapsed by default', () => {
    const html = buildDiagramFrame({
      ...base,
      svgContent: '<svg/>',
      warnings: ['ACT-011: no duration', 'ACT-019: Gantt will not render'],
    });
    // Same checkbox+label mechanism as the error strip — but `checked` so the
    // strip starts collapsed (advisories shouldn't crowd the canvas).
    expect(html).toContain('<input type="checkbox" id="ts-warn-toggle" class="tx-warn-toggle-cb" checked>');
    expect(html).toContain('<label for="ts-warn-toggle" class="tx-warn-summary">');
    expect(html).toContain('.tx-warn-toggle-cb:checked ~ .tx-warn .tx-warn-body{display:none;}');
    // Each warning is an item inside the collapsible body, count in the summary.
    expect(html).toContain('2 warnings');
    expect(html).toContain('<div class="tx-warn-item">ACT-011: no duration</div>');
    // The old flat, un-collapsible inline-styled divs are gone.
    expect(html).not.toContain('style="color:#c07030');
  });

  it('counts a single warning as "1 warning"', () => {
    const html = buildDiagramFrame({ ...base, svgContent: '<svg/>', warnings: ['only one'] });
    expect(html).toContain('1 warning<');
  });

  it('emits no warnings control when there are no warnings', () => {
    const html = buildDiagramFrame({ ...base, svgContent: '<svg/>' });
    expect(html).not.toContain('ts-warn-toggle');
    expect(html).not.toContain('<div class="tx-warn">');
  });

  it('escapes warning text', () => {
    const html = buildDiagramFrame({ ...base, svgContent: '<svg/>', warnings: ['<script>x</script>'] });
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
});

// vkgeorgia/strategy#597 — the PlantUML preview needs to load its wasm
// rendering engine as external <script> files inside the frame's strict
// nonce CSP, rather than re-implementing a bespoke toolbar/CSP.
describe('buildDiagramFrame interactive.extraScripts / allowWasmRendering', () => {
  const interactiveBase = { nonce: 'test-nonce', controlsPanel: '', controlsScript: '' };

  it('renders extra script tags nonce\'d, in order, module flag respected', () => {
    const html = buildDiagramFrame({
      ...base,
      bodyContent: '<div id="puml-output"></div>',
      interactive: {
        ...interactiveBase,
        extraScripts: [
          { src: 'https://example.invalid/viz-global.js' },
          { src: 'https://example.invalid/plantuml-client.js', module: true },
        ],
      },
    });
    expect(html).toContain('<script nonce="test-nonce" src="https://example.invalid/viz-global.js"></script>');
    expect(html).toContain('<script nonce="test-nonce" type="module" src="https://example.invalid/plantuml-client.js"></script>');
    const vizIdx = html.indexOf('viz-global.js');
    const clientIdx = html.indexOf('plantuml-client.js');
    expect(vizIdx).toBeGreaterThan(-1);
    expect(clientIdx).toBeGreaterThan(vizIdx);
  });

  it('emits no extra script tags when extraScripts is omitted', () => {
    const html = buildDiagramFrame({ ...base, interactive: { ...interactiveBase } });
    expect(html).not.toContain('<script nonce="test-nonce" src=');
  });

  it('widens the CSP for wasm-unsafe-eval and img-src when allowWasmRendering is true', () => {
    const html = buildDiagramFrame({ ...base, interactive: { ...interactiveBase, allowWasmRendering: true } });
    expect(html).toContain(`script-src 'nonce-test-nonce' 'wasm-unsafe-eval';`);
    expect(html).toContain('img-src data: blob:;');
  });

  it('keeps the strict CSP unchanged when allowWasmRendering is omitted', () => {
    const html = buildDiagramFrame({ ...base, interactive: { ...interactiveBase } });
    expect(html).toContain(`script-src 'nonce-test-nonce';`);
    expect(html).not.toContain('wasm-unsafe-eval');
    expect(html).not.toContain('img-src data: blob:');
  });
});
