// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { CapabilityMapView, computeDragOutcome } from '../CapabilityMapView.js';
import type { CapabilityMap } from '../dsm-schema.js';
import type { CapabilityMapChange } from '../CapabilityMapView.js';

// See goals/__tests__/GoalTreeView.test.tsx for why these three shims are
// needed — reactflow keeps a node `visibility: hidden` (and inert to
// drag/measurement logic) until ResizeObserver reports its size, and reads
// the computed transform back out via DOMMatrixReadOnly; jsdom has neither.
class MockResizeObserver {
  #callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }
  observe(target: Element) {
    queueMicrotask(() => {
      this.#callback([{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry], this as unknown as ResizeObserver);
    });
  }
  unobserve() {}
  disconnect() {}
}

class MockDOMMatrixReadOnly {
  m41 = 0;
  m42 = 0;
  constructor(transform?: string) {
    if (!transform || transform === 'none') return;
    const t = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform);
    if (t) {
      this.m41 = Number(t[1]);
      this.m42 = Number(t[2]);
    }
  }
}

function makeMap(): CapabilityMap {
  return {
    organisation: 'Acme Corp',
    set_id: 'v1.0',
    capabilities: [
      { id: 1, name: 'Customer Acquisition', address: '1.0.0', maturity: [{ date: '2026-04-01', level: 3 }] },
      { id: 2, name: 'Lead Qualification', address: '1.1.0' },
      { id: 3, name: 'Inbound Lead Scoring', address: '1.1.1' },
    ],
  };
}

beforeEach(() => {
  (global as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  (window as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = MockDOMMatrixReadOnly;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const isNode = this.classList?.contains('react-flow__node');
    const width = isNode ? 250 : 1000;
    const height = isNode ? 64 : 800;
    return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() { return this; } } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CapabilityMapView', () => {
  it('renders the virtual root and every on-diagram capability', async () => {
    render(<CapabilityMapView map={makeMap()} />);
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeTruthy();
      expect(screen.getByText('Customer Acquisition')).toBeTruthy();
      expect(screen.getByText('Lead Qualification')).toBeTruthy();
      expect(screen.getByText('Inbound Lead Scoring')).toBeTruthy();
    });
  });

  it('renders a maturity dot only for capabilities with a maturity snapshot', async () => {
    render(<CapabilityMapView map={makeMap()} />);
    await waitFor(() => expect(screen.getByText('Customer Acquisition')).toBeTruthy());
    expect(screen.getByLabelText('Maturity 3')).toBeTruthy();
    expect(screen.queryByLabelText(/Maturity/, { selector: '[aria-label="Maturity undefined"]' })).toBeNull();
  });

  it('shows backlog capabilities in the sidebar, not on canvas', async () => {
    const map: CapabilityMap = {
      organisation: 'Acme Corp',
      set_id: 'v1.0',
      capabilities: [
        { id: 1, name: 'Customer Acquisition', address: '1.0.0' },
        { id: 2, name: 'Parked idea', address: '0.0.0', backlog: true },
      ],
    };
    render(<CapabilityMapView map={map} showBacklog />);
    await waitFor(() => expect(screen.getByText('Customer Acquisition')).toBeTruthy());
    expect(screen.getByText('Backlog')).toBeTruthy();
    expect(screen.getByText('Parked idea')).toBeTruthy();
  });

  it('does not render add/delete affordances when readOnly', async () => {
    render(<CapabilityMapView map={makeMap()} readOnly />);
    await waitFor(() => expect(screen.getByText('Customer Acquisition')).toBeTruthy());
    expect(screen.queryByLabelText('Add child capability')).toBeNull();
    expect(screen.queryByLabelText('Delete capability')).toBeNull();
  });

  it('fires onChange with kind "addChild" when the add-child button is clicked', async () => {
    const onChange = vi.fn<(e: CapabilityMapChange) => void>();
    render(<CapabilityMapView map={makeMap()} onChange={onChange} />);
    await waitFor(() => expect(screen.getByText('Customer Acquisition')).toBeTruthy());
    const rootCard = document.querySelector('.react-flow__node[data-id="1"]')!;
    rootCard.querySelector<HTMLElement>('[aria-label="Add child capability"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const event = onChange.mock.calls[0][0];
    expect(event.kind).toBe('addChild');
    if (event.kind === 'addChild') {
      expect(event.newCap.address).toBe('1.2.0');
    }
  });

  it('fires onChange with kind "delete" when the delete button is clicked', async () => {
    const onChange = vi.fn<(e: CapabilityMapChange) => void>();
    render(<CapabilityMapView map={makeMap()} onChange={onChange} />);
    await waitFor(() => expect(screen.getByText('Inbound Lead Scoring')).toBeTruthy());
    const leafCard = document.querySelector('.react-flow__node[data-id="3"]')!;
    leafCard.querySelector<HTMLElement>('[aria-label="Delete capability"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0].kind).toBe('delete');
  });

  it('fires onEditRequest on double-click', async () => {
    const onEditRequest = vi.fn();
    render(<CapabilityMapView map={makeMap()} onEditRequest={onEditRequest} />);
    await waitFor(() => expect(screen.getByText('Customer Acquisition')).toBeTruthy());
    document.querySelector('.react-flow__node[data-id="1"]')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    await waitFor(() => expect(onEditRequest).toHaveBeenCalledTimes(1));
    expect(onEditRequest.mock.calls[0][0]).toMatchObject({ id: 1, name: 'Customer Acquisition' });
  });

  it('fires onChange with kind "normaliseAddresses" from the toolbar button', async () => {
    const onChange = vi.fn<(e: CapabilityMapChange) => void>();
    render(<CapabilityMapView map={makeMap()} onChange={onChange} />);
    await waitFor(() => expect(screen.getByText('Customer Acquisition')).toBeTruthy());
    screen.getByText('Normalise addresses').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0].kind).toBe('normaliseAddresses');
  });

  it('fires onChange with kind "restoreFromBacklog" when a backlog card is dropped onto a canvas card', async () => {
    const map: CapabilityMap = {
      organisation: 'Acme Corp',
      set_id: 'v1.0',
      capabilities: [
        { id: 1, name: 'Customer Acquisition', address: '1.0.0' },
        { id: 2, name: 'Parked idea', address: '0.0.0', backlog: true },
      ],
    };
    const onChange = vi.fn<(e: CapabilityMapChange) => void>();
    render(<CapabilityMapView map={map} onChange={onChange} showBacklog />);
    await waitFor(() => expect(screen.getByText('Parked idea')).toBeTruthy());

    const store = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => store.set(k, v), getData: (k: string) => store.get(k) ?? '', effectAllowed: 'move' };
    function fireDnd(el: Element, type: string, coords: { clientX: number; clientY: number }) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      Object.assign(event, coords);
      el.dispatchEvent(event);
    }

    const backlogItem = screen.getByText('Parked idea').closest('div[draggable]')!;
    const rootCard = document.querySelector('.react-flow__node[data-id="1"]')!;
    document.elementFromPoint = vi.fn().mockReturnValue(rootCard);

    fireDnd(backlogItem, 'dragstart', { clientX: 0, clientY: 0 });
    fireDnd(rootCard, 'drop', { clientX: 10, clientY: 10 });

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const event = onChange.mock.calls[0][0];
    expect(event.kind).toBe('restoreFromBacklog');
    if (event.kind === 'restoreFromBacklog') {
      expect(event.id).toBe(2);
      expect(event.parentId).toBe(1);
    }
  });
});

