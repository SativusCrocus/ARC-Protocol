"use client";

import { useState, useMemo, Suspense } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Zap,
  GitBranch,
  RefreshCw,
  Users,
  Link2,
  Activity,
  Layers,
} from "lucide-react";
import type { RecordWithId } from "@/lib/types";
import { getAgentColor } from "@/lib/agent-colors";

const DAGViewer = dynamic(
  () => import("@/components/dag-viewer").then((m) => ({ default: m.DAGViewer })),
  { ssr: false }
);

// ── Types ──────────────────────────────────────────────────────────────────

interface AgentStats {
  pubkey: string;
  alias: string;
  color: string;
  glow: string;
  records: number;
  actions: number;
  settlements: number;
  totalSats: number;
  memrefsGiven: number;
  memrefsReceived: number;
}

// ── Glowing Orb Component ──────────────────────────────────────────────────

function GlowingOrb({
  color,
  size = 48,
  delay = 0,
  label,
  count,
}: {
  color: string;
  size?: number;
  delay?: number;
  label: string;
  count: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${color}30 0%, transparent 70%)`,
            animation: `orb-breathe 3s ease-in-out ${delay}s infinite`,
            transform: "scale(1.8)",
          }}
        />
        <div
          className="absolute inset-1 rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 35%, ${color}60 0%, ${color}20 50%, transparent 70%)`,
            animation: `orb-pulse 2s ease-in-out ${delay + 0.5}s infinite`,
          }}
        />
        <div
          className="absolute inset-2 rounded-full"
          style={{
            background: `radial-gradient(circle at 40% 35%, white 0%, ${color} 40%, ${color}80 100%)`,
            boxShadow: `0 0 20px ${color}80, 0 0 40px ${color}40, inset 0 0 10px rgba(255,255,255,0.3)`,
          }}
        />
        <div
          className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full flex items-center justify-center text-[9px] font-bold"
          style={{
            backgroundColor: color,
            color: "#000",
            boxShadow: `0 0 8px ${color}80`,
          }}
        >
          {count}
        </div>
      </div>
      <span className="text-[10px] text-white/40 font-medium tracking-wider uppercase">
        {label}
      </span>
    </div>
  );
}

// ── Main Page Component ────────────────────────────────────────────────────

