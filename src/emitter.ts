import { create } from 'xmlbuilder2';

import type { FlowElement, LayoutIr } from './ir.js';
import { transitrixPackageVersion } from './package-version.js';

const BPMN_MODEL = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const BPMN_DI = 'http://www.omg.org/spec/BPMN/20100524/DI';
const DC = 'http://www.omg.org/spec/DD/20100524/DC';
const DI = 'http://www.omg.org/spec/DD/20100524/DI';

function collaborationId(processId: string): string {
  return `Collaboration_${processId}`;
}

function participantBpmnId(poolId: string): string {
  return `Participant_${poolId}`;
}

function appendFlowNode(
  parent: ReturnType<typeof create>,
  el: FlowElement,
  defaultFlowMap?: Map<string, string>,
): void {
  const attrs: Record<string, string> = { id: el.id };
  if (el.name) attrs.name = el.name;
  if (defaultFlowMap?.has(el.id)) {
    attrs.defaultFlowRef = defaultFlowMap.get(el.id)!;
  }
  parent.ele(el.type, attrs);
}

export function emitBpmnXml(layout: LayoutIr): string {
  const { process } = layout;
  const collabId = collaborationId(process.id);

  const definitions = create({ version: '1.0', encoding: 'UTF-8' }).ele('definitions', {
    xmlns: BPMN_MODEL,
    'xmlns:bpmndi': BPMN_DI,
    'xmlns:dc': DC,
    'xmlns:di': DI,
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    id: 'Definitions_1',
    targetNamespace: 'http://bpmn.io/schema/bpmn',
    exporter: 'transitrix',
    exporterVersion: transitrixPackageVersion(),
  });

  const collaboration = definitions.ele('collaboration', { id: collabId });

  collaboration.ele('participant', {
    id: participantBpmnId(process.poolId),
    name: process.poolName,
    processRef: process.id,
  });

  const proc = definitions.ele('process', {
    id: process.id,
    name: process.name,
    isExecutable: 'false',
  });

  const laneSet = proc.ele('laneSet', { id: `LaneSet_${process.id}` });
  for (const lane of process.lanes) {
    const laneEl = laneSet.ele('lane', { id: lane.id, name: lane.name });
    for (const el of lane.elements) {
      laneEl.ele('flowNodeRef').txt(el.id);
    }
  }

  // Build map of gateway -> default flow
  const defaultFlowMap = new Map<string, string>();
  for (const f of layout.flows) {
    if (f.default) {
      defaultFlowMap.set(f.from, f.id);
    }
  }

  const sortedElements = [...process.lanes.flatMap((l) => l.elements)].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  for (const el of sortedElements) {
    appendFlowNode(proc, el, defaultFlowMap);
  }

  const sortedFlows = [...layout.flows].sort((a, b) => a.id.localeCompare(b.id));
  for (const f of sortedFlows) {
    const attrs: Record<string, string> = { id: f.id, sourceRef: f.from, targetRef: f.to };
    if (f.name) attrs.name = f.name;
    const seq = proc.ele('sequenceFlow', attrs);
    if (f.condition) {
      seq
        .ele('conditionExpression', {
          'xsi:type': 'tFormalExpression',
        })
        .txt(f.condition);
    }
  }

  const diagram = definitions.ele('bpmndi:BPMNDiagram', { id: 'BPMNDiagram_1' });
  const plane = diagram.ele('bpmndi:BPMNPlane', {
    id: 'BPMNPlane_1',
    bpmnElement: collabId,
  });

  const pb = layout.poolBounds;
  plane
    .ele('bpmndi:BPMNShape', {
      id: `Shape_${participantBpmnId(process.poolId)}`,
      bpmnElement: participantBpmnId(process.poolId),
      isHorizontal: 'true',
    })
    .ele('dc:Bounds', {
      x: String(pb.x),
      y: String(pb.y),
      width: String(pb.width),
      height: String(pb.height),
    });

  for (const lane of process.lanes) {
    const lb = layout.laneBounds.get(lane.id);
    if (!lb) throw new Error(`Missing layout bounds for lane ${lane.id}`);
    plane
      .ele('bpmndi:BPMNShape', {
        id: `Shape_Lane_${lane.id}`,
        bpmnElement: lane.id,
        isHorizontal: 'true',
      })
      .ele('dc:Bounds', {
        x: String(lb.x),
        y: String(lb.y),
        width: String(lb.width),
        height: String(lb.height),
      });
  }

  for (const el of sortedElements) {
    const b = layout.elements.get(el.id);
    if (!b) throw new Error(`Missing layout bounds for flow node ${el.id}`);
    const shapeAttrs: Record<string, string> = {
      id: `Shape_${el.id}`,
      bpmnElement: el.id,
    };
    if (el.type === 'exclusiveGateway' || el.type === 'parallelGateway') {
      shapeAttrs.isMarkerVisible = 'true';
    }
    const shape = plane.ele('bpmndi:BPMNShape', shapeAttrs);
    shape.ele('dc:Bounds', {
      x: String(b.x),
      y: String(b.y),
      width: String(b.width),
      height: String(b.height),
    });
  }

  for (const f of sortedFlows) {
    const edge = plane.ele('bpmndi:BPMNEdge', {
      id: `Edge_${f.id}`,
      bpmnElement: f.id,
    });
    const wps =
      f.waypoints.length >= 2
        ? f.waypoints
        : defaultWaypoints(layout, f.from, f.to);
    for (const p of wps) {
      edge.ele('di:waypoint', { x: String(Math.round(p.x)), y: String(Math.round(p.y)) });
    }
  }

  return definitions.end({ prettyPrint: true });
}

function defaultWaypoints(
  layout: LayoutIr,
  from: string,
  to: string,
): { x: number; y: number }[] {
  const a = layout.elements.get(from);
  const b = layout.elements.get(to);
  if (!a || !b) {
    throw new Error(
      `Layout invariant violated: missing bounds for flow "${from}" → "${to}" (${!a ? from : to} not found)`,
    );
  }
  return [
    { x: a.x + a.width / 2, y: a.y + a.height / 2 },
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
  ];
}
