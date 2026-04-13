"use client";

import { useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ARCRecord, DisputeData } from "@/lib/types";

const AGENT_COLORS: Record<string, string> = {
  customer: "#00F0FF",
  service: "#F7931A",
};

const TYPE_COLORS: Record<string, string> = {
  genesis: "#F7931A",
  action: "#00F0FF",
  settlement: "#22c55e",
};

export function ProvenanceDAG({
  job,
  records,
  edges: rawEdges,
  validations,
}: {
  job: DisputeData["job"];
  records: Record<string, ARCRecord>;
  edges: DisputeData["edges"];
  validations: DisputeData["validations"];
}) {
  const router = useRouter();

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      router.push(`/explorer/${node.id}`);
    },
    [router],
  );

  const { nodes, edges } = useMemo(() => {
    const customerPk = job.customer_pubkey;
    const servicePk = job.service_pubkey;

    const customerRecords: { id: string; rec: ARCRecord }[] = [];
    const serviceRecords: { id: string; rec: ARCRecord }[] = [];

    for (const [rid, rec] of Object.entries(records)) {
      if (rec.agent.pubkey === customerPk) {
        customerRecords.push({ id: rid, rec });
      } else if (rec.agent.pubkey === servicePk) {
        serviceRecords.push({ id: rid, rec });
      }
    }

    const sortByTs = (a: { rec: ARCRecord }, b: { rec: ARCRecord }) =>
      a.rec.ts.localeCompare(b.rec.ts);
    customerRecords.sort(sortByTs);
    serviceRecords.sort(sortByTs);

    const xSpacing = 300;
    const yCustomer = 20;
    const yService = 250;
    const nodeWidth = 240;

    const nodes: Node[] = [];

    customerRecords.forEach((r, i) => {
      const isValid = validations[r.id]?.valid !== false;
      nodes.push({
        id: r.id,
        position: { x: i * xSpacing, y: yCustomer },
        data: {
          label: (
            <div className="text-left p-1">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AGENT_COLORS.customer }} />
                <span className="text-[9px] text-white/30 uppercase tracking-wider">Customer</span>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: TYPE_COLORS[r.rec.type] }}>
                {r.rec.type}
              </div>
              <div className="text-[11px] text-white/70 truncate max-w-[180px] leading-snug">{r.rec.action}</div>
              <div className="text-[9px] text-white/25 font-mono mt-1.5">{r.id.slice(0, 16)}&hellip;</div>
              {r.rec.settlement && (
                <div className="text-[10px] text-emerald-400 mt-1 font-medium">
                  {r.rec.settlement.amount_sats.toLocaleString()} sats
                </div>
              )}
              {!isValid && <div className="text-[9px] text-red-400 mt-1">INVALID</div>}
            </div>
          ),
        },
        style: {
          background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.03) 0%, #0a0a0a 70%)",
          border: `1.5px solid ${AGENT_COLORS.customer}40`,
          borderRadius: "14px",
          padding: "10px",
          width: nodeWidth,
          cursor: "pointer",
          boxShadow: isValid
            ? `0 0 20px ${AGENT_COLORS.customer}20, inset 0 0 12px ${AGENT_COLORS.customer}08`
            : "0 0 20px rgba(239,68,68,0.2)",
        },
      });
    });

    serviceRecords.forEach((r, i) => {
      const isValid = validations[r.id]?.valid !== false;
      nodes.push({
        id: r.id,
        position: { x: i * xSpacing, y: yService },
        data: {
          label: (
            <div className="text-left p-1">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AGENT_COLORS.service }} />
                <span className="text-[9px] text-white/30 uppercase tracking-wider">Service</span>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: TYPE_COLORS[r.rec.type] ?? "#fff" }}>
                {r.rec.type}
              </div>
              <div className="text-[11px] text-white/70 truncate max-w-[180px] leading-snug">{r.rec.action}</div>
              <div className="text-[9px] text-white/25 font-mono mt-1.5">{r.id.slice(0, 16)}&hellip;</div>
              {!isValid && <div className="text-[9px] text-red-400 mt-1">INVALID</div>}
            </div>
          ),
        },
        style: {
          background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.03) 0%, #0a0a0a 70%)",
          border: `1.5px solid ${AGENT_COLORS.service}40`,
          borderRadius: "14px",
          padding: "10px",
          width: nodeWidth,
          cursor: "pointer",
          boxShadow: isValid
            ? `0 0 20px ${AGENT_COLORS.service}20, inset 0 0 12px ${AGENT_COLORS.service}08`
            : "0 0 20px rgba(239,68,68,0.2)",
        },
      });
    });

    const nodeIds = new Set(nodes.map((n) => n.id));
    const flowEdges: Edge[] = [];

    rawEdges.forEach((e, i) => {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return;

      if (e.type === "prev") {
        flowEdges.push({
          id: `prev-${i}`,
          source: e.source,
          target: e.target,
          animated: true,
          style: { stroke: "#ffffff18", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#ffffff30" },
          label: "prev",
          labelStyle: { fill: "#ffffff30", fontSize: 9 },
          labelBgStyle: { fill: "#000000", fillOpacity: 0.8 },
          labelBgPadding: [3, 2] as [number, number],
          labelBgBorderRadius: 3,
        });
      } else {
        flowEdges.push({
          id: `memref-${i}`,
          source: e.source,
          target: e.target,
          style: {
            stroke: "#F7931A",
            strokeDasharray: "6 3",
            strokeWidth: 1.5,
            strokeOpacity: 0.5,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#F7931A80" },
          label: "memref",
          labelStyle: { fill: "#F7931A90", fontSize: 9, fontWeight: 600 },
          labelBgStyle: { fill: "#000000", fillOpacity: 0.9 },
          labelBgPadding: [3, 2] as [number, number],
          labelBgBorderRadius: 3,
        });
      }
    });

    return { nodes, edges: flowEdges };
  }, [job, records, rawEdges, validations]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}
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
