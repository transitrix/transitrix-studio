// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { GoalTreeView, computeDragOutcome } from '../GoalTreeView.js';
import type { GoalTree } from '../types.js';
import type { GoalTreeChange } from '../GoalTreeView.js';

// jsdom has no ResizeObserver / layout engine. reactflow keeps a node's DOM
// wrapper `visibility: hidden` and excludes it from drag/intersection logic
// until it has been "measured" via ResizeObserver — so the mock must
// actually invoke its callback (with the mocked getBoundingClientRect below)
// for nodes to become interactive, not just satisfy the constructor call.
class MockResizeObserver {
  #callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }
  observe(target: Element) {
    queueMicrotask(() => {
      const rect = target.getBoundingClientRect();
      this.#callback(
        [{ target, contentRect: rect } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    });
  }
  unobserve() {}
  disconnect() {}
}

// jsdom also has no DOMMatrixReadOnly, which reactflow's dimension-tracking
// uses to read the translateX/Y out of a node's computed transform. Only
// translate() (no scale/rotate) ever appears in this component's own CSS, so
// a minimal shim covering that one case is enough.
class MockDOMMatrixReadOnly {
  m41 = 0;
  m42 = 0;
  constructor(transform?: string) {
    if (!transform || transform === 'none') return;
    const t = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform);
    if (t) {
      this.m41 = Number(t[1]);
      this.m42 = Number(t[2]);
      return;
    }
    const m = /matrix\(([^)]+)\)/.exec(transform);
    if (m) {
      const parts = m[1].split(',').map((p) => Number(p.trim()));
      this.m41 = parts[4] ?? 0;
      this.m42 = parts[5] ?? 0;
    }
  }
}

function makeTree(): GoalTree {
  return {
    goal_types: [
      { name: 'Strategy', level: 0 },
      { name: 'Business Goal', level: 1 },
    ],
    goals: [
      { id: 1, name: 'Triple revenue', type: 'Strategy', level: 0, parent_id: 0 },
      { id: 2, name: 'Launch in EU', type: 'Business Goal', level: 1, parent_id: 1 },
      {
        id: 3,
        name: 'Cut churn',
        type: 'Business Goal',
        level: 1,
        parent_id: 1,
        factors: [
          { id: 10, name: 'Support backlog', impact_type: 'risk' },
          { id: 11, name: 'New pricing', impact_type: 'opportunity' },
        ],
      },
    ],
  };
}

