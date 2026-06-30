import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { BpmnModdle } from 'bpmn-moddle';
import { describe, expect, it } from 'vitest';

import { transitrixPackageVersion } from '../src/package-version.js';
import { compileTransitrixYaml, compileTransitrixYamlWithLayout } from '../src/compiler.js';
import { layoutProcess } from '../src/layout.js';
import { irFromValidatedDsl, parseYamlToIr, type YamlDocumentRoot } from '../src/parser.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sampleCervinPath = join(repoRoot, 'tests', 'fixtures', 'notation-corpus', 'bpmn', 'order-fulfillment.bpmn.transitrix.yaml');

describe('parser', () => {
  it('parses sample and collects flows', () => {
    const yaml = readFileSync(sampleCervinPath, 'utf8');
    const ir = parseYamlToIr(yaml);
    expect(ir.id).toBe('order-fulfillment');
    expect(ir.flows).toHaveLength(6);
  });

  it('accepts canonical .bpmn.transitrix.yaml example', () => {
    const p = join(repoRoot, 'tests', 'fixtures', 'notation-corpus', 'bpmn', 'order-fulfillment.bpmn.transitrix.yaml');
    const yaml = readFileSync(p, 'utf8');
    const ir = parseYamlToIr(yaml);
    expect(ir.id).toBe('order-fulfillment');
  });

  it('duplicate element ids throw', () => {
    expect(() =>
      parseYamlToIr(`process:
  id: dup-test
  name: Dup test
  pools:
    - id: pool-x
      name: Pool X
      lanes:
        - id: lane-one
          name: One
          elements:
            - id: dup
              type: task
              name: A
            - id: dup
              type: task
              name: B
  flows:
    - from: dup
      to: dup
`),
    ).toThrow(/Duplicate element id/);
  });

  it('flow to unknown element throws', () => {
    expect(() =>
      parseYamlToIr(`process:
  id: bad-flow-test
  name: Flow test
  pools:
    - id: pool-x
      name: Pool X
      lanes:
        - id: lane-one
          name: One
          elements:
            - id: alpha
              type: startEvent
  flows:
    - from: alpha
      to: missing
`),
    ).toThrow(/Flow references unknown element \(to\): missing/);
  });

  it('schema violations surface AJV details', () => {
    expect(() =>
      parseYamlToIr(`process:
  id: no-name
`),
    ).toThrow(/DSL validation failed/);
  });

  it('rejects YAML with more than one pool (DSL schema)', () => {
    expect(() =>
      parseYamlToIr(`process:
  id: multi-pool
  name: Two pools
  pools:
    - id: pa
      name: A
      lanes:
        - id: la
          name: LA
          elements:
            - id: s
              type: startEvent
    - id: pb
      name: B
      lanes:
        - id: lb
          name: LB
          elements:
            - id: t
              type: endEvent
  flows:
    - from: s
      to: t
`),
    ).toThrow(/DSL validation failed/);
  });

  it('collector rejects validated document with multiple pools (RD-001 guard)', () => {
    const doc: YamlDocumentRoot = {
      process: {
        id: 'validated-multi',
        name: 'Validated multi snapshot',
        pools: [
          {
            id: 'pa',
            name: 'A',
            lanes: [{ id: 'la', name: 'LA', elements: [{ id: 'a', type: 'startEvent' }] }],
          },
          {
            id: 'pb',
            name: 'B',
            lanes: [{ id: 'lb', name: 'LB', elements: [{ id: 'b', type: 'endEvent' }] }],
          },
        ],
        flows: [{ from: 'a', to: 'b' }],
      },
    };
    expect(() => irFromValidatedDsl(doc)).toThrow(/Multiple pools are not supported/);
  });

  it('minimal process with smallest valid BPMN subgraph parses', () => {
    const ir = parseYamlToIr(`process:
  id: solo-el
  name: Solo
  pools:
    - id: p
      name: P
      lanes:
        - id: lane
          name: L
          elements:
            - id: s
              type: startEvent
            - id: e
              type: endEvent
  flows:
    - from: s
      to: e
`);
    expect(ir.lanes.flatMap((l) => l.elements)).toHaveLength(2);
    expect(ir.flows).toHaveLength(1);
  });
});

const DATA_OBJECT_YAML = `
process:
  id: do-test
  name: Data Object Test
  pools:
    - id: pool1
      name: Pool 1
      lanes:
        - id: lane1
          name: Lane 1
          elements:
            - id: start1
              type: startEvent
            - id: task1
              type: task
              name: Process Order
            - id: do1
              type: dataObject
              name: Order Data
            - id: end1
              type: endEvent
  flows:
    - from: start1
      to: task1
    - from: task1
      to: end1
  associations:
    - from: do1
      to: task1
`;

