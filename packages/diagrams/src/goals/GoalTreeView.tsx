import React, { useCallback, useMemo, useState, useEffect } from 'react';
import ReactFlow, {
  Controls,
  MiniMap,
  Background,
  ConnectionLineType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type NodeDragHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { Goal, GoalTree, GoalTreeLayout, LayoutOptions } from './types.js';
import { layoutGoalTree } from './layout.js';
import { reparent, addChild, deleteWithDescendants, moveToBacklog, restoreFromBacklog } from './mutations.js';
import type { ThemeTokens } from './theme.js';
import { resolveTheme } from './theme.js';
import GoalNode, { type GoalNodeData } from './GoalNode.js';

export type { ThemeTokens } from './theme.js';

export interface GoalTreeViewProps {
  tree: GoalTree;
  layout?: GoalTreeLayout;
  layoutOptions?: LayoutOptions;
  theme?: ThemeTokens;
  readOnly?: boolean;
  showBacklog?: boolean;
  defaultBacklogOpen?: boolean;
  showMiniMap?: boolean;
  onChange?: (event: GoalTreeChange) => void;
  onEditRequest?: (goal: Goal) => void;
}

export type GoalTreeChange =
  | { kind: 'reparent'; sourceId: number; targetId: number; result: GoalTree }
  | { kind: 'addChild'; parentId: number; newGoal: Goal; result: GoalTree }
  | { kind: 'delete'; id: number; result: GoalTree }
  | { kind: 'moveToBacklog'; id: number; result: GoalTree }
  | { kind: 'restoreFromBacklog'; id: number; newParentId: number; result: GoalTree };

const BACKLOG_DRAG_MIME = 'application/x-transitrix-goal-id';
const nodeTypes = { goalNode: GoalNode };

/** Where a card was dropped, as classified from the pointer position at drag-stop. */
export type DropTarget = { kind: 'node'; id: number } | { kind: 'backlog' } | null;

/**
 * Pure decision: given where a dragged card was dropped, compute the mutation
 * and the GoalTreeChange to report (or null for a no-op drop). Kept separate
 * from the DOM/pointer-event glue in onNodeDragStop so the mutation-selection
 * logic — which card wins reparent vs moveToBacklog vs a refused mutation —
 * is unit-testable without needing a real drag gesture through reactflow's
 * internal, DOM-measurement-gated dragging.
 */
export function computeDragOutcome(tree: GoalTree, sourceId: number, dropTarget: DropTarget): GoalTreeChange | null {
  if (!dropTarget) return null;
  if (dropTarget.kind === 'backlog') {
    const mutation = moveToBacklog(tree, sourceId);
    if (!mutation.ok || !mutation.result) return null;
    return { kind: 'moveToBacklog', id: sourceId, result: mutation.result };
  }
  if (dropTarget.id === sourceId) return null;
  const mutation = reparent(tree, sourceId, dropTarget.id);
  if (!mutation.ok || !mutation.result) return null;
  return { kind: 'reparent', sourceId, targetId: dropTarget.id, result: mutation.result };
}

/** Goals reachable from a root (level 0 or parent_id 0) via valid parent_id chains. */
function partitionCanvasAndBacklog(goals: Goal[]): { canvas: Goal[]; backlog: Goal[] } {
  const children = new Map<number, Goal[]>();
  for (const g of goals) {
    if (!children.has(g.parent_id)) children.set(g.parent_id, []);
    children.get(g.parent_id)!.push(g);
  }
  const roots = goals.filter((g) => g.level === 0 || g.parent_id === 0);
  const reachable = new Set<number>();
  const stack = [...roots.map((r) => r.id)];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const child of children.get(id) ?? []) stack.push(child.id);
  }
  const canvas: Goal[] = [];
  const backlog: Goal[] = [];
  for (const g of goals) {
    if (reachable.has(g.id)) canvas.push(g);
    else backlog.push(g); // unreachable from any root — broken/orphaned parent chain
  }
  return { canvas, backlog };
}

