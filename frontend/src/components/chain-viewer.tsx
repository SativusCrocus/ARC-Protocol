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
  genesis: "#F7931A",
  action: "#00F0FF",
  settlement: "#22c55e",
};

const TYPE_GLOW: Record<string, string> = {
  genesis: "0 0 24px rgba(247,147,26,0.35), inset 0 0 16px rgba(247,147,26,0.1)",
  action: "0 0 24px rgba(0,240,255,0.25), inset 0 0 16px rgba(0,240,255,0.08)",
  settlement: "0 0 24px rgba(34,197,94,0.25), inset 0 0 16px rgba(34,197,94,0.08)",
};

export function ChainViewer({ records }: { records: RecordWithId[] }) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = records.map((r, i) => ({
      id: r.id,
      position: { x: i * 320, y: 80 },
      data: {
        label: (
          <div className="text-left p-1">
            <div
              className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
              style={{ color: TYPE_COLORS[r.record.type] }}
            >
              {r.record.type}
            </div>
            <div className="text-[11px] text-white/70 truncate max-w-[180px] leading-snug">
              {r.record.action}
            </div>
            <div className="text-[9px] text-white/25 font-mono mt-2">
              {r.id.slice(0, 16)}&hellip;
            </div>
            {r.record.settlement && (
              <div className="text-[10px] text-emerald-400 mt-1 font-medium">
                {r.record.settlement.amount_sats.toLocaleString()} sats
              </div>
            )}
          </div>
        ),
      },
      style: {
        background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.03) 0%, #0a0a0a 70%)",
        border: `1.5px solid ${TYPE_COLORS[r.record.type] || "#333"}40`,
        borderRadius: "14px",
        padding: "10px",
        width: 220,
        boxShadow: TYPE_GLOW[r.record.type] || "none",
        transition: "box-shadow 0.3s ease, transform 0.2s ease",
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
          style: { stroke: "#ffffff15", strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#ffffff30",
          },
          label: "\u2713",
          labelStyle: { fill: "#22c55e", fontSize: 11, fontWeight: 700 },
          labelBgStyle: { fill: "#000000", fillOpacity: 0.8 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        });
      }
      r.record.memrefs?.forEach((mref) => {
        if (idSet.has(mref)) {
          edges.push({
            id: `memref:${mref}->${r.id}`,
            source: mref,
            target: r.id,
            style: {
              stroke: "#F7931A",
              strokeDasharray: "4 4",
              strokeWidth: 1,
              strokeOpacity: 0.4,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#F7931A60",
            },
            label: "ref",
            labelStyle: { fill: "#F7931A80", fontSize: 9 },
            labelBgStyle: { fill: "#000000", fillOpacity: 0.8 },
            labelBgPadding: [3, 2] as [number, number],
            labelBgBorderRadius: 3,
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
      style={{ background: "#000000" }}
      nodesDraggable
      nodesConnectable={false}
    >
      <Background color="#ffffff08" gap={32} size={1} />
      <Controls
        style={{
          background: "#111111",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "10px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}
      />
    </ReactFlow>
  );
}
