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
import { Zap, Link2 } from "lucide-react";
import type { RecordWithId } from "@/lib/types";
import { getAgentColor } from "@/lib/agent-colors";

// ── DAG Layout ─────────────────────────────────────────────────────────────

function layoutDAG(records: RecordWithId[]): { nodes: Node[]; edges: Edge[] } {
  const idSet = new Set(records.map((r) => r.id));

  // Group by agent
  const agentGroups = new Map<string, number[]>();
  records.forEach((r, i) => {
    const pk = r.record.agent.pubkey;
    if (!agentGroups.has(pk)) agentGroups.set(pk, []);
    agentGroups.get(pk)!.push(i);
  });

  // Sort lanes by record count (largest first) so the longest chain anchors the top
  const agentKeys = Array.from(agentGroups.keys()).sort(
    (a, b) => agentGroups.get(b)!.length - agentGroups.get(a)!.length,
  );
  const laneHeight = 150;
  const nodeSpacing = 230;
  const nodeWidth = 200;

  const positions = new Map<string, { x: number; y: number }>();
  agentKeys.forEach((pk, laneIdx) => {
    const indices = agentGroups.get(pk)!;
    indices.forEach((recIdx, posInLane) => {
      const r = records[recIdx];
      positions.set(r.id, {
        x: posInLane * nodeSpacing,
        y: laneIdx * laneHeight,
      });
    });
  });

  const nodes: Node[] = records.map((r) => {
    const pos = positions.get(r.id) || { x: 0, y: 0 };
    const agentColor = getAgentColor(r.record.agent.pubkey, r.record.agent.alias);
    const isSettlement = r.record.type === "settlement";
    const isGenesis = r.record.type === "genesis";
    const hasMemrefs = r.record.memrefs.length > 0;

    return {
      id: r.id,
      position: pos,
      data: {
        label: (
          <div className="text-left p-1.5 select-none">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div
                className="h-2 w-2 rounded-full animate-pulse"
                style={{
                  backgroundColor: agentColor.color,
                  boxShadow: `0 0 8px ${agentColor.glow}`,
                }}
              />
              <span
                className="text-[9px] font-bold uppercase tracking-[0.15em]"
                style={{ color: agentColor.color }}
              >
                {agentColor.label}
              </span>
              <span className="text-[8px] text-white/20 ml-auto">
                {r.record.type}
              </span>
            </div>
            <div className="text-[11px] text-white/70 truncate max-w-[200px] leading-snug">
              {r.record.action}
            </div>
            <div className="text-[8px] text-white/20 font-mono mt-1.5">
              {r.id.slice(0, 20)}&hellip;
            </div>
            {hasMemrefs && (
              <div className="flex items-center gap-1 mt-1.5">
                <Link2 className="h-2.5 w-2.5 text-[#F7931A]/50" />
                <span className="text-[8px] text-[#F7931A]/50">
                  {r.record.memrefs.length} ref{r.record.memrefs.length > 1 ? "s" : ""}
                </span>
              </div>
            )}
            {isSettlement && r.record.settlement && (
              <div className="flex items-center gap-1 mt-1.5">
                <Zap className="h-2.5 w-2.5 text-emerald-400" />
                <span className="text-[9px] text-emerald-400 font-medium">
                  {r.record.settlement.amount_sats} sats
                </span>
              </div>
            )}
          </div>
        ),
      },
      style: {
        background: `radial-gradient(ellipse at 30% 20%, ${agentColor.color}08 0%, #0a0a0a 70%)`,
        border: `1.5px solid ${agentColor.color}${isGenesis ? "60" : "30"}`,
        borderRadius: "14px",
        padding: "8px",
        width: nodeWidth,
        cursor: "pointer",
        boxShadow: isGenesis
          ? `0 0 32px ${agentColor.glow}, inset 0 0 20px ${agentColor.color}10`
          : hasMemrefs
            ? `0 0 20px ${agentColor.glow.replace("0.4", "0.2")}, 0 0 40px ${agentColor.glow.replace("0.4", "0.05")}`
            : `0 0 12px ${agentColor.glow.replace("0.4", "0.1")}`,
        transition: "box-shadow 0.4s ease, transform 0.2s ease, border-color 0.3s ease",
      },
    };
  });

  const edges: Edge[] = [];

  records.forEach((r) => {
    if (r.record.prev && idSet.has(r.record.prev)) {
      const agentColor = getAgentColor(r.record.agent.pubkey);
      edges.push({
        id: `prev:${r.record.prev}->${r.id}`,
        source: r.record.prev,
        target: r.id,
        animated: true,
        style: { stroke: `${agentColor.color}25`, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: `${agentColor.color}40`,
        },
        label: "\u2713",
        labelStyle: { fill: "#22c55e", fontSize: 10, fontWeight: 700 },
        labelBgStyle: { fill: "#000000", fillOpacity: 0.9 },
        labelBgPadding: [3, 2] as [number, number],
        labelBgBorderRadius: 4,
      });
    }

    r.record.memrefs?.forEach((mref) => {
      if (idSet.has(mref)) {
        edges.push({
          id: `memref:${mref}->${r.id}`,
          source: mref,
          target: r.id,
          animated: true,
          style: {
            stroke: "#F7931A",
            strokeDasharray: "6 4",
            strokeWidth: 1.5,
            strokeOpacity: 0.6,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#F7931A80",
          },
          label: "memref",
          labelStyle: { fill: "#F7931A", fontSize: 8, fontWeight: 600 },
          labelBgStyle: { fill: "#0a0a0a", fillOpacity: 0.95 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        });
      }
    });
  });

  return { nodes, edges };
}

// ── Component ──────────────────────────────────────────────────────────────

export function DAGViewer({ records }: { records: RecordWithId[] }) {
  const { nodes, edges } = useMemo(() => {
    const sorted = [...records].sort(
      (a, b) => new Date(a.record.ts).getTime() - new Date(b.record.ts).getTime()
    );
    return layoutDAG(sorted);
  }, [records]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      fitViewOptions={{ padding: 0.15, minZoom: 0.15, maxZoom: 1.2 }}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      style={{ background: "#020202" }}
      nodesDraggable
      nodesConnectable={false}
      defaultEdgeOptions={{ animated: true }}
    >
      <Background color="#ffffff06" gap={40} size={1} />
      <Controls
        style={{
          background: "#0a0a0a",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "10px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}
      />
    </ReactFlow>
  );
}
