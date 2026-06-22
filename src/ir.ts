export type ElementType =
  | 'startEvent'
  | 'endEvent'
  | 'task'
  | 'userTask'
  | 'serviceTask'
  | 'exclusiveGateway'
  | 'parallelGateway'
  | 'inclusiveGateway'
  | 'intermediateMessageEvent'
  | 'intermediateTimerEvent'
  | 'dataObject';

export const GATEWAY_TYPES = new Set([
  'exclusiveGateway',
  'parallelGateway',
  'inclusiveGateway',
]);

/** Intermediate catch events render as a circle and route like ordinary mid-flow nodes. */
export const INTERMEDIATE_EVENT_TYPES = new Set([
  'intermediateMessageEvent',
  'intermediateTimerEvent',
]);

export const DATA_OBJECT_TYPES = new Set(['dataObject']);

export interface FlowElement {
  id: string;
  type: ElementType;
  name?: string;
  poolId: string;
  laneId: string;
}

export interface SequenceFlowIr {
  id: string;
  from: string;
  to: string;
  condition?: string;
  default?: boolean;
  name?: string;
}

export interface AssociationIr {
  id: string;
  from: string;
  to: string;
}

export interface ProcessIr {
  id: string;
  name: string;
  poolId: string;
  poolName: string;
  lanes: {
    id: string;
    name: string;
    elements: FlowElement[];
  }[];
  flows: SequenceFlowIr[];
  associations?: AssociationIr[];
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedFlowElement extends FlowElement {
  bounds: Bounds;
}

export interface PositionedSequenceFlow extends SequenceFlowIr {
  waypoints: { x: number; y: number }[];
}

export interface PositionedAssociation extends AssociationIr {
  waypoints: { x: number; y: number }[];
}

export interface LayoutIr {
  process: ProcessIr;
  elements: Map<string, Bounds>;
  laneBounds: Map<string, Bounds>;
  poolBounds: Bounds;
  flows: PositionedSequenceFlow[];
  associations: PositionedAssociation[];
}