beforeEach(() => {
  (global as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  (window as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = MockDOMMatrixReadOnly;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    // Individual goal cards report their real 250x80 footprint (matters for
    // reactflow's own drag/measurement bookkeeping); the flow container and
    // everything else gets a generously large rect so viewport fitting has
    // room to work with.
    const isNode = this.classList?.contains('react-flow__node');
    const width = isNode ? 250 : 1000;
    const height = isNode ? 80 : 800;
    return {
      width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0,
      toJSON() { return this; },
    } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GoalTreeView', () => {
  it('renders without crashing and shows every canvas goal', async () => {
    render(<GoalTreeView tree={makeTree()} />);
    await waitFor(() => {
      expect(screen.getByText('Triple revenue')).toBeTruthy();
      expect(screen.getByText('Launch in EU')).toBeTruthy();
      expect(screen.getByText('Cut churn')).toBeTruthy();
    });
  });

  it('renders factor indicators from goal.factors', async () => {
    render(<GoalTreeView tree={makeTree()} />);
    await waitFor(() => {
      expect(screen.getByText('Triple revenue')).toBeTruthy();
    });
    // One up-caret (opportunity) and one down-caret (risk) on "Cut churn".
    expect(screen.getByLabelText('1 positive factor')).toBeTruthy();
    expect(screen.getByLabelText('1 negative factor')).toBeTruthy();
  });

  it('puts a goal with a broken parent_id in the backlog, not on canvas', async () => {
    const tree: GoalTree = {
      goal_types: [
        { name: 'Strategy', level: 0 },
        { name: 'Business Goal', level: 1 },
      ],
      goals: [
        { id: 1, name: 'Root goal', type: 'Strategy', level: 0, parent_id: 0 },
        // level 1 + a parent_id that resolves to nothing — not a root by
        // either "Roots: level === 0 || parent_id === 0" clause, and
        // unreachable from goal 1 — must land in the backlog.
        { id: 2, name: 'Orphaned goal', type: 'Business Goal', level: 1, parent_id: 999 },
      ],
    };
    render(<GoalTreeView tree={tree} showBacklog />);
    await waitFor(() => {
      expect(screen.getByText('Root goal')).toBeTruthy();
    });
    expect(screen.getByText('Orphaned goal')).toBeTruthy();
    expect(screen.queryByText('Backlog')).toBeTruthy();
  });

  it('does not render add/delete affordances when readOnly', async () => {
    render(<GoalTreeView tree={makeTree()} readOnly />);
    await waitFor(() => {
      expect(screen.getByText('Triple revenue')).toBeTruthy();
    });
    expect(screen.queryByLabelText('Add child goal')).toBeNull();
    expect(screen.queryByLabelText('Delete goal')).toBeNull();
  });

  it('fires onChange with kind "addChild" when the add-child button is clicked', async () => {
    const onChange = vi.fn<(e: GoalTreeChange) => void>();
    render(<GoalTreeView tree={makeTree()} onChange={onChange} />);
    await waitFor(() => {
      expect(screen.getByText('Triple revenue')).toBeTruthy();
    });
    // Target the root (id 1, level 0) specifically — makeTree()'s goal_types
    // only go up to level 1, so clicking "add child" on an existing level-1
    // goal would be correctly refused (would exceed max level) and never
    // fire onChange at all.
    const rootNode = document.querySelector('.react-flow__node[data-id="1"]');
    const addButton = rootNode!.querySelector('[aria-label="Add child goal"]')!;
    addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const event = onChange.mock.calls[0][0];
    expect(event.kind).toBe('addChild');
    if (event.kind === 'addChild') {
      expect(event.result.goals.length).toBe(4);
    }
  });

  it('fires onChange with kind "delete" when the delete button is clicked', async () => {
    const onChange = vi.fn<(e: GoalTreeChange) => void>();
    render(<GoalTreeView tree={makeTree()} onChange={onChange} />);
    await waitFor(() => {
      expect(screen.getByText('Cut churn')).toBeTruthy();
    });
    const deleteButtons = screen.getAllByLabelText('Delete goal');
    deleteButtons[deleteButtons.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const event = onChange.mock.calls[0][0];
    expect(event.kind).toBe('delete');
  });

  it('fires onChange with kind "restoreFromBacklog" when a backlog card is dropped onto a canvas card', async () => {
    const tree: GoalTree = {
      goal_types: [
        { name: 'Strategy', level: 0 },
        { name: 'Business Goal', level: 1 },
      ],
      goals: [
        { id: 1, name: 'Root goal', type: 'Strategy', level: 0, parent_id: 0 },
        { id: 2, name: 'Orphaned goal', type: 'Business Goal', level: 1, parent_id: 999 },
      ],
    };
    const onChange = vi.fn<(e: GoalTreeChange) => void>();
    render(<GoalTreeView tree={tree} onChange={onChange} showBacklog />);
    await waitFor(() => {
      expect(screen.getByText('Orphaned goal')).toBeTruthy();
    });

    // jsdom has no native DataTransfer; stub the minimal setData/getData
    // surface this component's native (non-reactflow) HTML5 drag path uses
    // and attach it directly to the dispatched events.
    const store = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => store.set(k, v),
      getData: (k: string) => store.get(k) ?? '',
      effectAllowed: 'move',
    };
    function fireDnd(el: Element, type: string, coords: { clientX: number; clientY: number }) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      Object.assign(event, coords);
      el.dispatchEvent(event);
    }

    const backlogItem = screen.getByText('Orphaned goal').closest('div[draggable]')!;
    const rootNode = document.querySelector('.react-flow__node[data-id="1"]')!;
    // jsdom doesn't implement elementFromPoint at all (not just "returns null").
    document.elementFromPoint = vi.fn().mockReturnValue(rootNode);

    fireDnd(backlogItem, 'dragstart', { clientX: 0, clientY: 0 });
    fireDnd(rootNode, 'drop', { clientX: 10, clientY: 10 });

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const event = onChange.mock.calls[0][0];
    expect(event.kind).toBe('restoreFromBacklog');
    if (event.kind === 'restoreFromBacklog') {
      expect(event.id).toBe(2);
      expect(event.newParentId).toBe(1);
      expect(event.result.goals.find((g) => g.id === 2)?.parent_id).toBe(1);
    }
  });

  // Dragging a card is choreographed by reactflow's own pointer/DOM-measurement
  // machinery (ResizeObserver-gated node "readiness", d3-drag pointer capture,
  // viewport transform math) — faithfully simulating that in jsdom means
  // re-implementing reactflow's internals rather than testing this component.
  // computeDragOutcome() is the pure decision GoalTreeView's onNodeDragStop
  // calls once reactflow reports a drag: given where a card was dropped, which
  // mutation fires and what onChange payload it produces. Testing it directly
  // covers the actual reparent/moveToBacklog logic without that DOM coupling.
  describe('computeDragOutcome (reparent / moveToBacklog decision logic)', () => {
    const tree: GoalTree = {
      goal_types: [
        { name: 'Strategy', level: 0 },
        { name: 'Business Goal', level: 1 },
      ],
      goals: [
        { id: 1, name: 'Goal A', type: 'Strategy', level: 0, parent_id: 0 },
        { id: 2, name: 'Goal C', type: 'Strategy', level: 0, parent_id: 0 },
        { id: 3, name: 'Goal B', type: 'Business Goal', level: 1, parent_id: 1 },
      ],
    };

    it('fires a "reparent" change when dropped onto another card', () => {
      const change = computeDragOutcome(tree, 3, { kind: 'node', id: 2 });
      expect(change?.kind).toBe('reparent');
      if (change?.kind === 'reparent') {
        expect(change.sourceId).toBe(3);
        expect(change.targetId).toBe(2);
        expect(change.result.goals.find((g) => g.id === 3)?.parent_id).toBe(2);
      }
    });

    it('fires a "moveToBacklog" change when dropped on the backlog zone', () => {
      const change = computeDragOutcome(tree, 3, { kind: 'backlog' });
      expect(change?.kind).toBe('moveToBacklog');
      if (change?.kind === 'moveToBacklog') {
        expect(change.id).toBe(3);
        expect(change.result.goals.find((g) => g.id === 3)?.parent_id).toBe(0);
      }
    });

    it('is a no-op when dropped nowhere in particular', () => {
      expect(computeDragOutcome(tree, 3, null)).toBeNull();
    });

    it('is a no-op when dropped on itself', () => {
      expect(computeDragOutcome(tree, 3, { kind: 'node', id: 3 })).toBeNull();
    });

    it('is a no-op when the reparent would exceed the schema max level', () => {
      // Goal 3 is already level 1 (max); reparenting it under itself-sibling
      // level-1 goal would push it to level 2.
      const deeper: GoalTree = {
        ...tree,
        goals: [...tree.goals, { id: 4, name: 'Goal D', type: 'Business Goal', level: 1, parent_id: 1 }],
      };
      expect(computeDragOutcome(deeper, 3, { kind: 'node', id: 4 })).toBeNull();
    });
  });

  it('fires onFactorClick with the clicked factor when a popover item is clicked', async () => {
    const onFactorClick = vi.fn();
    render(<GoalTreeView tree={makeTree()} onFactorClick={onFactorClick} />);
    await waitFor(() => {
      expect(screen.getByText('Cut churn')).toBeTruthy();
    });

    // Open the negative-factor panel on "Cut churn" (id=3, has risk factor "Support backlog")
    const negativeBadge = screen.getByLabelText('1 negative factor');
    negativeBadge.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // The popover item for the risk factor should now be in the DOM
    const factorItem = await waitFor(() => screen.getByText('Support backlog'));
    factorItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => expect(onFactorClick).toHaveBeenCalledTimes(1));
    expect(onFactorClick.mock.calls[0][0]).toMatchObject({ id: 10, name: 'Support backlog', impact_type: 'risk' });
  });

  it('fires onEditRequest on double-click', async () => {
    const onEditRequest = vi.fn();
    render(<GoalTreeView tree={makeTree()} onEditRequest={onEditRequest} />);
    await waitFor(() => {
      expect(screen.getByText('Triple revenue')).toBeTruthy();
    });
    const nodeEl = document.querySelector('.react-flow__node[data-id="1"]');
    expect(nodeEl).toBeTruthy();
    nodeEl!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    await waitFor(() => expect(onEditRequest).toHaveBeenCalledTimes(1));
    expect(onEditRequest.mock.calls[0][0]).toMatchObject({ id: 1, name: 'Triple revenue' });
  });
});
