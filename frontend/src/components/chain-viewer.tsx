"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { RecordWithId } from "@/lib/types";

const TYPE_COLORS: Record<string, string> = {
  genesis: "#f97316",
  action: "#3b82f6",
  settlement: "#22c55e",
};

export function ChainViewer({ records }: { records: RecordWithId[] }) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = records.map((r, i) => ({
      id: r.id,
      position: { x: i * 300, y: 100 },
      data: {
        label: (
          <div className="text-left p-1">
            <div
              className="text-[11px] font-bold uppercase tracking-wider mb-1"
              style={{ color: TYPE_COLORS[r.record.type] }}
            >
              {r.record.type}
            </div>
            <div className="text-xs text-zinc-300 truncate max-w-[200px]">
              {r.record.action}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono mt-1.5">
              {r.id.slice(0, 16)}&hellip;
            </div>
            {r.record.settlement && (
              <div className="text-[10px] text-green-500 mt-1">
                {r.record.settlement.amount_sats} sats
              </div>
            )}
          </div>
        ),
      },
      style: {
        background: "#18181b",
        border: `2px solid ${TYPE_COLORS[r.record.type] || "#71717a"}`,
        borderRadius: "10px",
        padding: "8px",
        width: 250,
      },
    }));

    const edges: Edge[] = [];
    const idSet = new Set(records.map((r) => r.id));

    records.forEach((r) => {
      if (r.record.prev && idSet.has(r.record.prev)) {
        edges.push({
          id: `prev:${r.record.prev}->${r.id}`,
          source: r.record.prev,
          target: r.id,
          animated: true,
          style: { stroke: "#71717a", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#71717a" },
          label: "prev",
          labelStyle: { fill: "#52525b", fontSize: 10 },
          labelBgStyle: { fill: "#09090b" },
        });
      }
      r.record.memrefs?.forEach((mref) => {
        if (idSet.has(mref)) {
          edges.push({
            id: `memref:${mref}->${r.id}`,
            source: mref,
            target: r.id,
            style: { stroke: "#f97316", strokeDasharray: "5 5", strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#f97316" },
            label: "memref",
            labelStyle: { fill: "#f97316", fontSize: 10 },
            labelBgStyle: { fill: "#09090b" },
          });
        }
      });
    });

    return { nodes, edges };
  }, [records]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      proOptions={{ hideAttribution: true }}
      style={{ background: "#09090b" }}
      nodesDraggable
      nodesConnectable={false}
    >
      <Background color="#27272a" gap={24} size={1} />
      <Controls
        style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
      />
    </ReactFlow>
  );
}
