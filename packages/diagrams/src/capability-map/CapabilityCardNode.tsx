import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { Capability } from './dsm-schema.js';
import type { ThemeTokens } from './dsm-theme.js';

const CARD_WIDTH = 250;
const CARD_HEIGHT = 64;

function latestMaturityLevel(cap: Capability): number | undefined {
  if (!cap.maturity || cap.maturity.length === 0) return undefined;
  return [...cap.maturity].sort((a, b) => b.date.localeCompare(a.date))[0].level;
}

export interface CapabilityCardNodeData {
  capability: Capability;
  theme: Required<ThemeTokens>;
  maturityColours: Record<number, string>;
  readOnly: boolean;
  isDropTarget: boolean;
  hasHiddenChildren: boolean;
  isCollapsed: boolean;
  onAddChild: (parentId: number) => void;
  onDelete: (id: number) => void;
  onToggleCollapse: (id: number) => void;
}

const CapabilityCardNode = memo(({ data }: { data: CapabilityCardNodeData }) => {
  const { capability, theme, maturityColours, readOnly, isDropTarget, hasHiddenChildren, isCollapsed } = data;
  const maturity = latestMaturityLevel(capability);
  const dotColour = maturity !== undefined ? maturityColours[maturity] : undefined;

  return (
    <div
      style={{
        position: 'relative',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        background: theme.cardFill,
        borderRadius: 8,
        borderStyle: 'solid',
        borderWidth: isDropTarget ? 2 : theme.cardBorderWidth,
        borderColor: isDropTarget ? theme.dropTargetBorderColor : theme.cardBorderColor,
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      {dotColour && (
        <span
          title={`Maturity ${maturity}`}
          aria-label={`Maturity ${maturity}`}
          style={{
            position: 'absolute', top: 6, left: 6, width: 8, height: 8, borderRadius: '50%', background: dotColour,
          }}
        />
      )}

      <div
        title={capability.name}
        style={{
          fontWeight: 600,
          fontSize: 12,
          color: theme.cardTextColor,
          marginLeft: dotColour ? 12 : 0,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          wordBreak: 'break-word',
          lineHeight: 1.2,
        }}
      >
        {capability.name}
      </div>
      <div style={{ fontSize: 10, color: theme.cardMetaColor, marginTop: 2, marginLeft: dotColour ? 12 : 0 }}>
        {capability.address}
      </div>

      {!readOnly && (
        <button
          type="button"
          aria-label="Add child capability"
          title="Add child capability"
          onClick={(e) => {
            e.stopPropagation();
            data.onAddChild(capability.id);
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
          aria-label="Delete capability"
          title="Delete capability and descendants"
          onClick={(e) => {
            e.stopPropagation();
            data.onDelete(capability.id);
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
            data.onToggleCollapse(capability.id);
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

CapabilityCardNode.displayName = 'CapabilityCardNode';

export default CapabilityCardNode;
