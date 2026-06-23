import React, { memo } from "react";
import { Handle, Position } from "reactflow";

const NODE_WIDTH = 250;
const NODE_HEIGHT = 80;

export interface FGCADriverNodeProps {
  data: {
    id: number;
    name: string;
    borderColor?: string;
    borderWidth?: number;
  };
  isConnectable?: boolean;
}

const FGCADriverNode = memo(({ data, isConnectable }: FGCADriverNodeProps) => (
  <div
    style={{
      background: "var(--ts-layer-driver)",
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      padding: "6px 8px",
      fontSize: "12px",
      borderColor: data.borderColor ?? "var(--ts-node-stroke)",
      borderWidth: data.borderWidth ?? 1,
      borderStyle: "solid",
      borderRadius: "0.75rem",
      boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center",
      color: "var(--ts-text-primary)",
    }}
  >
    <Handle type="target" position={Position.Left} isConnectable={false} style={{ background: "var(--ts-node-stroke)" }} />
    <Handle type="source" position={Position.Right} isConnectable={isConnectable} style={{ background: "var(--ts-node-stroke)" }} />
    <div
      style={{
        fontWeight: 600,
        lineHeight: 1.2,
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        wordBreak: "break-word",
        padding: "0 4px",
        width: "100%",
      }}
      title={data.name}
    >
      {data.name}
    </div>
    <div style={{ fontSize: "10px", color: "var(--ts-text-secondary)", marginTop: 2 }}>
      D-{String(data.id).padStart(4, "0")}
    </div>
  </div>
));

FGCADriverNode.displayName = "FGCADriverNode";

export default FGCADriverNode;
