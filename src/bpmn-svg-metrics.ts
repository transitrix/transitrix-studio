/**
 * Read width / effective label size from a BPMN SVG string.
 * Used by the presentation-profile checks — not a renderer.
 */

export function svgCssWidth(svg: string): number {
  const open = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const wAttr = /\bwidth="([\d.]+)"/.exec(open);
  if (wAttr) return Number(wAttr[1]);
  const vb = /\bviewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+[\d.]+"/.exec(open);
  return vb ? Number(vb[1]) : NaN;
}

export function svgCssHeight(svg: string): number {
  const open = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const hAttr = /\bheight="([\d.]+)"/.exec(open);
  if (hAttr) return Number(hAttr[1]);
  const vb = /\bviewBox="[\d.-]+\s+[\d.-]+\s+[\d.]+\s+([\d.]+)"/.exec(open);
  return vb ? Number(vb[1]) : NaN;
}

/** Uniform scale implied by width vs viewBox (1 when they match or viewBox is absent). */
export function svgRootScale(svg: string): number {
  const open = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const wAttr = /\bwidth="([\d.]+)"/.exec(open);
  const vb = /\bviewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+[\d.]+"/.exec(open);
  if (!wAttr || !vb) return 1;
  const cssW = Number(wAttr[1]);
  const vbW = Number(vb[1]);
  if (!Number.isFinite(cssW) || !Number.isFinite(vbW) || vbW <= 0) return 1;
  return cssW / vbW;
}

/** Smallest BPMN label `font-size` (pool/lane/task/event/gateway/data), times root scale. */
export function minEffectiveLabelPx(svg: string): number {
  const labelClasses = [
    'bpmn-pool-label',
    'bpmn-lane-label',
    'bpmn-task-name',
    'bpmn-event-label',
    'bpmn-gateway-label',
    'bpmn-data-obj-label',
  ];
  const sizes: number[] = [];
  for (const cls of labelClasses) {
    const rule = svg.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`))?.[0] ?? '';
    const m = /font-size:\s*([0-9.]+)px/.exec(rule);
    if (m) sizes.push(Number(m[1]));
  }
  if (sizes.length === 0) return NaN;
  return Math.min(...sizes) * svgRootScale(svg);
}
