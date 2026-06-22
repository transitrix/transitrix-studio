import { describe, it, expect } from 'vitest';
import {
  renderProcessLayoutSvg,
  renderProcessBody,
  type ProcessDiagramLayout,
  type ProcessFlowElement,
} from '../render-process.js';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makeLayout(overrides: Partial<ProcessDiagramLayout> = {}): ProcessDiagramLayout {
  const elements = new Map<string, { x: number; y: number; width: number; height: number }>([
    ['start', { x: 160, y: 72, width: 36, height: 36 }],
    ['task1', { x: 250, y: 60, width: 100, height: 80 }],
    ['end', { x: 410, y: 72, width: 36, height: 36 }],
  ]);

  const laneBounds = new Map([
    ['lane1', { x: 88, y: 40, width: 400, height: 200 }],
  ]);

  const poolBounds = { x: 12, y: 12, width: 500, height: 280 };

  const process = {
    id: 'proc1',
    name: 'Test Process',
    poolId: 'pool1',
    poolName: 'Test Pool',
    lanes: [
      {
        id: 'lane1',
        name: 'Lane One',
        elements: [
          { id: 'start', type: 'startEvent', name: 'Start' },
          { id: 'task1', type: 'task', name: 'Do Work' },
          { id: 'end', type: 'endEvent', name: 'End' },
        ] as ProcessFlowElement[],
      },
    ],
  };

  const flows = [
    {
      id: 'f1',
      from: 'start',
      to: 'task1',
      waypoints: [
        { x: 196, y: 90 },
        { x: 250, y: 100 },
      ],
    },
    {
      id: 'f2',
      from: 'task1',
      to: 'end',
      waypoints: [
        { x: 350, y: 100 },
        { x: 410, y: 90 },
      ],
    },
  ];

  return { process, elements, laneBounds, poolBounds, flows, associations: [], ...overrides };
}

function addElement(
  layout: ProcessDiagramLayout,
  el: ProcessFlowElement,
  bounds: { x: number; y: number; width: number; height: number },
): ProcessDiagramLayout {
  layout.process.lanes[0].elements.push(el);
  layout.elements.set(el.id, bounds);
  return layout;
}

// ---------------------------------------------------------------------------
// SVG root and structure
// ---------------------------------------------------------------------------

describe('renderProcessLayoutSvg — root', () => {
  it('opens and closes an SVG element', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('sets width and height from pool bounds plus padding', () => {
    const layout = makeLayout();
    const svg = renderProcessLayoutSvg(layout);
    // poolBounds x=12, width=500 → svgW = 12+500+16 = 528
    expect(svg).toContain('width="528"');
  });

  it('expands height for topInset', () => {
    const svg = renderProcessLayoutSvg(makeLayout(), { title: '<text>T</text>', topInset: 32 });
    // poolBounds y=12, height=280 + padding 16 + inset 32 = 340
    expect(svg).toContain('height="340"');
  });

  it('injects title markup when provided', () => {
    const svg = renderProcessLayoutSvg(makeLayout(), {
      title: '<text class="text-header" x="16" y="20">My Title</text>',
    });
    expect(svg).toContain('My Title');
    expect(svg).toContain('text-header');
  });
});

// ---------------------------------------------------------------------------
// CSS embedding
// ---------------------------------------------------------------------------

describe('renderProcessLayoutSvg — CSS', () => {
  it('embeds a <style> block', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('<style>');
    expect(svg).toContain('</style>');
  });

  it('includes shared theme CSS custom properties', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('--ts-');
  });

  it('includes BPMN-specific CSS classes', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('bpmn-pool');
    expect(svg).toContain('bpmn-lane');
    expect(svg).toContain('bpmn-task');
    expect(svg).toContain('bpmn-event');
    expect(svg).toContain('bpmn-gateway');
    expect(svg).toContain('bpmn-seq-flow');
  });

  it('has no font-style italic', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg.toLowerCase()).not.toContain('font-style');
    expect(svg.toLowerCase()).not.toContain('italic');
  });
});

// ---------------------------------------------------------------------------
// Pool and lane structure
// ---------------------------------------------------------------------------