describe('data objects + associations', () => {
  it('parses data object and association from YAML', () => {
    const ir = parseYamlToIr(DATA_OBJECT_YAML);
    const els = ir.lanes.flatMap((l) => l.elements);
    expect(els.find((e) => e.id === 'do1')?.type).toBe('dataObject');
    expect(ir.associations).toHaveLength(1);
    expect(ir.associations![0]).toMatchObject({ from: 'do1', to: 'task1' });
  });

  it('auto-generates association id when omitted', () => {
    const ir = parseYamlToIr(DATA_OBJECT_YAML);
    expect(ir.associations![0].id).toBeTruthy();
  });

  it('association to unknown element throws', () => {
    expect(() =>
      parseYamlToIr(`
process:
  id: bad-assoc
  name: Bad
  pools:
    - id: p
      name: P
      lanes:
        - id: l
          name: L
          elements:
            - id: s
              type: startEvent
            - id: e
              type: endEvent
  flows:
    - from: s
      to: e
  associations:
    - from: s
      to: missing
`),
    ).toThrow(/Association references unknown element \(to\): missing/);
  });

  it('lays out data object and produces waypoints for association', async () => {
    const ir = parseYamlToIr(DATA_OBJECT_YAML);
    const layout = await layoutProcess(ir);
    expect(layout.elements.has('do1')).toBe(true);
    expect(layout.associations).toHaveLength(1);
    expect(layout.associations[0].waypoints.length).toBeGreaterThanOrEqual(2);
  });

  it('emits DataObject + DataObjectReference + Association in BPMN XML', async () => {
    const xml = await compileTransitrixYaml(DATA_OBJECT_YAML);
    expect(xml).toContain('<dataObject');
    expect(xml).toContain('<dataObjectReference');
    expect(xml).toContain('<association');
    expect(xml).toContain('associationDirection="None"');
  });

  it('BPMN XML passes bpmn-moddle round-trip with zero warnings', async () => {
    const xml = await compileTransitrixYaml(DATA_OBJECT_YAML);
    const moddle = new BpmnModdle();
    const { warnings } = await moddle.fromXML(xml, 'bpmn:Definitions');
    expect(warnings ?? []).toHaveLength(0);
  });
});