function GoalTreeViewInner({
  tree,
  layout: layoutProp,
  layoutOptions,
  theme: themeProp,
  readOnly = false,
  showBacklog = false,
  defaultBacklogOpen = true,
  showMiniMap = false,
  onChange,
  onEditRequest,
}: GoalTreeViewProps): React.ReactElement {
  const theme = useMemo(() => resolveTheme(themeProp), [themeProp]);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [isBacklogOpen, setIsBacklogOpen] = useState(defaultBacklogOpen);

  const { canvas: canvasGoals, backlog: backlogGoals } = useMemo(
    () => partitionCanvasAndBacklog(tree.goals),
    [tree.goals],
  );

  const layout = useMemo<GoalTreeLayout>(() => {
    if (layoutProp) return layoutProp;
    const hideCollapsed = [...(layoutOptions?.hideCollapsed ?? []), ...collapsedIds];
    return layoutGoalTree(
      { goal_types: tree.goal_types, goals: canvasGoals },
      { ...layoutOptions, hideCollapsed },
    );
  }, [layoutProp, layoutOptions, collapsedIds, tree.goal_types, canvasGoals]);

  const onAddChild = useCallback(
    (parentId: number, parentLevel: number) => {
      if (readOnly) return;
      const before = new Set(tree.goals.map((g) => g.id));
      const mutation = addChild(tree, parentId, { name: 'New goal', type: '', level: parentLevel + 1, parent_id: parentId });
      if (!mutation.ok || !mutation.result) return;
      const newGoal = mutation.result.goals.find((g) => !before.has(g.id));
      if (!newGoal) return;
      onChange?.({ kind: 'addChild', parentId, newGoal, result: mutation.result });
    },
    [tree, readOnly, onChange],
  );

  const onDeleteNode = useCallback(
    (id: number) => {
      if (readOnly) return;
      const mutation = deleteWithDescendants(tree, id);
      if (!mutation.ok || !mutation.result) return;
      onChange?.({ kind: 'delete', id, result: mutation.result });
    },
    [tree, readOnly, onChange],
  );

  const onRestoreFromBacklog = useCallback(
    (id: number, newParentId: number) => {
      if (readOnly) return;
      const mutation = restoreFromBacklog(tree, id, newParentId);
      if (!mutation.ok || !mutation.result) return;
      onChange?.({ kind: 'restoreFromBacklog', id, newParentId, result: mutation.result });
    },
    [tree, readOnly, onChange],
  );

  const onToggleCollapse = useCallback((id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const buildNodes = useCallback((): Node<GoalNodeData>[] => {
    return layout.nodes.map((n) => ({
      id: String(n.id),
      type: 'goalNode',
      position: { x: n.x, y: n.y },
      draggable: !readOnly,
      data: {
        goal: n.data,
        theme,
        readOnly,
        isDropTarget: hoveredId === n.id,
        hasHiddenChildren: n.hasHiddenChildren,
        isCollapsed: collapsedIds.has(n.id),
        onAddChild,
        onDelete: onDeleteNode,
        onToggleCollapse,
      },
    }));
  }, [layout.nodes, theme, readOnly, hoveredId, collapsedIds, onAddChild, onDeleteNode, onToggleCollapse]);

  const buildEdges = useCallback((): Edge[] => {
    return layout.edges.map((e) => ({
      id: `e${e.source}-${e.target}`,
      source: String(e.source),
      target: String(e.target),
      type: 'default',
      style: { stroke: theme.edgeColor, strokeWidth: theme.edgeWidth },
    }));
  }, [layout.edges, theme]);

  const [nodes, setNodes, onNodesChange] = useNodesState<GoalNodeData>(buildNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges());

  // Re-sync whenever the underlying layout/theme/interaction state changes —
  // tree/layout are host-controlled props, not owned by this component.
  useEffect(() => {
    setNodes(buildNodes());
    setEdges(buildEdges());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, theme, readOnly, hoveredId, collapsedIds]);

  const checkIntersection = useCallback(
    (a: Node<GoalNodeData>, b: Node<GoalNodeData>): boolean => {
      const midX = a.position.x + 125;
      const midY = a.position.y + 40;
      return midX > b.position.x && midX < b.position.x + 250 && midY > b.position.y && midY < b.position.y + 80;
    },
    [],
  );

  const onNodeDrag: NodeDragHandler = useCallback(
    (_event, node) => {
      if (readOnly) return;
      const hit = nodes.find((n) => n.id !== node.id && checkIntersection(node as Node<GoalNodeData>, n));
      setHoveredId(hit ? Number(hit.id) : null);
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
      const dropTarget: DropTarget = dropEl?.closest('[data-goaltree-backlog-zone]')
        ? { kind: 'backlog' }
        : hoveredId != null ? { kind: 'node', id: hoveredId } : null;
      const change = computeDragOutcome(tree, sourceId, dropTarget);
      if (change) onChange?.(change);
      setHoveredId(null);
    },
    [readOnly, hoveredId, tree, onChange],
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const goal = tree.goals.find((g) => g.id === Number(node.id));
      if (goal) onEditRequest?.(goal);
    },
    [tree.goals, onEditRequest],
  );

  const onBacklogItemDragStart = useCallback((event: React.DragEvent, goalId: number) => {
    event.dataTransfer.setData(BACKLOG_DRAG_MIME, String(goalId));
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
      const goalId = Number(idStr);
      const targetEl = document.elementFromPoint(event.clientX, event.clientY);
      const nodeEl = targetEl?.closest('.react-flow__node');
      const targetIdAttr = nodeEl?.getAttribute('data-id');
      if (targetIdAttr == null) return;
      onRestoreFromBacklog(goalId, Number(targetIdAttr));
    },
    [readOnly, onRestoreFromBacklog],
  );

  const showBacklogPanel = showBacklog && backlogGoals.length > 0;

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {showBacklogPanel && (
        <div
          {...(isBacklogOpen ? { 'data-goaltree-backlog-zone': true } : {})}
          style={{
            width: isBacklogOpen ? 220 : 28,
            flexShrink: 0,
            borderRight: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          <button
            type="button"
            aria-label={isBacklogOpen ? 'Collapse backlog' : 'Expand backlog'}
            title={isBacklogOpen ? 'Collapse backlog' : 'Expand backlog'}
            onClick={() => setIsBacklogOpen((v) => !v)}
            style={{
              alignSelf: 'flex-end',
              margin: '6px 6px 0 6px',
              width: 16,
              height: 16,
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              background: '#ffffff',
              color: '#64748b',
              fontSize: 10,
              lineHeight: '14px',
              padding: 0,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {isBacklogOpen ? '◀' : '▶'}
          </button>
          {isBacklogOpen && (
            <div style={{ padding: '4px 10px 10px', overflowY: 'auto', flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#334155', marginBottom: 8 }}>Backlog</div>
              {backlogGoals.map((goal) => (
                <div
                  key={goal.id}
                  draggable={!readOnly}
                  onDragStart={(e) => onBacklogItemDragStart(e, goal.id)}
                  onDoubleClick={() => onEditRequest?.(goal)}
                  title="Drag onto a canvas card to set its parent"
                  style={{
                    padding: 8,
                    marginBottom: 6,
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 11,
                    cursor: readOnly ? 'default' : 'grab',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{goal.name}</div>
                  <div style={{ color: '#64748b' }}>Level: {goal.level}</div>
                </div>
              ))}
            </div>
          )}
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
        </ReactFlow>
      </div>
    </div>
  );
}

export function GoalTreeView(props: GoalTreeViewProps): React.ReactElement {
  return <GoalTreeViewInner {...props} />;
}
