import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { ThemeTokens } from './dsm-theme.js';

export interface CapabilityRootNodeData {
  label: string;
  theme: Required<ThemeTokens>;
}

/** The virtual organisation root — single node, no maturity dot, no
 *  add/delete/collapse affordances (it isn't a mutable Capability). */
const CapabilityRootNode = memo(({ data }: { data: CapabilityRootNodeData }) => (
  <div
    style={{
      width: 200,
      height: 64,
      background: data.theme.rootFill,
      color: data.theme.rootTextColor,
      borderRadius: 8,
      border: `1px solid ${data.theme.cardBorderColor}`,
      boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      fontWeight: 700,
      fontSize: 12,
      padding: '4px 10px',
    }}
  >
    <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    {data.label}
  </div>
));

CapabilityRootNode.displayName = 'CapabilityRootNode';

export default CapabilityRootNode;