describe('renderProcessLayoutSvg — pool / lanes', () => {
  it('renders pool background rect', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('class="bpmn-pool"');
  });

  it('renders pool name band rect', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('class="bpmn-pool-name"');
  });

  it('renders pool name text', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('Test Pool');
    expect(svg).toContain('bpmn-pool-label');
  });

  it('renders pool name rotated -90 degrees', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('rotate(-90,');
  });

  it('renders lane background rect', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('class="bpmn-lane"');
  });

  it('renders lane header rect', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('class="bpmn-lane-header"');
  });

  it('renders lane name text', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('Lane One');
    expect(svg).toContain('bpmn-lane-label');
  });

  it('XML-escapes special characters in pool and lane names', () => {
    const layout = makeLayout();
    layout.process.poolName = 'Pool & <Co>';
    layout.process.lanes[0].name = 'Lane "A"';
    const svg = renderProcessLayoutSvg(layout);
    expect(svg).not.toContain('<Co>');
    expect(svg).toContain('&lt;Co&gt;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&quot;');
  });
});

// ---------------------------------------------------------------------------
// Flow elements
// ---------------------------------------------------------------------------

describe('renderProcessLayoutSvg — start / end events', () => {
  it('renders start event as circle with bpmn-event-start class', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toMatch(/<circle[^>]+class="bpmn-event bpmn-event-start"/);
  });

  it('renders end event as circle with bpmn-event-end class', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toMatch(/<circle[^>]+class="bpmn-event bpmn-event-end"/);
  });

  it('renders event labels below the shape', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('class="bpmn-event-label"');
    expect(svg).toContain('>Start<');
    expect(svg).toContain('>End<');
  });
});

describe('renderProcessLayoutSvg — tasks', () => {
  it('renders task as rect with bpmn-task class', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('class="diagram-node bpmn-task"');
  });

  it('renders task with rounded corners', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('rx="4"');
  });

  it('renders task name text', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('Do Work');
    expect(svg).toContain('bpmn-task-name');
  });

  it('renders userTask and serviceTask the same as task', () => {
    const layout = makeLayout();
    addElement(layout, { id: 'ut', type: 'userTask', name: 'User Step' }, { x: 200, y: 60, width: 100, height: 80 });
    addElement(layout, { id: 'st', type: 'serviceTask', name: 'Service Step' }, { x: 320, y: 60, width: 100, height: 80 });
    const svg = renderProcessLayoutSvg(layout);
    expect(svg).toContain('User Step');
    expect(svg).toContain('Service Step');
  });

  it('wraps long task names across multiple tspans', () => {
    const layout = makeLayout();
    layout.process.lanes[0].elements[1].name = 'A Very Long Task Name Here';
    const svg = renderProcessLayoutSvg(layout);
    expect(svg).toContain('<tspan');
  });

  it('XML-escapes special characters in task names', () => {
    const layout = makeLayout();
    layout.process.lanes[0].elements[1].name = 'Send <email> & notify';
    const svg = renderProcessLayoutSvg(layout);
    expect(svg).not.toContain('<email>');
    expect(svg).toContain('&lt;email&gt;');
    expect(svg).toContain('&amp;');
  });
});

describe('renderProcessLayoutSvg — gateways', () => {
  it('renders XOR gateway as diamond path', () => {
    const layout = makeLayout();
    addElement(layout, { id: 'gw1', type: 'exclusiveGateway', name: 'Choice?' }, {
      x: 180, y: 75, width: 50, height: 50,
    });
    const svg = renderProcessLayoutSvg(layout);
    expect(svg).toContain('class="bpmn-gateway"');
  });

  it('renders XOR gateway with × marker lines', () => {
    const layout = makeLayout();
    addElement(layout, { id: 'gw1', type: 'exclusiveGateway' }, {
      x: 180, y: 75, width: 50, height: 50,
    });
    const svg = renderProcessLayoutSvg(layout);
    expect(svg).toContain('class="bpmn-gateway-marker"');
    // The × marker has two crossing diagonals — check for the double-M path
    const markerSection = svg.match(/class="bpmn-gateway-marker"[^>]*d="([^"]+)"/)?.[1] ?? '';
    expect(markerSection.match(/M/g)?.length).toBe(2);
  });

  it('renders AND gateway as diamond path', () => {
    const layout = makeLayout();
    addElement(layout, { id: 'gw2', type: 'parallelGateway' }, {
      x: 180, y: 75, width: 50, height: 50,
    });
    const svg = renderProcessLayoutSvg(layout);
    expect(svg).toContain('class="bpmn-gateway"');
    expect(svg).toContain('class="bpmn-gateway-marker"');
  });
});