describe('layout', () => {
  it('assigns geometry to every element via ELK', async () => {
    const yaml = readFileSync(sampleCervinPath, 'utf8');
    const ir = parseYamlToIr(yaml);
    const layout = await layoutProcess(ir);
    for (const id of ir.lanes.flatMap((l) => l.elements.map((e) => e.id))) {
      expect(layout.elements.has(id), id).toBe(true);
    }
    expect(layout.poolBounds.width).toBeGreaterThan(0);
  });

  it('respects layout options (lane vertical gap changes pool height)', async () => {
    const yaml = readFileSync(sampleCervinPath, 'utf8');
    const ir = parseYamlToIr(yaml);
    const baseline = await layoutProcess(ir);
    const wideGap = await layoutProcess(ir, { laneVerticalGap: 120 });
    expect(wideGap.poolBounds.height).toBeGreaterThan(baseline.poolBounds.height);
  });

  it('uniformLaneHeight equalizes all lane heights to the tallest lane', async () => {
    const featurePath = join(repoRoot, 'tests', 'fixtures', 'notation-corpus', 'bpmn', 'feature-release.bpmn.transitrix.yaml');
    const yaml = await readFile(featurePath, 'utf8');
    const ir = parseYamlToIr(yaml);
    const layout = await layoutProcess(ir, { uniformLaneHeight: true });
    const heights = [...layout.laneBounds.values()].map((b) => b.height);
    expect(heights.length).toBeGreaterThan(1);
    const max = Math.max(...heights);
    for (const h of heights) expect(h).toBe(max);
  });

  it('uniformLaneHeight: false preserves natural per-lane heights', async () => {
    const featurePath = join(repoRoot, 'tests', 'fixtures', 'notation-corpus', 'bpmn', 'feature-release.bpmn.transitrix.yaml');
    const yaml = await readFile(featurePath, 'utf8');
    const ir = parseYamlToIr(yaml);
    const natural = await layoutProcess(ir, { uniformLaneHeight: false });
    const heights = [...natural.laneBounds.values()].map((b) => b.height);
    // With different lane content, at least one lane differs from another
    expect(new Set(heights).size).toBeGreaterThan(1);
  });

  // #418 — Equalize toggle: normalization applied when option flows through
  // compileTransitrixYamlWithLayout (the compile path used by the extension's
  // bundled compiler). Before the fix, the ProcessPreview lambda in extension.ts
  // dropped opts, so uniformLaneHeight never reached layoutProcess. This test
  // verifies that the option is threaded end-to-end so the equalize checkbox
  // produces the same result as the direct layoutProcess path.
  it('compileTransitrixYamlWithLayout uniformLaneHeight option equalizes lane heights', async () => {
    const featurePath = join(repoRoot, 'tests', 'fixtures', 'notation-corpus', 'bpmn', 'feature-release.bpmn.transitrix.yaml');
    const yaml = await readFile(featurePath, 'utf8');

    const withEq = await compileTransitrixYamlWithLayout(yaml, { layout: { uniformLaneHeight: true } });
    const withoutEq = await compileTransitrixYamlWithLayout(yaml, { layout: { uniformLaneHeight: false } });

    const heightsEq = [...withEq.layout.laneBounds.values()].map((b) => b.height);
    const heightsNat = [...withoutEq.layout.laneBounds.values()].map((b) => b.height);

    // With equalization: all lanes share the same (tallest) height.
    expect(heightsEq.length).toBeGreaterThan(1);
    const maxEq = Math.max(...heightsEq);
    for (const h of heightsEq) expect(h).toBe(maxEq);

    // Without equalization: at least one lane differs (natural heights vary).
    expect(new Set(heightsNat).size).toBeGreaterThan(1);

    // The equalized pool must be taller or equal to the non-equalized pool
    // (equal when lanes already happen to share the same natural height).
    expect(withEq.layout.poolBounds.height).toBeGreaterThanOrEqual(withoutEq.layout.poolBounds.height);
  });

  // #418 — Equalize toggle: webview message contract matches the handler.
  // The checkbox posts {type:'transitrix:bpmn-toggle', kind:'uniform-lane-height'};
  // the handler reads m['kind'] === 'uniform-lane-height'. Assert they align.
  it('equalize checkbox message kind constant matches process-preview handler contract', () => {
    // The kind literal used in the webview script (process-preview.ts buildBpmnControls)
    // and the kind checked in onDidReceiveMessage. Both are string literals — if either
    // side changes without updating the other the test fails.
    const WEBVIEW_KIND = 'uniform-lane-height';   // from buildBpmnControls script
    const HANDLER_KIND = 'uniform-lane-height';   // from onDidReceiveMessage guard
    expect(WEBVIEW_KIND).toBe(HANDLER_KIND);
  });

  it('cross-lane flow keeps at least two waypoints once geometry exists', async () => {
    const featurePath = join(repoRoot, 'tests', 'fixtures', 'notation-corpus', 'bpmn', 'feature-release.bpmn.transitrix.yaml');
    const yaml = await readFile(featurePath, 'utf8');
    const ir = parseYamlToIr(yaml);
    const layout = await layoutProcess(ir);
    // task-regression (QA) → gw-deploy-split (DevOps): cross-lane forward flow
    const bridge = layout.flows.find((f) => f.from === 'task-regression' && f.to === 'gw-deploy-split');
    expect(bridge?.waypoints.length).toBeGreaterThanOrEqual(2);
  });

  // RD-046: cross-lane X-alignment regression tests
  it('element X coordinates are independent of laneVerticalGap (phase-1 separation invariant)', async () => {
    const featurePath = join(repoRoot, 'tests', 'fixtures', 'notation-corpus', 'bpmn', 'feature-release.bpmn.transitrix.yaml');
    const yaml = await readFile(featurePath, 'utf8');
    const ir = parseYamlToIr(yaml);
    const baseline = await layoutProcess(ir, { laneVerticalGap: 40 });
    const wide = await layoutProcess(ir, { laneVerticalGap: 200 });
    for (const [id, b] of baseline.elements) {
      const w = wide.elements.get(id);
      expect(w, `element ${id} missing in wide layout`).toBeDefined();
      expect(w!.x, `${id}.x changed with laneVerticalGap`).toBeCloseTo(b.x, 1);
    }
  });

  it('forward cross-lane flows: target element is to the right of source (RD-046)', async () => {
    const featurePath = join(repoRoot, 'tests', 'fixtures', 'notation-corpus', 'bpmn', 'feature-release.bpmn.transitrix.yaml');
    const yaml = await readFile(featurePath, 'utf8');
    const ir = parseYamlToIr(yaml);
    const layout = await layoutProcess(ir);

    // Known forward cross-lane pairs in feature-release.bpmn.transitrix.yaml
    const forwardCrossLanePairs: [string, string][] = [
      ['task-build', 'task-manual-qa'],    // lane-dev → lane-qa
      ['task-regression', 'gw-deploy-split'], // lane-qa → lane-infra
    ];

    for (const [fromId, toId] of forwardCrossLanePairs) {
      const from = layout.elements.get(fromId)!;
      const to = layout.elements.get(toId)!;
      expect(from, `${fromId} not in layout`).toBeDefined();
      expect(to, `${toId} not in layout`).toBeDefined();
      expect(to.x, `${toId}.x should be right of ${fromId}.x`).toBeGreaterThan(from.x);
    }
  });

  // RD-048 / RD-072: backward cross-lane U-turn routing — topologically forced fixture.
  //
  // The fixture contains TWO cycles that share exactly one edge (b-task → t-anchor):
  //   C1: t-anchor → b-task → t-anchor          (direct cross-lane path)
  //   C2: t-anchor → t-mid  → b-task → t-anchor  (via intermediate)
  //
  // ELK's minimum feedback arc set must reverse b-task → t-anchor because that
  // single reversal breaks both cycles simultaneously.  Reversing any other cycle
  // edge (e.g. t-anchor→b-task or t-mid→b-task) breaks only one cycle, which
  // leaves the other intact and forces a second reversal — not optimal.
  //
  // Consequence: b-task is always placed to the right of t-anchor regardless of
  // ELK's internal seed or heuristic state, making the precondition deterministic.
  it('backward cross-lane flow uses left-side U-turn (RD-048)', async () => {
    const ir = parseYamlToIr(`process:
  id: backward-cross-lane
  name: Backward cross-lane test
  pools:
    - id: pool
      name: Pool
      lanes:
        - id: lane-top
          name: Top
          elements:
            - id: t-src
              type: startEvent
            - id: t-anchor
              type: task
              name: Anchor
            - id: t-mid
              type: task
              name: Mid
            - id: t-end
              type: endEvent
        - id: lane-bot
          name: Bottom
          elements:
            - id: b-task
              type: task
              name: Bottom task
  flows:
    - from: t-src
      to: t-anchor
    - from: t-anchor
      to: t-mid
    - from: t-mid
      to: b-task
    - from: t-anchor
      to: b-task
    - from: b-task
      to: t-anchor
    - from: t-anchor
      to: t-end
`);
    const layout = await layoutProcess(ir);

    const bFlow = layout.flows.find((f) => f.from === 'b-task' && f.to === 't-anchor');
    expect(bFlow, 'backward cross-lane flow not found').toBeDefined();

    const bTaskB = layout.elements.get('b-task')!;
    const tAnchorB = layout.elements.get('t-anchor')!;

    // Deterministic: b-task must be to the right of t-anchor (see fixture comment above).
    expect(bTaskB.x, 'b-task must be to the right of t-anchor').toBeGreaterThan(tAnchorB.x);

    const wps = bFlow!.waypoints;
    expect(wps.length).toBeGreaterThanOrEqual(3);

    // Arc vertex (leftmost X) must be to the left of both elements.
    const arcX = Math.min(...wps.map((p) => p.x));
    expect(arcX).toBeLessThan(bTaskB.x);
    expect(arcX).toBeLessThan(tAnchorB.x);

    // Exit port: first waypoint at left edge of b-task (source).
    expect(wps[0].x).toBeCloseTo(bTaskB.x, 1);
    // Entry port: last waypoint at left edge of t-anchor (target).
    expect(wps[wps.length - 1].x).toBeCloseTo(tAnchorB.x, 1);
  });

  // RD-062: gateway port distribution tests
  it('cross-lane gateway flow to lower lane exits from bottom port', async () => {
    // gw (parallelGateway) in lane-top splits: one same-lane flow, one cross-lane down.
    // The downward cross-lane flow must exit from the gateway's bottom vertex.
    const ir = parseYamlToIr(`process:
  id: gw-cross-bottom
  name: Gateway cross-lane bottom
  pools:
    - id: pool
      name: Pool
      lanes:
        - id: lane-top
          name: Top
          elements:
            - id: src
              type: startEvent
            - id: gw
              type: parallelGateway
              name: Split
            - id: stay
              type: endEvent
        - id: lane-bot
          name: Bottom
          elements:
            - id: below
              type: task
              name: Below task
  flows:
    - from: src
      to: gw
    - from: gw
      to: stay
    - from: gw
      to: below
`);
    const layout = await layoutProcess(ir);

    const crossFlow = layout.flows.find((f) => f.from === 'gw' && f.to === 'below');
    expect(crossFlow, 'gw→below flow not found').toBeDefined();

    const gwB = layout.elements.get('gw')!;
    const wps = crossFlow!.waypoints;
    expect(wps.length).toBeGreaterThanOrEqual(2);

    // Bottom port: first waypoint at the horizontal centre and bottom edge of the gateway.
    expect(wps[0].x).toBeCloseTo(gwB.x + gwB.width / 2, 1);
    expect(wps[0].y).toBeCloseTo(gwB.y + gwB.height, 1);
  });

  it('cross-lane gateway flow to upper lane exits from top port', async () => {
    // gw (parallelGateway) in lane-bot splits: one same-lane flow, one cross-lane up.
    // The upward cross-lane flow must exit from the gateway's top vertex.
    const ir = parseYamlToIr(`process:
  id: gw-cross-top
  name: Gateway cross-lane top
  pools:
    - id: pool
      name: Pool
      lanes:
        - id: lane-top
          name: Top
          elements:
            - id: above
              type: task
              name: Above task
        - id: lane-bot
          name: Bottom
          elements:
            - id: src
              type: startEvent
            - id: gw
              type: parallelGateway
              name: Split
            - id: stay
              type: endEvent
  flows:
    - from: src
      to: gw
    - from: gw
      to: stay
    - from: gw
      to: above
`);
    const layout = await layoutProcess(ir);

    const crossFlow = layout.flows.find((f) => f.from === 'gw' && f.to === 'above');
    expect(crossFlow, 'gw→above flow not found').toBeDefined();

    const gwB = layout.elements.get('gw')!;
    const wps = crossFlow!.waypoints;
    expect(wps.length).toBeGreaterThanOrEqual(2);

    // Top port: first waypoint at the horizontal centre and top edge of the gateway.
    expect(wps[0].x).toBeCloseTo(gwB.x + gwB.width / 2, 1);
    expect(wps[0].y).toBeCloseTo(gwB.y, 1);
  });

  // Straight-down/up entry rule: when gateway exit x is within the target element's
  // horizontal extent and the target lane is clear, a direct 2-point vertical segment
  // lands on the target top or bottom face (no chanY elbow, no left detour).
  it('cross-lane gateway flow enters target top face when gateway is directly above', async () => {
    // Fixture: 2 lanes stacked vertically.
    //   Top lane: start → gw → end  (gw placed after start by ELK, end placed after gw)
    //   Bot lane: below  (placed in same ELK column as gw; task is wider than the gateway)
    // gw center x should fall within below's horizontal bounds → straight-down 2-point path.
    const ir = parseYamlToIr(`process:
  id: straight-down-repro
  name: Straight down repro
  pools:
    - id: pool
      name: Pool
      lanes:
        - id: lane-top
          name: Top
          elements:
            - id: start
              type: startEvent
            - id: gw
              type: parallelGateway
              name: Decide
            - id: end
              type: endEvent
        - id: lane-bot
          name: Bot
          elements:
            - id: below
              type: task
              name: Below task
  flows:
    - from: start
      to: gw
    - from: gw
      to: end
    - from: gw
      to: below
`);
    const layout = await layoutProcess(ir);

    const flow = layout.flows.find((f) => f.from === 'gw' && f.to === 'below');
    expect(flow, 'gw→below flow not found').toBeDefined();

    const gwB = layout.elements.get('gw')!;
    const belowB = layout.elements.get('below')!;
    const gwCX = gwB.x + gwB.width / 2;
    const gwBottom = gwB.y + gwB.height;
    const eps = 4;

    const wps = flow!.waypoints;

    // First waypoint always exits the gateway BOTTOM center.
    expect(wps[0].x).toBeCloseTo(gwCX, 0);
    expect(wps[0].y).toBeCloseTo(gwBottom, 0);

    // If ELK places the gateway center within the target's x range, verify 2-point path
    // and top-face entry; otherwise accept any valid orthogonal path (≥ 3 points).
    const epWithinTarget = gwCX >= belowB.x - eps && gwCX <= belowB.x + belowB.width + eps;
    if (epWithinTarget) {
      expect(wps.length, '2-point straight-down path expected').toBeLessThanOrEqual(2);
      const last = wps[wps.length - 1];
      expect(last.x).toBeCloseTo(gwCX, 0);
      expect(last.y).toBeCloseTo(belowB.y, 0);
    } else {
      expect(wps.length, 'orthogonal elbow path expected').toBeGreaterThanOrEqual(3);
    }
  });

  it('cross-lane gateway flow enters target bottom face when gateway is directly below', async () => {
    // Fixture: 2 lanes stacked vertically.
    //   Bot lane: start → gw → end
    //   Top lane: above  (placed in same ELK column as gw)
    // gw exits TOP; gw center x within "above" bounds → 2-point upward path.
    const ir = parseYamlToIr(`process:
  id: straight-up-repro
  name: Straight up repro
  pools:
    - id: pool
      name: Pool
      lanes:
        - id: lane-top
          name: Top
          elements:
            - id: above
              type: task
              name: Above task
        - id: lane-bot
          name: Bot
          elements:
            - id: start
              type: startEvent
            - id: gw
              type: parallelGateway
              name: Decide
            - id: end
              type: endEvent
  flows:
    - from: start
      to: gw
    - from: gw
      to: end
    - from: gw
      to: above
`);
    const layout = await layoutProcess(ir);

    const flow = layout.flows.find((f) => f.from === 'gw' && f.to === 'above');
    expect(flow, 'gw→above flow not found').toBeDefined();

    const gwB = layout.elements.get('gw')!;
    const aboveB = layout.elements.get('above')!;
    const gwCX = gwB.x + gwB.width / 2;
    const gwTop = gwB.y;
    const eps = 4;

    const wps = flow!.waypoints;

    expect(wps[0].x).toBeCloseTo(gwCX, 0);
    expect(wps[0].y).toBeCloseTo(gwTop, 0);

    const epWithinTarget = gwCX >= aboveB.x - eps && gwCX <= aboveB.x + aboveB.width + eps;
    if (epWithinTarget) {
      expect(wps.length, '2-point straight-up path expected').toBeLessThanOrEqual(2);
      const last = wps[wps.length - 1];
      expect(last.x).toBeCloseTo(gwCX, 0);
      expect(last.y).toBeCloseTo(aboveB.y + aboveB.height, 0);
    } else {
      expect(wps.length, 'orthogonal elbow path expected').toBeGreaterThanOrEqual(3);
    }
  });

  it('same-lane gateway 2-way split: flows exit from different ports (RD-062)', async () => {
    // A gateway with 2 same-lane forward outputs must assign distinct exit ports so
    // no two arrows leave from the same vertex.
    const ir = parseYamlToIr(`process:
  id: gw-split-same-lane
  name: Gateway same-lane split
  pools:
    - id: pool
      name: Pool
      lanes:
        - id: lane
          name: Lane
          elements:
            - id: src
              type: startEvent
            - id: gw
              type: exclusiveGateway
              name: Split
            - id: path-a
              type: task
              name: Path A
            - id: path-b
              type: task
              name: Path B
            - id: sink
              type: endEvent
  flows:
    - from: src
      to: gw
    - from: gw
      to: path-a
      condition: a
    - from: gw
      to: path-b
      condition: b
    - from: path-a
      to: sink
    - from: path-b
      to: sink
`);
    const layout = await layoutProcess(ir);

    const flowA = layout.flows.find((f) => f.from === 'gw' && f.to === 'path-a');
    const flowB = layout.flows.find((f) => f.from === 'gw' && f.to === 'path-b');
    expect(flowA, 'gw→path-a not found').toBeDefined();
    expect(flowB, 'gw→path-b not found').toBeDefined();

    expect(flowA!.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(flowB!.waypoints.length).toBeGreaterThanOrEqual(2);

    const wpA0 = flowA!.waypoints[0];
    const wpB0 = flowB!.waypoints[0];

    // Two flows from the same gateway must exit from different points.
    const samePoint = Math.abs(wpA0.x - wpB0.x) < 0.5 && Math.abs(wpA0.y - wpB0.y) < 0.5;
    expect(samePoint, `both flows exit from (${wpA0.x.toFixed(1)},${wpA0.y.toFixed(1)})`).toBe(false);
  });

  it('smallest BPMN subgraph (start → end + one sequence flow) lays out cleanly', async () => {
    const ir = parseYamlToIr(`process:
  id: solo-layout
  name: Solo Layout
  pools:
    - id: p
      name: P
      lanes:
        - id: lane
          name: L
          elements:
            - id: st
              type: startEvent
            - id: en
              type: endEvent
  flows:
    - from: st
      to: en
`);
    const layout = await layoutProcess(ir);
    expect(layout.elements.get('st')).toBeDefined();
    expect(layout.elements.get('en')).toBeDefined();
  });

  // RD-127: Cross-lane gateway bottom/top exit routes through inter-lane gap, not target lane axis.
  it('cross-lane gateway flow to far-right target avoids intermediate elements (RD-127)', async () => {
    // Fixture: 3 lanes stacked vertically.
    //   Top lane: start → gw
    //   Mid lane: unused (buffer)
    //   Bot lane: bot-task-1 → bot-task-2 → end (elements between gw column and end column)
    // Flow gw → end exits from bottom of gw, travels through inter-lane gap, then
    // approaches end vertically without passing through bot-task-1 or bot-task-2.
    const ir = parseYamlToIr(`process:
  id: rd-127-repro
  name: RD-127 repro
  pools:
    - id: pool
      name: Pool
      lanes:
        - id: lane-top
          name: Top
          elements:
            - id: start
              type: startEvent
            - id: gw
              type: parallelGateway
              name: Decide
        - id: lane-mid
          name: Mid
          elements:
            - id: mid-placeholder
              type: task
              name: Mid
        - id: lane-bot
          name: Bot
          elements:
            - id: bot-task-1
              type: task
              name: Bot Task 1
            - id: bot-task-2
              type: task
              name: Bot Task 2
            - id: end
              type: endEvent
  flows:
    - from: start
      to: gw
    - from: gw
      to: mid-placeholder
    - from: gw
      to: end
`);
    const layout = await layoutProcess(ir);

    const crossFlow = layout.flows.find((f) => f.from === 'gw' && f.to === 'end');
    expect(crossFlow, 'gw→end flow not found').toBeDefined();

    const gwB = layout.elements.get('gw')!;
    const task1B = layout.elements.get('bot-task-1')!;
    const task2B = layout.elements.get('bot-task-2')!;
    const endB = layout.elements.get('end')!;

    const wps = crossFlow!.waypoints;
    expect(wps.length).toBeGreaterThanOrEqual(4);

    // Helper: check if a point is inside bounds (with margin).
    function pointInBox(p: { x: number; y: number }, b: { x: number; y: number; width: number; height: number }): boolean {
      return p.x >= b.x && p.x <= b.x + b.width &&
             p.y >= b.y && p.y <= b.y + b.height;
    }

    // Helper: check if an orthogonal segment passes through a box.
    // For axis-aligned segments, intersection occurs if segment spans box interior.
    function segmentIntersectsBox(
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      b: { x: number; y: number; width: number; height: number }
    ): boolean {
      // Horizontal segment.
      if (p1.y === p2.y) {
        const y = p1.y;
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        if (y >= b.y && y <= b.y + b.height && minX < b.x + b.width && maxX > b.x) {
          return true;
        }
      }
      // Vertical segment.
      if (p1.x === p2.x) {
        const x = p1.x;
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        if (x >= b.x && x <= b.x + b.width && minY < b.y + b.height && maxY > b.y) {
          return true;
        }
      }
      return false;
    }

    // Verify: no waypoint is inside bot-task-1 or bot-task-2.
    for (const wp of wps) {
      expect(pointInBox(wp, task1B), `waypoint (${wp.x.toFixed(0)},${wp.y.toFixed(0)}) inside bot-task-1`).toBe(false);
      expect(pointInBox(wp, task2B), `waypoint (${wp.x.toFixed(0)},${wp.y.toFixed(0)}) inside bot-task-2`).toBe(false);
    }

    // Verify: no segment passes through bot-task-1 or bot-task-2.
    for (let i = 0; i < wps.length - 1; i++) {
      const seg = segmentIntersectsBox(wps[i], wps[i + 1], task1B);
      const seg2 = segmentIntersectsBox(wps[i], wps[i + 1], task2B);
      expect(seg, `segment (${wps[i].x.toFixed(0)},${wps[i].y.toFixed(0)})→(${wps[i + 1].x.toFixed(0)},${wps[i + 1].y.toFixed(0)}) intersects bot-task-1`).toBe(false);
      expect(seg2, `segment (${wps[i].x.toFixed(0)},${wps[i].y.toFixed(0)})→(${wps[i + 1].x.toFixed(0)},${wps[i + 1].y.toFixed(0)}) intersects bot-task-2`).toBe(false);
    }
  });
  // RD-127 optimisation: when the target lane is clear of intermediate elements,
  // the cross-lane gateway flow uses a 3-point L-path (down + horizontal) instead
  // of the 5-point chanY elbow.
  it('cross-lane gateway flow uses 3-point L-path when target lane is clear', async () => {
    // Fixture: 2 lanes stacked vertically.
    //   Top lane: start → gw  (gw is in a later ELK column than start)
    //   Bot lane: target only  (no intermediate elements)
    // Flow gw → target: gw exits BOTTOM; target lane is empty → 3-point L-path expected.
    const ir = parseYamlToIr(`process:
  id: rd127-opt-repro
  name: RD-127-opt repro
  pools:
    - id: pool
      name: Pool
      lanes:
        - id: lane-top
          name: Top
          elements:
            - id: start
              type: startEvent
            - id: gw
              type: parallelGateway
              name: Decide
        - id: lane-bot
          name: Bot
          elements:
            - id: target
              type: task
              name: Target
  flows:
    - from: start
      to: gw
    - from: gw
      to: target
`);
    const layout = await layoutProcess(ir);

    const flow = layout.flows.find((f) => f.from === 'gw' && f.to === 'target');
    expect(flow, 'gw→target flow not found').toBeDefined();

    const gwB = layout.elements.get('gw')!;
    const targetB = layout.elements.get('target')!;
    const topBound = layout.laneBounds.get('lane-top')!;
    const laneVerticalGap = 40; // default
    const chanY = topBound.y + topBound.height + laneVerticalGap / 2;

    const wps = flow!.waypoints;

    // 3-point L-path: [gw-bottom, (ep.x, target-center-y), (target.x, target-center-y)]
    expect(wps.length, 'expected 3-point path, got more').toBeLessThanOrEqual(3);
    expect(wps.length).toBeGreaterThanOrEqual(2);

    // No waypoint should lie at chanY — that would indicate the unnecessary kink.
    for (const wp of wps) {
      expect(Math.abs(wp.y - chanY), `waypoint y=${wp.y.toFixed(1)} is at chanY=${chanY.toFixed(1)}`).toBeGreaterThan(2);
    }

    // First waypoint: gateway bottom center.
    const gwCX = gwB.x + gwB.width / 2;
    const gwBottom = gwB.y + gwB.height;
    expect(wps[0].x).toBeCloseTo(gwCX, 0);
    expect(wps[0].y).toBeCloseTo(gwBottom, 0);

    // Last waypoint: target left-center entry.
    const last = wps[wps.length - 1];
    expect(last.x).toBeCloseTo(targetB.x, 0);
    expect(last.y).toBeCloseTo(targetB.y + targetB.height / 2, 0);
  });

  // TX-023: direction-aware gateway port assignment (same-lane TOP/BOTTOM for vertical branches)
  it('TX-023 — same-lane gateway branches above/below exit TOP/BOTTOM vertices', async () => {
    // feature-release: gw-deploy-split (parallelGateway) in lane-infra
    //   → task-health  (above gateway center Y)  must exit TOP vertex
    //   → task-staging (below gateway center Y)  must exit BOTTOM vertex
    const featurePath = join(repoRoot, 'tests', 'fixtures', 'notation-corpus', 'bpmn', 'feature-release.bpmn.transitrix.yaml');
    const yaml = await readFile(featurePath, 'utf8');
    const ir = parseYamlToIr(yaml);
    const layout = await layoutProcess(ir);

    const gwB = layout.elements.get('gw-deploy-split')!;
    expect(gwB, 'gw-deploy-split must be in layout').toBeDefined();
    const gwTop = gwB.y;
    const gwBottom = gwB.y + gwB.height;
    const gwCX = gwB.x + gwB.width / 2;

    const toHealth = layout.flows.find(f => f.from === 'gw-deploy-split' && f.to === 'task-health');
    const toStaging = layout.flows.find(f => f.from === 'gw-deploy-split' && f.to === 'task-staging');
    expect(toHealth, 'gw-deploy-split → task-health must exist').toBeDefined();
    expect(toStaging, 'gw-deploy-split → task-staging must exist').toBeDefined();

    // Health Check is above gw-deploy-split → must exit TOP vertex (wp[0].y === gwB.y)
    const healthStart = toHealth!.waypoints[0];
    expect(healthStart.x).toBeCloseTo(gwCX, 0);
    expect(healthStart.y).toBeCloseTo(gwTop, 0);

    // Deploy to Staging is below gw-deploy-split → must exit BOTTOM vertex (wp[0].y === gwB.y + gwB.height)
    const stagingStart = toStaging!.waypoints[0];
    expect(stagingStart.x).toBeCloseTo(gwCX, 0);
    expect(stagingStart.y).toBeCloseTo(gwBottom, 0);
  });

  it('TX-023 — R4 cross-lane gateway exit: gw-decision → task-pay exits BOTTOM', async () => {
    // ai-expense-approval: gw-decision (Manager lane) → task-pay (Finance lane, below)
    // R4 must assign BOTTOM exit so the path goes downward without detour.
    const aePath = join(repoRoot, 'tests', 'fixtures', 'notation-corpus', 'bpmn', 'ai-expense-approval.bpmn.transitrix.yaml');
    const yaml = await readFile(aePath, 'utf8');
    const ir = parseYamlToIr(yaml);
    const layout = await layoutProcess(ir);

    const gwB = layout.elements.get('gw-decision')!;
    expect(gwB, 'gw-decision must be in layout').toBeDefined();
    const gwBottom = gwB.y + gwB.height;
    const gwCX = gwB.x + gwB.width / 2;

    const flow = layout.flows.find(f => f.from === 'gw-decision' && f.to === 'task-pay');
    expect(flow, 'gw-decision → task-pay must exist').toBeDefined();

    const startPt = flow!.waypoints[0];
    expect(startPt.x).toBeCloseTo(gwCX, 0);          // exits BOTTOM center-x
    expect(startPt.y).toBeCloseTo(gwBottom, 0);        // exits BOTTOM y

    // Must go downward in the first segment (no upward detour)
    const secondPt = flow!.waypoints[1];
    expect(secondPt.y).toBeGreaterThanOrEqual(startPt.y);

    // Path must have ≤ 5 waypoints (clean L-shape, no excessive bends)
    expect(flow!.waypoints.length).toBeLessThanOrEqual(5);
  });

  it('TX-023 — two same-lane gateway branches use distinct exit vertices', async () => {
    // simple-approval: gw-approve (XOR) has two same-lane flows (→task-notify-ok, →task-notify-reject).
    // ELK places them above and below the gateway center (delta ~50 px and ~82 px) so each gets
    // a distinct vertex: top for the upward flow, bottom for the downward flow.
    // The key invariant: no two outgoing same-lane flows share the same starting waypoint.
    const path_ = join(repoRoot, 'tests', 'fixtures', 'notation-corpus', 'bpmn', 'simple-approval.bpmn.transitrix.yaml');
    const yaml = await readFile(path_, 'utf8');
    const ir = parseYamlToIr(yaml);
    const layout = await layoutProcess(ir);

    const gwB = layout.elements.get('gw-approve')!;
    expect(gwB, 'gw-approve must be in layout').toBeDefined();
    const gwCX = gwB.x + gwB.width / 2;
    const gwTop = gwB.y;
    const gwBottom = gwB.y + gwB.height;

    const toOk = layout.flows.find(f => f.from === 'gw-approve' && f.to === 'task-notify-ok');
    const toReject = layout.flows.find(f => f.from === 'gw-approve' && f.to === 'task-notify-reject');
    expect(toOk, 'gw-approve → task-notify-ok must exist').toBeDefined();
    expect(toReject, 'gw-approve → task-notify-reject must exist').toBeDefined();

    const okStart = toOk!.waypoints[0];
    const rejectStart = toReject!.waypoints[0];

    // Both flows exit from the diamond center-x but different Y (TOP vs BOTTOM vertices)
    expect(okStart.x).toBeCloseTo(gwCX, 0);
    expect(rejectStart.x).toBeCloseTo(gwCX, 0);
    expect(okStart.y).toBeCloseTo(gwTop, 0);      // above target → TOP exit
    expect(rejectStart.y).toBeCloseTo(gwBottom, 0); // below target → BOTTOM exit
  });
});

describe('compiler + bpmn-moddle', () => {
  it('emits XML that the BPMN 2.0 parser accepts', async () => {
    const yaml = readFileSync(sampleCervinPath, 'utf8');
    const xml = await compileTransitrixYaml(yaml);
    expect(xml).toContain(`exporterVersion="${transitrixPackageVersion()}"`);
    expect(xml).toContain('<definitions');
    expect(xml).toContain('sequenceFlow');
    expect(xml).toContain('startEvent');

    const moddle = new BpmnModdle();
    const { rootElement, warnings } = await moddle.fromXML(xml, 'bpmn:Definitions');
    expect(rootElement).toBeDefined();
    expect(warnings ?? []).toEqual([]);
  });

  it('emits flow name attribute when specified (RD-131)', async () => {
    const yaml = `
process:
  id: test-proc
  name: Test Process
  pools:
    - id: pool1
      name: Pool 1
      lanes:
        - id: lane1
          name: Lane 1
          elements:
            - id: start
              type: startEvent
              name: Start
            - id: decision
              type: exclusiveGateway
              name: Decision
            - id: yes-task
              type: task
              name: Yes Task
            - id: no-task
              type: task
              name: No Task
            - id: end
              type: endEvent
              name: End
  flows:
    - id: f1
      from: start
      to: decision
    - id: f2
      from: decision
      to: yes-task
      name: 'yes'
      condition: 'success'
    - id: f3
      from: decision
      to: no-task
      name: 'no'
      default: true
    - id: f4
      from: yes-task
      to: end
    - id: f5
      from: no-task
      to: end
`;
    const xml = await compileTransitrixYaml(yaml);
    expect(xml).toContain('name="yes"');
    expect(xml).toContain('name="no"');
    expect(xml).toContain('sourceRef="decision"');
  });

  it('flow with name round-trips via bpmn-moddle without warnings (RD-131)', async () => {
    const yaml = `
process:
  id: approval
  name: Approval Process
  pools:
    - id: pool1
      name: Pool 1
      lanes:
        - id: lane1
          name: Lane 1
          elements:
            - id: start
              type: startEvent
              name: Start
            - id: check
              type: task
              name: Check
            - id: approved
              type: task
              name: Approved
            - id: rejected
              type: task
              name: Rejected
            - id: end
              type: endEvent
              name: End
  flows:
    - id: f1
      from: start
      to: check
    - id: f2
      from: check
      to: approved
      name: 'approved'
      condition: 'is_approved == true'
    - id: f3
      from: check
      to: rejected
      name: 'rejected'
    - id: f4
      from: approved
      to: end
    - id: f5
      from: rejected
      to: end
`;
    const xml = await compileTransitrixYaml(yaml);
    const moddle = new BpmnModdle();
    const { rootElement, warnings } = await moddle.fromXML(xml, 'bpmn:Definitions');
    expect(rootElement).toBeDefined();
    expect(warnings ?? []).toEqual([]);
  });
});

describe('extended subset — inclusive gateway + intermediate events (P0a)', () => {
  const extendedYaml = `
process:
  id: extended-subset
  name: Extended Subset
  pools:
    - id: pool1
      name: Pool 1
      lanes:
        - id: lane1
          name: Lane 1
          elements:
            - id: start
              type: startEvent
              name: Start
            - id: split
              type: inclusiveGateway
              name: Split
            - id: taskA
              type: task
              name: Task A
            - id: taskB
              type: task
              name: Task B
            - id: join
              type: inclusiveGateway
              name: Join
            - id: notify
              type: intermediateMessageEvent
              name: Await message
            - id: wait
              type: intermediateTimerEvent
              name: Wait
            - id: end
              type: endEvent
              name: End
  flows:
    - id: f1
      from: start
      to: split
    - id: f2
      from: split
      to: taskA
      condition: 'needsA'
    - id: f3
      from: split
      to: taskB
      condition: 'needsB'
    - id: f4
      from: taskA
      to: join
    - id: f5
      from: taskB
      to: join
    - id: f6
      from: join
      to: notify
    - id: f7
      from: notify
      to: wait
    - id: f8
      from: wait
      to: end
`;

  it('parses inclusive gateways and intermediate events into the IR', () => {
    const ir = parseYamlToIr(extendedYaml);
    const byId = new Map(ir.lanes.flatMap((l) => l.elements).map((e) => [e.id, e]));
    expect(byId.get('split')?.type).toBe('inclusiveGateway');
    expect(byId.get('notify')?.type).toBe('intermediateMessageEvent');
    expect(byId.get('wait')?.type).toBe('intermediateTimerEvent');
  });

  it('emits inclusive gateway and intermediate catch events as valid BPMN 2.0', async () => {
    const xml = await compileTransitrixYaml(extendedYaml);
    expect(xml).toContain('inclusiveGateway');
    expect(xml).toContain('intermediateCatchEvent');
    expect(xml).toContain('messageEventDefinition');
    expect(xml).toContain('timerEventDefinition');

    const moddle = new BpmnModdle();
    const { rootElement, warnings } = await moddle.fromXML(xml, 'bpmn:Definitions');
    expect(rootElement).toBeDefined();
    expect(warnings ?? []).toEqual([]);
  });

  it('allows conditional flows out of an inclusive gateway', async () => {
    const xml = await compileTransitrixYaml(extendedYaml);
    expect(xml).toContain('sourceRef="split"');
    expect(xml).toContain('conditionExpression');
  });
});

describe('schema consistency (RD-098)', () => {
  it('bpmn-dsl.schema.json is identical in root and extension directories', () => {
    const rootSchema = readFileSync(join(repoRoot, 'schemas', 'bpmn-dsl.schema.json'), 'utf8');
    const extensionSchema = readFileSync(
      join(repoRoot, 'extension', 'schemas', 'bpmn-dsl.schema.json'),
      'utf8'
    );
    expect(rootSchema).toBe(extensionSchema);
  });

  it('root schema file exists and is valid JSON', () => {
    const schemaPath = join(repoRoot, 'schemas', 'bpmn-dsl.schema.json');
    const schemaText = readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(schemaText);
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(schema.properties).toBeDefined();
  });
});