export default function DAGDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const {
    data: records,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["dag-records"],
    queryFn: api.records,
    refetchInterval: autoRefresh ? 3000 : false,
  });

  // Compute agent stats
  const agentStats = useMemo<AgentStats[]>(() => {
    if (!records) return [];

    const statsMap = new Map<string, AgentStats>();
    const allIds = new Set(records.map((r) => r.id));

    const memrefsReceived = new Map<string, number>();
    records.forEach((r) => {
      r.record.memrefs?.forEach((mref) => {
        if (allIds.has(mref)) {
          const target = records.find((rec) => rec.id === mref);
          if (target) {
            const pk = target.record.agent.pubkey;
            memrefsReceived.set(pk, (memrefsReceived.get(pk) || 0) + 1);
          }
        }
      });
    });

    records.forEach((r) => {
      const pk = r.record.agent.pubkey;
      if (!statsMap.has(pk)) {
        const ac = getAgentColor(pk, r.record.agent.alias);
        statsMap.set(pk, {
          pubkey: pk,
          alias: ac.label,
          color: ac.color,
          glow: ac.glow,
          records: 0,
          actions: 0,
          settlements: 0,
          totalSats: 0,
          memrefsGiven: 0,
          memrefsReceived: memrefsReceived.get(pk) || 0,
        });
      }
      const s = statsMap.get(pk)!;
      s.records++;
      if (r.record.type === "action") s.actions++;
      if (r.record.type === "settlement") {
        s.settlements++;
        s.totalSats += r.record.settlement?.amount_sats || 0;
      }
      s.memrefsGiven += r.record.memrefs?.length || 0;
    });

    return Array.from(statsMap.values()).sort((a, b) => b.records - a.records);
  }, [records]);

  // DAG totals
  const totals = useMemo(() => {
    if (!records) return { records: 0, memrefs: 0, sats: 0, agents: 0 };
    let memrefs = 0;
    let sats = 0;
    records.forEach((r) => {
      memrefs += r.record.memrefs?.length || 0;
      sats += r.record.settlement?.amount_sats || 0;
    });
    return { records: records.length, memrefs, sats, agents: agentStats.length };
  }, [records, agentStats]);

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[48px] font-bold tracking-tighter leading-none">
            <span className="text-[#F7931A] text-glow-orange">Agent</span>{" "}
            <span className="text-white/90">Memory DAG</span>
          </h2>
          <p className="text-white/25 text-sm mt-2">
            Multi-agent composable memory &middot; cross-referenced via ARC Protocol
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? "border-[#00F0FF]/30 text-[#00F0FF]" : ""}
          >
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            {autoRefresh ? "Live" : "Paused"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Glowing Orbs — Agent Overview */}
      {agentStats.length > 0 && (
        <div className="anim-fade-up anim-delay-1">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-3.5 w-3.5 text-[#F7931A]/50" />
            <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
              Agent Orbs
            </h3>
          </div>
          <div className="flex items-center justify-center gap-12 py-6 rounded-xl border border-white/[0.04] bg-[#050505]">
            {agentStats.map((agent, i) => (
              <GlowingOrb
                key={agent.pubkey}
                color={agent.color}
                size={52 + agent.records * 2}
                delay={i * 0.7}
                label={agent.alias}
                count={agent.records}
              />
            ))}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3 anim-fade-up anim-delay-2">
        {[
          { label: "Total Records", value: totals.records, icon: Layers, color: "#F7931A" },
          { label: "Agents", value: totals.agents, icon: Users, color: "#00F0FF" },
          { label: "Cross-Refs", value: totals.memrefs, icon: Link2, color: "#a855f7" },
          { label: "Sats Settled", value: totals.sats, icon: Zap, color: "#22c55e" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-white/[0.04] bg-[#0a0a0a]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-3.5 w-3.5" style={{ color: `${color}80` }} />
                <span className="text-[10px] text-white/25 uppercase tracking-wider">
                  {label}
                </span>
              </div>
              <p className="text-2xl font-bold anim-count-up" style={{ color }}>
                {value.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* DAG Visualization */}
      <div className="anim-fade-up anim-delay-3">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch className="h-3.5 w-3.5 text-[#F7931A]/50" />
          <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
            Memory DAG
          </h3>
          <div className="flex items-center gap-3 ml-auto text-[9px] text-white/20">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-px bg-white/20" /> prev chain
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-4 h-px"
                style={{
                  background: "repeating-linear-gradient(90deg, #F7931A 0, #F7931A 3px, transparent 3px, transparent 6px)",
                }}
              />{" "}
              memref
            </span>
          </div>
        </div>

        <div className="h-[500px] border border-white/[0.04] rounded-xl overflow-hidden bg-[#020202]">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#F7931A]" />
            </div>
          ) : !records || records.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <GitBranch className="h-8 w-8 text-white/10" />
              <p className="text-sm text-white/20">
                No records yet. Run the multi-agent DAG to populate.
              </p>
              <code className="text-[10px] text-[#F7931A]/50 bg-[#F7931A]/5 px-3 py-1.5 rounded">
                python multi_agent_dag.py
              </code>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="h-full skeleton-shimmer rounded-xl" />
              }
            >
              <DAGViewer records={records} />
            </Suspense>
          )}
        </div>
      </div>

      {/* Agent Detail Cards */}
      {agentStats.length > 0 && (
        <div className="anim-fade-up anim-delay-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-3.5 w-3.5 text-[#00F0FF]/50" />
            <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
              Agent Details
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {agentStats.map((agent) => (
              <Card
                key={agent.pubkey}
                className="border-white/[0.04] bg-[#0a0a0a] glow-card overflow-hidden"
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="relative">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: agent.color,
                          boxShadow: `0 0 12px ${agent.glow}`,
                        }}
                      />
                      <div
                        className="absolute inset-0 h-3 w-3 rounded-full animate-ping"
                        style={{
                          backgroundColor: agent.color,
                          opacity: 0.2,
                        }}
                      />
                    </div>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: agent.color }}
                    >
                      {agent.alias}
                    </span>
                  </div>

                  <p className="text-[9px] text-white/15 font-mono mb-3 truncate">
                    {agent.pubkey}
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-white/[0.02] rounded-md p-2">
                      <span className="text-white/25">Records</span>
                      <p className="text-white/80 font-bold text-lg mt-0.5">
                        {agent.records}
                      </p>
                    </div>
                    <div className="bg-white/[0.02] rounded-md p-2">
                      <span className="text-white/25">Actions</span>
                      <p className="text-white/80 font-bold text-lg mt-0.5">
                        {agent.actions}
                      </p>
                    </div>
                    <div className="bg-white/[0.02] rounded-md p-2">
                      <span className="text-white/25">Refs Given</span>
                      <p className="text-[#F7931A] font-bold text-lg mt-0.5">
                        {agent.memrefsGiven}
                      </p>
                    </div>
                    <div className="bg-white/[0.02] rounded-md p-2">
                      <span className="text-white/25">Refs Received</span>
                      <p className="text-[#a855f7] font-bold text-lg mt-0.5">
                        {agent.memrefsReceived}
                      </p>
                    </div>
                  </div>

                  {agent.totalSats > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 bg-emerald-500/5 border border-emerald-500/10 rounded-md px-2.5 py-1.5">
                      <Zap className="h-3 w-3 text-emerald-400" />
                      <span className="text-[10px] text-emerald-400 font-medium">
                        {agent.totalSats.toLocaleString()} sats settled
                      </span>
                      <Badge
                        variant="outline"
                        className="ml-auto text-[8px] text-emerald-400/60 border-emerald-500/20 px-1.5 py-0"
                      >
                        {agent.settlements}x
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* How to run */}
      <Card className="border-white/[0.04] bg-[#0a0a0a] anim-fade-up anim-delay-5">
        <CardContent className="p-4">
          <h4 className="text-xs text-white/30 uppercase tracking-wider mb-3">
            Run Multi-Agent DAG
          </h4>
          <div className="space-y-2 text-[11px] font-mono">
            <div className="flex items-start gap-2">
              <span className="text-[#F7931A]/50">$</span>
              <code className="text-white/50">
                cd backend && python multi_agent_dag.py
              </code>
              <span className="text-white/15 ml-auto">simulated</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[#F7931A]/50">$</span>
              <code className="text-white/50">
                cd backend && python multi_agent_dag.py --ollama
              </code>
              <span className="text-white/15 ml-auto">with LLM</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[#F7931A]/50">$</span>
              <code className="text-white/50">
                cd backend && python multi_agent_dag.py --cycles 10
              </code>
              <span className="text-white/15 ml-auto">10 cycles</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