// Dragging a card is choreographed by reactflow's own pointer/DOM-measurement
// machinery — see the equivalent note in goals/__tests__/GoalTreeView.test.tsx.
// computeDragOutcome() is the pure decision this component's onNodeDragStop
// calls once reactflow reports a drag, tested directly here.
describe('computeDragOutcome (reparent / moveBranchToBacklog decision logic)', () => {
  const map = makeMap();

  it('fires a "reparent" change when dropped onto another card', () => {
    const change = computeDragOutcome(map, 3, { kind: 'node', id: 1 });
    expect(change?.kind).toBe('reparent');
    if (change?.kind === 'reparent') {
      expect(change.sourceId).toBe(3);
      expect(change.targetId).toBe(1);
    }
  });

  it('fires a "reparent" change (promotion to L1) when dropped on the root', () => {
    const change = computeDragOutcome(map, 2, { kind: 'root' });
    expect(change?.kind).toBe('reparent');
    if (change?.kind === 'reparent') {
      expect(change.targetId).toBe(0);
      expect(change.result.capabilities.find((c) => c.id === 2)?.address).toBe('2.0.0');
    }
  });

  it('fires a "moveBranchToBacklog" change when dropped on the backlog zone', () => {
    const change = computeDragOutcome(map, 2, { kind: 'backlog' });
    expect(change?.kind).toBe('moveBranchToBacklog');
  });

  it('is a no-op when dropped nowhere in particular', () => {
    expect(computeDragOutcome(map, 2, null)).toBeNull();
  });

  it('is a no-op when dropped on itself', () => {
    expect(computeDragOutcome(map, 2, { kind: 'node', id: 2 })).toBeNull();
  });
});
