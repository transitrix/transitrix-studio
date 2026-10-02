import { describe, expect, it } from 'vitest';

import { GoalsBlockView } from '../goals-block-view.js';

const VALID = `notation: goals
spec_version: "0.1"
id: GOALS-SERVICE-1
name: Reliable service
goal_types:
  - { name: Strategy, level: 0 }
  - { name: Objective, level: 1 }
goals:
  - { id: GOAL-SERVICE-1, name: Deliver reliable service, type: Strategy, level: 0 }
  - { id: GOAL-RESPONSE-1, name: Reduce response time, type: Objective, level: 1, parent: GOAL-SERVICE-1 }
`;

const OTHER = `notation: goals
spec_version: "0.1"
id: GOALS-OTHER-1
name: Other tree
goal_types:
  - { name: Strategy, level: 0 }
goals:
  - { id: GOAL-OTHER-1, name: Distinct root, type: Strategy, level: 0 }
`;

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('GoalsBlockView', () => {
  it('mounts a valid diagram as an image, not as inline SVG markup', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = new GoalsBlockView(host);
    await view.update(VALID);
    const img = host.querySelector('img.transitrix-goals-block__image');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true);
    expect(host.querySelector('svg')).toBeNull();
    expect(host.innerHTML).not.toContain('<script');
    expect(decodeURIComponent(img!.getAttribute('src')!)).toContain('Deliver reliable service');
    view.destroy();
  });

  it('keeps two hosts independent', async () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const viewA = new GoalsBlockView(a);
    const viewB = new GoalsBlockView(b);
    await Promise.all([viewA.update(VALID), viewB.update(OTHER)]);
    expect(decodeURIComponent(a.querySelector('img')!.src)).toContain('Deliver reliable service');
    expect(decodeURIComponent(b.querySelector('img')!.src)).toContain('Distinct root');
    expect(decodeURIComponent(b.querySelector('img')!.src)).not.toContain('Deliver reliable service');
    viewA.destroy();
    viewB.destroy();
  });

  it('replaces a previous diagram when the block source changes', async () => {
    const host = document.createElement('div');
    const view = new GoalsBlockView(host);
    await view.update(VALID);
    await view.update(OTHER);
    const src = decodeURIComponent(host.querySelector('img')!.src);
    expect(src).toContain('Distinct root');
    expect(src).not.toContain('Deliver reliable service');
    view.destroy();
  });

  it('ignores a stale paint after a newer update starts', async () => {
    const host = document.createElement('div');
    const view = new GoalsBlockView(host);
    const first = view.update(VALID);
    const second = view.update(OTHER);
    await Promise.all([first, second]);
    await waitForPaint();
    const src = decodeURIComponent(host.querySelector('img')!.src);
    expect(src).toContain('Distinct root');
    expect(src).not.toContain('Deliver reliable service');
    view.destroy();
  });

  it('shows per-block errors without throwing', async () => {
    const host = document.createElement('div');
    const view = new GoalsBlockView(host);
    await view.update('this is not yaml: [');
    expect(host.querySelector('img')).toBeNull();
    const error = host.querySelector('.transitrix-goals-block__error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toMatch(/Could not render diagram/);
    expect(error?.textContent).toMatch(/YAML_PARSE/);
    view.destroy();
  });

  it('surfaces unexpected render failures without throwing', async () => {
    const host = document.createElement('div');
    const { SvgBlockView } = await import('../svg-block-view.js');
    const view = new SvgBlockView(host, {
      cssBlockClass: 'transitrix-goals-block',
      imageAlt: 'test',
      defaultDisplay: {},
      render: () => {
        throw new Error('boom');
      },
    });
    await view.update('anything');
    expect(host.querySelector('.transitrix-goals-block__error')?.textContent).toMatch(/RENDER/);
    expect(host.querySelector('.transitrix-goals-block__error')?.textContent).toMatch(/boom/);
    view.destroy();
  });

  it('ignores paints after destroy', async () => {
    const host = document.createElement('div');
    const view = new GoalsBlockView(host);
    const pending = view.update(VALID);
    view.destroy();
    await pending;
    expect(host.childNodes.length).toBe(0);
    expect(host.classList.contains('transitrix-goals-block')).toBe(false);
  });

  it('does not execute or insert hostile markup into the host document', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = new GoalsBlockView(host);
    await view.update(`notation: goals
spec_version: "0.1"
id: GOALS-XSS-1
name: Safe
goal_types:
  - { name: Strategy, level: 0 }
goals:
  - id: GOAL-XSS-1
    name: '<img src=x onerror=alert(1)><script>document.body.dataset.pwned="1"</script>'
    type: Strategy
    level: 0
`);
    expect(document.querySelectorAll('script').length).toBe(0);
    expect(document.body.dataset.pwned).toBeUndefined();
    expect(host.querySelector('img[src="x"]')).toBeNull();
    const src = decodeURIComponent(host.querySelector('img')!.getAttribute('src')!);
    expect(src).not.toContain('<script>document.body.dataset.pwned="1"</script>');
    expect(src).toContain('&lt;script&gt;');
    view.destroy();
  });

  it('shows an empty-state panel for zero-size SVG placeholders', async () => {
    const host = document.createElement('div');
    const { SvgBlockView } = await import('../svg-block-view.js');
    const view = new SvgBlockView(host, {
      cssBlockClass: 'transitrix-goals-block',
      imageAlt: 'test',
      defaultDisplay: {},
      render: () => ({
        ok: true,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>',
        warnings: [],
      }),
    });
    await view.update('anything');
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('.transitrix-goals-block__empty')?.textContent).toMatch(/Diagram is empty/);
    view.destroy();
  });

  it('clears the host on destroy', async () => {
    const host = document.createElement('div');
    const view = new GoalsBlockView(host);
    await view.update(VALID);
    view.destroy();
    expect(host.childNodes.length).toBe(0);
    expect(host.classList.contains('transitrix-goals-block')).toBe(false);
  });
});