describe('renderProcessLayoutSvg — data objects', () => {
  it('renders data object with fold-corner path', () => {
    const layout = makeLayout();
    addElement(layout, { id: 'do1', type: 'dataObject', name: 'Invoice' }, {
      x: 160, y: 50, width: 36, height: 50,
    });
    const svg = renderProcessLayoutSvg(layout);
    expect(svg).toContain('class="bpmn-data-obj"');
  });

  it('renders data object name below shape', () => {
    const layout = makeLayout();
    addElement(layout, { id: 'do1', type: 'dataObject', name: 'Invoice' }, {
      x: 160, y: 50, width: 36, height: 50,
    });
    const svg = renderProcessLayoutSvg(layout);
    expect(svg).toContain('Invoice');
    expect(svg).toContain('bpmn-data-obj-label');
  });
});

// ---------------------------------------------------------------------------
// Sequence flows
// ---------------------------------------------------------------------------

describe('renderProcessLayoutSvg — sequence flows', () => {
  it('renders flows as polylines with arrow marker', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('class="bpmn-seq-flow"');
    expect(svg).toContain('marker-end="url(#bpmn-arrow)"');
  });

  it('defines the bpmn-arrow marker', () => {
    const svg = renderProcessLayoutSvg(makeLayout());
    expect(svg).toContain('id="bpmn-arrow"');
    expect(svg).toContain('class="arrow-fill"');
  });

  it('adds dashed class to conditional flows', () => {
    const layout = makeLayout();
    layout.flows[0] = { ...layout.flows[0], condition: 'approved == true' };
    const svg = renderProcessLayoutSvg(layout);
    expect(svg).toContain('bpmn-seq-flow bpmn-seq-cond');
  });

  it('skips flows with fewer than 2 waypoints', () => {
    const layout = makeLayout();
    layout.flows.push({ id: 'bad', from: 'start', to: 'end', waypoints: [{ x: 100, y: 100 }] });
    expect(() => renderProcessLayoutSvg(layout)).not.toThrow();
    const svg = renderProcessLayoutSvg(layout);
    // Should still render the 2 valid flows
    const matches = svg.match(/class="bpmn-seq-flow"/g);
    expect(matches?.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Associations
// ---------------------------------------------------------------------------

describe('renderProcessLayoutSvg — associations', () => {
  it('renders associations as dashed polylines without arrowhead', () => {
    const layout = makeLayout();
    addElement(layout, { id: 'do1', type: 'dataObject' }, { x: 160, y: 50, width: 36, height: 50 });
    layout.associations.push({
      id: 'a1',
      from: 'task1',
      to: 'do1',
      waypoints: [{ x: 300, y: 100 }, { x: 178, y: 75 }],
    });
    const svg = renderProcessLayoutSvg(layout);
    expect(svg).toContain('class="bpmn-assoc"');
    // Associations must NOT have arrowheads
    const assocLine = svg.match(/class="bpmn-assoc"[^/]*/)?.[0] ?? '';
    expect(assocLine).not.toContain('marker-end');
  });
});

// ---------------------------------------------------------------------------
// renderProcessBody offset
// ---------------------------------------------------------------------------

describe('renderProcessBody', () => {
  it('shifts all coordinates by ox/oy', () => {
    const layout = makeLayout();
    const bodyAt0 = renderProcessBody(layout, 0, 0);
    const bodyAt50 = renderProcessBody(layout, 50, 0);
    // Pool at ox=0 has x=12; at ox=50 should be x=62
    expect(bodyAt0).toContain('x="12"');
    expect(bodyAt50).toContain('x="62"');
    expect(bodyAt50).not.toContain('x="12"');
  });

  it('includes defs block with arrow marker', () => {
    const body = renderProcessBody(makeLayout(), 0, 0);
    expect(body).toContain('<defs>');
    expect(body).toContain('id="bpmn-arrow"');
  });
});
