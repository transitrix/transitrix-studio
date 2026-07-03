import React, { useCallback, useMemo, useState, useEffect } from 'react';
import ReactFlow, {
  Controls,
  MiniMap,
  Background,
  Panel,
  ConnectionLineType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type NodeDragHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { Capability, CapabilityMap, CapabilityMapLayout, LayoutOptions } from './dsm-schema.js';
import { layoutCapabilityMap } from './dsm-layout.js';
import { reparent, addChild, deleteWithDescendants, moveBranchToBacklog, restoreFromBacklog, normaliseAddresses } from './dsm-mutations.js';
import type { ThemeTokens } from './dsm-theme.js';
import { resolveTheme, DEFAULT_MATURITY_COLOURS } from './dsm-theme.js';
import CapabilityCardNode, { type CapabilityCardNodeData } from './CapabilityCardNode.js';
import CapabilityRootNode, { type CapabilityRootNodeData } from './CapabilityRootNode.js';

export type { ThemeTokens } from './dsm-theme.js';

export interface CapabilityMapViewProps {
  map: CapabilityMap;
  layout?: CapabilityMapLayout;
  layoutOptions?: LayoutOptions;
  theme?: ThemeTokens;
  readOnly?: boolean;
  showBacklog?: boolean;
  showMiniMap?: boolean;
  maturityColours?: Record<number, string>;
  selectedSet?: string;
  onChange?: (event: CapabilityMapChange) => void;
  onEditRequest?: (cap: Capability) => void;
}

export type CapabilityMapChange =
  | { kind: 'reparent'; sourceId: number; targetId: number; result: CapabilityMap }
  | { kind: 'addChild'; parentId: number; newCap: Capability; result: CapabilityMap }
  | { kind: 'delete'; id: number; result: CapabilityMap }
  | { kind: 'moveBranchToBacklog'; id: number; result: CapabilityMap }
  | { kind: 'restoreFromBacklog'; id: number; parentId: number; result: CapabilityMap }
  | { kind: 'normaliseAddresses'; result: CapabilityMap };

const BACKLOG_DRAG_MIME = 'application/x-transitrix-capability-id';
const ROOT_NODE_ID = '__root__';
const nodeTypes = { capabilityCard: CapabilityCardNode, capabilityRoot: CapabilityRootNode };

/** Where a card was dropped, as classified from the pointer position at
 *  drag-stop — mirrors goals' computeDragOutcome split (see GoalTreeView.tsx)
 *  so the reparent/moveBranchToBacklog decision is unit-testable without a
 *  live drag through reactflow's DOM-measurement-gated dragging. */
export type DropTarget = { kind: 'node'; id: number } | { kind: 'root' } | { kind: 'backlog' } | null;

export function computeDragOutcome(map: CapabilityMap, sourceId: number, dropTarget: DropTarget): CapabilityMapChange | null {
  if (!dropTarget) return null;
  if (dropTarget.kind === 'backlog') {
    const mutation = moveBranchToBacklog(map, sourceId);
    if (!mutation.ok || !mutation.result) return null;
    return { kind: 'moveBranchToBacklog', id: sourceId, result: mutation.result };
  }
  const targetId = dropTarget.kind === 'root' ? 0 : dropTarget.id;
  if (targetId === sourceId) return null;
  const mutation = reparent(map, sourceId, targetId);
  if (!mutation.ok || !mutation.result) return null;
  return { kind: 'reparent', sourceId, targetId, result: mutation.result };
}

function CapabilityMapViewInner({
  map,
  layout: layoutProp,
  layoutOptions,
  theme: themeProp,
  readOnly = false,
  showBacklog = false,
  showMiniMap = false,
  maturityColours = DEFAULT_MATURITY_COLOURS,
  onChange,
  onEditRequest,
}: CapabilityMapViewProps): React.ReactElement {
  const theme = useMemo(() => resolveTheme(themeProp), [themeProp]);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const [hoveredId, setHoveredId] = useState<number | 'root' | null>(null);

  const backlogCaps = useMemo(() => map.capabilities.filter((c) => c.backlog), [map.capabilities]);

  const layout = useMemo<CapabilityMapLayout>(() => {
    if (layoutProp) return layoutProp;
    const hideCollapsed = [...(layoutOptions?.hideCollapsed ?? []), ...collapsedIds];
    return layoutCapabilityMap(map, { ...layoutOptions, hideCollapsed });
  }, [layoutProp, layoutOptions, collapsedIds, map]);

  const rootLabel = layoutOptions?.organisationLabel ?? map.organisation;

  const onAddChild = useCallback(
    (parentId: number) => {
      if (readOnly) return;
      const before = new Set(map.capabilities.map((c) => c.id));
      const mutation = addChild(map, parentId, { name: 'New capability' });
      if (!mutation.ok || !mutation.result) return;
      const newCap = mutation.result.capabilities.find((c) => !before.has(c.id));
      if (!newCap) return;
      onChange?.({ kind: 'addChild', parentId, newCap, result: mutation.result });
    },
    [map, readOnly, onChange],
  );

  const onDeleteNode = useCallback(
    (id: number) => {
      if (readOnly) return;
      const mutation = deleteWithDescendants(map, id);
      if (!mutation.ok || !mutation.result) return;
      onChange?.({ kind: 'delete', id, result: mutation.result });
    },
    [map, readOnly, onChange],
  );

  const onRestoreFromBacklog = useCallback(
    (id: number, parentId: number) => {
      if (readOnly) return;
      const mutation = restoreFromBacklog(map, id, parentId);
      if (!mutation.ok || !mutation.result) return;
      onChange?.({ kind: 'restoreFromBacklog', id, parentId, result: mutation.result });
    },
    [map, readOnly, onChange],
  );

  const onNormalise = useCallback(() => {
    if (readOnly) return;
    onChange?.({ kind: 'normaliseAddresses', result: normaliseAddresses(map) });
  }, [map, readOnly, onChange]);

  const onToggleCollapse = useCallback((id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const buildNodes = useCallback((): Node[] => {
    const rootNode: Node<CapabilityRootNodeData> = {
      id: ROOT_NODE_ID,
      type: 'capabilityRoot',
      position: { x: layout.rootNode.x, y: layout.rootNode.y },
      draggable: false,
      data: { label: rootLabel, theme },
    };
    const cardNodes: Node<CapabilityCardNodeData>[] = layout.nodes.map((n) => ({
      id: String(n.id),
      type: 'capabilityCard',
      position: { x: n.x, y: n.y },
      draggable: !readOnly,
      data: {
        capability: n.data!,
        theme,
        maturityColours,
        readOnly,
        isDropTarget: hoveredId === n.id,
        hasHiddenChildren: n.hasHiddenChildren,
        isCollapsed: collapsedIds.has(n.id),
        onAddChild,
        onDelete: onDeleteNode,
        onToggleCollapse,
      },
    }));
    return [rootNode, ...cardNodes];
  }, [layout, theme, rootLabel, readOnly, hoveredId, collapsedIds, maturityColours, onAddChild, onDeleteNode, onToggleCollapse]);

  const buildEdges = useCallback((): Edge[] => {
    return layout.edges.map((e) => ({
      id: `e${e.source}-${e.target}`,
      source: e.source === 'root' ? ROOT_NODE_ID : String(e.source),
      target: String(e.target),
      type: 'default',
      style: { stroke: theme.edgeColor, strokeWidth: theme.edgeWidth },
    }));
  }, [layout.edges, theme]);

  const [nodes, setNodes, onNodesChange] = useNodesState(buildNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges());

  useEffect(() => {
    setNodes(buildNodes());
    setEdges(buildEdges());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, theme, readOnly, hoveredId, collapsedIds, maturityColours]);

  const checkIntersection = useCallback((a: Node, b: Node): boolean => {
    const midX = a.position.x + 125;
    const midY = a.position.y + 32;
    return midX > b.position.x && midX < b.position.x + 250 && midY > b.position.y && midY < b.position.y + 64;
  }, []);

  const onNodeDrag: NodeDragHandler = useCallback(
    (_event, node) => {
      if (readOnly) return;
      const hit = nodes.find((n) => n.id !== node.id && checkIntersection(node, n));
      if (!hit) {
        setHoveredId(null);
      } else {
        setHoveredId(hit.id === ROOT_NODE_ID ? 'root' : Number(hit.id));
      }
    },
    [readOnly, nodes, checkIntersection],
  );

  const onNodeDragStop: NodeDragHandler = useCallback(
    (event, node) => {
      if (readOnly) {
        setHoveredId(null);
        return;
      }
      const sourceId = Number(node.id);
      const mouseEvent = event as unknown as MouseEvent;
      const dropEl = typeof document !== 'undefined' && 'clientX' in mouseEvent
        ? document.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY)
        : null;
      let dropTarget: DropTarget;
      if (dropEl?.closest('[data-capmap-backlog-zone]')) dropTarget = { kind: 'backlog' };
      else if (hoveredId === 'root') dropTarget = { kind: 'root' };
      else if (hoveredId != null) dropTarget = { kind: 'node', id: hoveredId };
      else dropTarget = null;
      const change = computeDragOutcome(map, sourceId, dropTarget);
      if (change) onChange?.(change);
      setHoveredId(null);
    },
    [readOnly, hoveredId, map, onChange],
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const cap = map.capabilities.find((c) => c.id === Number(node.id));
      if (cap) onEditRequest?.(cap);
    },
    [map.capabilities, onEditRequest],
  );

  const onBacklogItemDragStart = useCallback((event: React.DragEvent, capId: number) => {
    event.dataTransfer.setData(BACKLOG_DRAG_MIME, String(capId));
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const onCanvasDragOver = useCallback(
    (event: React.DragEvent) => {
      if (readOnly) return;
      event.preventDefault();
    },
    [readOnly],
  );

  const onCanvasDrop = useCallback(
    (event: React.DragEvent) => {
      if (readOnly) return;
      event.preventDefault();
      const idStr = event.dataTransfer.getData(BACKLOG_DRAG_MIME);
      if (!idStr) return;
      const capId = Number(idStr);
      const targetEl = document.elementFromPoint(event.clientX, event.clientY);
      const nodeEl = targetEl?.closest('.react-flow__node');
      const targetIdAttr = nodeEl?.getAttribute('data-id');
      if (targetIdAttr == null) return;
      const parentId = targetIdAttr === ROOT_NODE_ID ? 0 : Number(targetIdAttr);
      onRestoreFromBacklog(capId, parentId);
    },
    [readOnly, onRestoreFromBacklog],
  );

  const showBacklogPanel = showBacklog && backlogCaps.length > 0;

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {showBacklogPanel && (
        <div
          data-capmap-backlog-zone
          style={{ width: 220, flexShrink: 0, borderRight: '1px solid #e2e8f0', padding: 10, overflowY: 'auto', background: '#f8fafc' }}
        >
          <div style={{ fontWeight: 700, fontSize: 12, color: '#334155', marginBottom: 8 }}>Backlog</div>
          {backlogCaps.map((cap) => (
            <div
              key={cap.id}
              draggable={!readOnly}
              onDragStart={(e) => onBacklogItemDragStart(e, cap.id)}
              onDoubleClick={() => onEditRequest?.(cap)}
              title="Drag onto a card (or the root) to set its parent"
              style={{ padding: 8, marginBottom: 6, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 11, cursor: readOnly ? 'default' : 'grab' }}
            >
              <div style={{ fontWeight: 600 }}>{cap.name}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, position: 'relative' }} onDragOver={onCanvasDragOver} onDrop={onCanvasDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={readOnly ? undefined : onNodesChange}
          onEdgesChange={readOnly ? undefined : onEdgesChange}
          nodeTypes={nodeTypes}
          nodesDraggable={!readOnly}
          nodesConnectable={false}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={onNodeDoubleClick}
          connectionLineType={ConnectionLineType.Bezier}
          fitView
        >
          <Background />
          <Controls />
          {showMiniMap && <MiniMap pannable zoomable />}
          {!readOnly && (
            <Panel position="top-right">
              <button type="button" onClick={onNormalise} style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}>
                Normalise addresses
              </button>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </div>
  );
}

export function CapabilityMapView(props: CapabilityMapViewProps): React.ReactElement {
  return <CapabilityMapViewInner {...props} />;
}
