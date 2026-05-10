import React, { memo } from "react";
import { Handle, Position } from "reactflow";

const NODE_WIDTH = 250;
const NODE_HEIGHT = 80;

export interface FGCAChangeNodeProps {
  data: {
    id: number;
    name: string;
    borderColor?: string;
    borderWidth?: number;
  };
  isConnectable?: boolean;
}

const FGCAChangeNode = memo(({ data, isConnectable }: FGCAChangeNodeProps) => (
  <div
    style={{
      background: "#dbeafe",
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      padding: "6px 8px",
      fontSize: "12px",
      borderColor: data.borderColor ?? "#94a3b8",
      borderWidth: data.borderWidth ?? 1,
      borderStyle: "solid",
      borderRadius: "0.75rem",
      boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center",
      color: "#1e293b",
    }}
  >
    <Handle type="target" position={Position.Left} isConnectable={isConnectable} style={{ background: "#555" }} />
    <Handle type="source" position={Position.Right} isConnectable={false} style={{ background: "#555" }} />
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
    <div style={{ fontSize: "10px", color: "#64748b", marginTop: 2 }}>
      C-{String(data.id).padStart(3, "0")}
    </div>
  </div>
));

FGCAChangeNode.displayName = "FGCAChangeNode";

export default FGCAChangeNode;
