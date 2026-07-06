import React, { memo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { Factor, Goal } from './types.js';
import { displayGoalId } from './parse-canonical.js';
import type { ThemeTokens } from './theme.js';

const NODE_WIDTH = 250;
const NODE_HEIGHT = 80;

function impactSign(f: Factor): 'positive' | 'negative' | 'both' {
  const t = f.impact_type;
  if (t === 'mixed') return 'both';
  if (t === 'opportunity' || t === 'positive') return 'positive';
  return 'negative';
}

export interface GoalNodeData {
  goal: Goal;
  theme: Required<ThemeTokens>;
  readOnly: boolean;
  isDropTarget: boolean;
  hasHiddenChildren: boolean;
  isCollapsed: boolean;
  onAddChild: (parentId: number, parentLevel: number) => void;
  onDelete: (id: number) => void;
  onToggleCollapse: (id: number) => void;
  onFactorClick?: (factor: Factor) => void;
}

const GoalNode = memo(({ data }: { data: GoalNodeData }) => {
  const { goal, theme, readOnly, isDropTarget, hasHiddenChildren, isCollapsed } = data;
  const [openPanel, setOpenPanel] = useState<'positive' | 'negative' | null>(null);

  const positive = (goal.factors ?? []).filter((f) => impactSign(f) !== 'negative');
  const negative = (goal.factors ?? []).filter((f) => impactSign(f) !== 'positive');
  const bg = theme.goalLevelColors[goal.level] ?? theme.goalLevelColors[0];

  return (
    <div
      className="tx-goal-node"
      style={{
        position: 'relative',
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: bg,
        borderRadius: 12,
        borderStyle: 'solid',
        borderWidth: isDropTarget ? 2 : theme.cardBorderWidth,
        borderColor: isDropTarget ? theme.dropTargetBorderColor : theme.cardBorderColor,
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        padding: '6px 8px',
        fontSize: 12,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', width: 16 }}>
        {positive.length > 0 && (
          <span
            role="button"
            aria-label={`${positive.length} positive factor${positive.length > 1 ? 's' : ''}`}
            title={`${positive.length} positive factor${positive.length > 1 ? 's' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenPanel(openPanel === 'positive' ? null : 'positive');
            }}
            style={{ cursor: 'pointer', color: '#16a34a', fontSize: 14, lineHeight: 1, userSelect: 'none' }}
          >
            &#9650;
            {positive.length > 1 && <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 2 }}>{positive.length}</span>}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', padding: '0 4px' }}>
        <div
          title={goal.name}
          style={{
            fontWeight: 600,
            color: theme.cardTextColor,
            lineHeight: 1.2,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            wordBreak: 'break-word',
          }}
        >
          {goal.name}
        </div>
        <div style={{ fontSize: 10, color: theme.cardMetaColor, marginTop: 2 }}>
          ID: {displayGoalId(goal)} | Lvl: {goal.level}
          {goal.tag ? ` | #${goal.tag}` : ''}
        </div>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', width: 16, justifyContent: 'flex-end' }}>
        {negative.length > 0 && (
          <span
            role="button"
            aria-label={`${negative.length} negative factor${negative.length > 1 ? 's' : ''}`}
            title={`${negative.length} negative factor${negative.length > 1 ? 's' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenPanel(openPanel === 'negative' ? null : 'negative');
            }}
            style={{ cursor: 'pointer', color: '#dc2626', fontSize: 14, lineHeight: 1, userSelect: 'none' }}
          >
            &#9660;
            {negative.length > 1 && <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 2 }}>{negative.length}</span>}
          </span>
        )}
      </div>

      {openPanel && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: '100%',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            ...(openPanel === 'positive' ? { bottom: 'calc(100% + 8px)' } : { top: 'calc(100% + 8px)' }),
          }}
        >
          {(openPanel === 'positive' ? positive : negative).map((f) => (
            <div
              key={f.id}
              onClick={(e) => {
                e.stopPropagation();
                data.onFactorClick?.(f);
              }}
              style={{
                background: openPanel === 'positive' ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${openPanel === 'positive' ? '#bbf7d0' : '#fecaca'}`,
                color: openPanel === 'positive' ? '#166534' : '#991b1b',
                borderRadius: 4,
                padding: '4px 6px',
                fontSize: 10,
                textAlign: 'left',
                cursor: data.onFactorClick ? 'pointer' : 'default',
              }}
            >
              <div style={{ fontWeight: 700 }}>{f.name}</div>
              {f.description && <div style={{ opacity: 0.85 }}>{f.description}</div>}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <button
          type="button"
          aria-label="Add child goal"
          title="Add child goal"
          onClick={(e) => {
            e.stopPropagation();
            data.onAddChild(goal.id, goal.level);
          }}
          style={{
            position: 'absolute', top: -8, right: -8, width: 16, height: 16,
            borderRadius: '50%', border: '1px solid #86efac', background: '#ffffff',
            color: '#16a34a', fontSize: 11, lineHeight: '14px', padding: 0, cursor: 'pointer',
          }}
        >
          +
        </button>
      )}

      {!readOnly && (
        <button
          type="button"
          aria-label="Delete goal"
          title="Delete goal and descendants"
          onClick={(e) => {
            e.stopPropagation();
            data.onDelete(goal.id);
          }}
          style={{
            position: 'absolute', bottom: -8, right: -8, width: 16, height: 16,
            borderRadius: '50%', border: '1px solid #fca5a5', background: '#ffffff',
            color: '#dc2626', fontSize: 11, lineHeight: '14px', padding: 0, cursor: 'pointer',
          }}
        >
          &times;
        </button>
      )}

      {hasHiddenChildren && (
        <button
          type="button"
          aria-label={isCollapsed ? 'Expand branch' : 'Collapse branch'}
          title={isCollapsed ? 'Expand branch' : 'Collapse branch'}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggleCollapse(goal.id);
          }}
          style={{
            position: 'absolute', top: '50%', right: -8, transform: 'translateY(-50%)',
            width: 16, height: 16, borderRadius: '50%', border: `1px solid ${theme.cardBorderColor}`,
            background: '#ffffff', color: theme.cardBorderColor, fontSize: 11, lineHeight: '14px', padding: 0, cursor: 'pointer',
          }}
        >
          {isCollapsed ? '+' : '−'}
        </button>
      )}
    </div>
  );
});

GoalNode.displayName = 'GoalNode';

export default GoalNode;
