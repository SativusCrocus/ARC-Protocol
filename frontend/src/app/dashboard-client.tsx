"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { RecordWithId } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordCard } from "@/components/record-card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  PlusCircle,
  Activity,
  Users,
  Zap,
  Database,
  TrendingUp,
  Store,
  GitBranch,
  Bot,
  ArrowUpRight,
  Loader2,
  Play,
  Rocket,
  Brain,
  Code2,
  Shield,
  Link2,
  Scale,
  Image as ImageIcon,
} from "lucide-react";

const filterTabs = [
  { key: "certified", label: "Certified" },
  { key: "all", label: "All" },
  { key: "genesis", label: "Genesis" },
  { key: "action", label: "Actions" },
  { key: "settlement", label: "Settlements" },
];

const AGENT_PALETTE = ["#F7931A", "#00F0FF", "#22c55e", "#a855f7", "#f43f5e", "#eab308"];

const CERTIFIED_AGENTS = [
  {
    id: "research",
    name: "Deep Research",
    href: "/research",
    icon: Brain,
    color: "#A855F7",
    desc: "LangGraph pipeline \u2014 plan \u2192 research \u2192 analyze \u2192 synthesize \u2192 inscribe",
    aliases: ["arc-deep-research"],
    keywords: ["deep research"],
  },
  {
    id: "codegen",
    name: "Code Generator",
    href: "/codegen",
    icon: Code2,
    color: "#00F0FF",
    desc: "Multi-language generation with architecture plan + code review",
    aliases: ["arc-codegen"],
    keywords: ["codegen"],
  },
  {
    id: "trader",
    name: "DeFi Trader",
    href: "/trader",
    icon: TrendingUp,
    color: "#22c55e",
    desc: "Market analysis, signal generation, and Lightning settlement",
    aliases: ["arc-defi-trader"],
    keywords: ["defi trader", "arc-defi"],
  },
  {
    id: "legal",
    name: "Legal Contracts",
    href: "/legal",
    icon: Scale,
    color: "#EAB308",
    desc: "NDA / Service / License drafting \u2014 cross-agent memrefs + compliance",
    aliases: ["arc-legal"],
    keywords: ["legal", "arc-legal", "contract"],
  },
  {
    id: "design",
    name: "Design & Images",
    href: "/design",
    icon: ImageIcon,
    color: "#EC4899",
    desc: "Generative design \u2014 Flux/Ollama prompts, IPFS CIDs, full DAG anchor",
    aliases: ["arc-design"],
    keywords: ["design", "arc-design", "image", "generative"],
  },
];

const CERTIFIED_ALIAS_SET = new Set(
  CERTIFIED_AGENTS.flatMap((a) => a.aliases)
);

function detectAgentType(alias?: string, actions?: string[]) {
  const a = (alias || "").toLowerCase();
  const byAlias = CERTIFIED_AGENTS.find((ca) =>
    ca.aliases.some((al) => a === al)
  );
  if (byAlias) return byAlias;
  // Soft colouring for sub-agents in Global Index
  if (a.startsWith("arc-research") || a === "arc-synthesis" || a === "arc-composer" || a === "arc-analyst")
    return CERTIFIED_AGENTS[0];
  const text = [a, ...(actions || [])].join(" ").toLowerCase();
  return (
    CERTIFIED_AGENTS.find((ca) => ca.keywords.some((k) => text.includes(k))) ||
    null
  );
}

export type InitialStats = {
  total: number;
  agents: number;
  actions: number;
  totalSats: number;
};

export function Dashboard({
  initialRecords,
  initialStats,
}: {
  initialRecords: RecordWithId[];
  initialStats: InitialStats;
}) {
  const [filter, setFilter] = useState("certified");

  const { data: records, isLoading } = useQuery({
    queryKey: ["records"],
    queryFn: api.records,
    refetchInterval: 10_000,
    initialData: initialRecords,
    staleTime: 5_000,
  });

  // Never show em-dashes: fall back to server-computed floor if the live
  // query ever yields a smaller set than the seed (e.g. cold start, error).
  const liveStats =
    records && records.length > 0
      ? {
          total: records.length,
          genesis: records.filter((r) => r.record.type === "genesis").length,
          actions: records.filter((r) => r.record.type === "action").length,
          settlements: records.filter((r) => r.record.type === "settlement")
            .length,
          agents: new Set(
            records.map((r) => r.record.agent.alias || r.record.agent.pubkey)
          ).size,
          totalSats: records.reduce(
            (sum, r) => sum + (r.record.settlement?.amount_sats || 0),
            0
          ),
        }
      : null;

  const stats = {
    total: Math.max(liveStats?.total ?? 0, initialStats.total),
    genesis: liveStats?.genesis ?? 0,
    actions: Math.max(liveStats?.actions ?? 0, initialStats.actions),
    settlements: liveStats?.settlements ?? 0,
    agents: Math.max(liveStats?.agents ?? 0, initialStats.agents),
    totalSats: Math.max(liveStats?.totalSats ?? 0, initialStats.totalSats),
  };

  const filteredRecords = records?.filter((r) => {
    if (filter === "all") return true;
    if (filter === "certified") {
      const a = (r.record.agent.alias || "").toLowerCase();
      return CERTIFIED_ALIAS_SET.has(a);
    }
    return r.record.type === filter;
  });

  const agentMap = records
    ? Object.values(
        records.reduce<
          Record<
            string,
            {
              pubkey: string;
              alias?: string;
              count: number;
              sats: number;
              memrefs: number;
              actions: string[];
            }
          >
        >((acc, { record }) => {
          const key = record.agent.pubkey;
          if (!acc[key]) {
            acc[key] = {
              pubkey: key,
              alias: record.agent.alias,
              count: 0,
              sats: 0,
              memrefs: 0,
              actions: [],
            };
          }
          acc[key].count++;
          acc[key].sats += record.settlement?.amount_sats || 0;
          acc[key].memrefs += record.memrefs.length;
          if (acc[key].actions.length < 10)
            acc[key].actions.push(record.action);
          return acc;
        }, {})
      )
    : [];

  const certifiedStats = CERTIFIED_AGENTS.map((agent) => {
    const matchingRecords =
      records?.filter((r) => {
        const alias = (r.record.agent.alias || "").toLowerCase();
        return agent.aliases.some((a) => alias === a);
      }) || [];
    return {
      ...agent,
      records: matchingRecords.length,
      sats: matchingRecords.reduce(
        (s, r) => s + (r.record.settlement?.amount_sats || 0),
        0
      ),
      memrefs: matchingRecords.reduce(
        (s, r) => s + r.record.memrefs.length,
        0
      ),
      active: matchingRecords.length > 0,
      pubkey:
        matchingRecords[0]?.record.agent.pubkey || `certified-${agent.id}`,
    };
  });

  // Build Global Index: certified agents pinned first, then other agents.
  const certifiedPubkeys = new Set(
    certifiedStats.filter((c) => c.active).map((c) => c.pubkey)
  );
  const otherAgents = agentMap
    .filter((a) => !certifiedPubkeys.has(a.pubkey))
    .sort((a, b) => b.count - a.count);
  const agentRanking = [
    ...certifiedStats.map((c) => ({
      pubkey: c.pubkey,
      alias: c.aliases[0],
      count: c.records,
      sats: c.sats,
      memrefs: c.memrefs,
      actions: [] as string[],
      certifiedColor: c.color,
      certifiedName: c.name,
      certifiedHref: c.href,
    })),
    ...otherAgents.map((a) => ({
      ...a,
      certifiedColor: undefined as string | undefined,
      certifiedName: undefined as string | undefined,
      certifiedHref: undefined as string | undefined,
    })),
  ].slice(0, 10);

  const qc = useQueryClient();

  const seedGenesis = useMutation({
    mutationFn: () =>
      api.genesis({
        action: "Agent initialized — first inscription on the ARC network",
        input_data: "genesis",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records"] });
    },
  });

  const seedDemo = useMutation({
    mutationFn: () => api.serviceDemo(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records"] });
      qc.invalidateQueries({ queryKey: ["service-jobs"] });
    },
  });

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="flex items-center justify-between anim-fade-up">
        <div>
          <h2 className="text-[56px] font-bold tracking-tighter leading-none">
            <span className="text-[#F7931A] text-glow-orange">ARC</span>{" "}
            <span className="text-white/90">Protocol</span>
          </h2>
          <p className="text-white/25 text-sm mt-2 tracking-wide">
            Immutable provenance ledger for autonomous agents
          </p>
          <div className="accent-line w-48 mt-4" />
        </div>
        <Link href="/create">
          <Button className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Inscribe
          </Button>
        </Link>
      </div>

      {/* Bento Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 anim-fade-up anim-delay-1">
        {(
          [
            {
              label: "Records",
              value: stats.total,
              unit: "",
              icon: Database,
              accent: "text-white",
              glow: "group-hover:shadow-[0_0_30px_rgba(255,255,255,0.05)]",
            },
            {
              label: "Agents",
              value: stats.agents,
              unit: "",
              icon: Users,
              accent: "text-[#F7931A]",
              glow: "group-hover:shadow-[0_0_30px_rgba(247,147,26,0.08)]",
            },
            {
              label: "Actions",
              value: stats.actions,
              unit: "",
              icon: Activity,
              accent: "text-[#00F0FF]",
              glow: "group-hover:shadow-[0_0_30px_rgba(0,240,255,0.08)]",
            },
            {
              label: "Settled",
              value: stats.totalSats.toLocaleString(),
              unit: "sats",
              icon: Zap,
              accent: "text-emerald-400",
              glow: "group-hover:shadow-[0_0_30px_rgba(34,197,94,0.08)]",
            },
          ] as const
        ).map(({ label, value, unit, icon: Icon, accent, glow }) => (
          <Card
            key={label}
            className={`group glow-card hover:border-white/[0.1] transition-all duration-500 ${glow}`}
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Icon className={`h-3.5 w-3.5 ${accent} opacity-50 group-hover:opacity-80 transition-opacity`} />
                <p className="text-[11px] text-white/25 uppercase tracking-wider font-medium">
                  {label}
                </p>
              </div>
              <div className="flex items-baseline gap-1.5">
                <p
                  className={`text-2xl lg:text-3xl font-bold tracking-tight ${accent} anim-count-up`}
                >
                  {value}
                </p>
                {unit && (
                  <span className="text-[11px] text-white/15">{unit}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Network Effect Banner */}
      {stats.agents > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-xl border border-white/[0.04] bg-gradient-to-r from-[#F7931A]/[0.03] to-[#00F0FF]/[0.03] p-4 anim-fade-up anim-delay-1"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-[#00F0FF] animate-breathe" />
              <p className="text-sm text-white/50">
                <span className="text-white/80 font-bold">{stats.agents}</span>{" "}
                of <span className="text-[#F7931A] font-semibold">100</span>{" "}
                early agents registered
              </p>
            </div>
            <div className="h-1.5 flex-1 max-w-[200px] ml-4 rounded-full bg-white/[0.04] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#F7931A] to-[#00F0FF]"
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, (stats.agents / 100) * 100)}%`,
                }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* ARC Certified Agents */}
      <div className="space-y-3 anim-fade-up anim-delay-1">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-[#F7931A]" />
          <h3 className="text-[11px] text-white/25 uppercase tracking-wider font-medium">
            ARC Certified Agents
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {certifiedStats.map(
            ({
              id,
              name,
              href,
              icon: Icon,
              color,
              desc,
              records: count,
              sats,
              memrefs,
              active,
            }) => (
              <Link key={id} href={href}>
                <Card className="glow-card group hover:border-white/[0.12] transition-all duration-500 cursor-pointer h-full relative overflow-hidden">
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                    style={{
                      background: `radial-gradient(ellipse at 50% 0%, ${color}08, transparent 70%)`,
                    }}
                  />
                  <CardContent className="p-5 relative">
                    <div className="flex items-start justify-between mb-3">
                      <div
                        className="p-2.5 rounded-xl border transition-all duration-300"
                        style={{
                          backgroundColor: `${color}08`,
                          borderColor: `${color}15`,
                        }}
                      >
                        <Icon
                          className="h-5 w-5 transition-all duration-300 group-hover:scale-110"
                          style={{ color }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        {active && (
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-1.5 w-1.5 rounded-full animate-breathe"
                              style={{
                                backgroundColor: color,
                                boxShadow: `0 0 6px ${color}60`,
                              }}
                            />
                            <span
                              className="text-[10px] font-semibold tracking-wider"
                              style={{ color }}
                            >
                              LIVE
                            </span>
                          </span>
                        )}
                        <ArrowUpRight className="h-4 w-4 text-white/10 group-hover:text-white/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </div>
                    </div>
                    <h4 className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors mb-1">
                      {name}
                    </h4>
                    <p className="text-[11px] text-white/20 leading-relaxed mb-3">
                      {desc}
                    </p>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="font-mono text-white/30">
                        {count} records
                      </span>
                      {sats > 0 && (
                        <span className="font-mono text-emerald-400/60">
                          {sats.toLocaleString()} sats
                        </span>
                      )}
                      {memrefs > 0 && (
                        <span
                          className="flex items-center gap-1 font-mono"
                          style={{ color: `${color}80` }}
                        >
                          <Link2 className="h-2.5 w-2.5" />
                          {memrefs} refs
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          )}
        </div>
      </div>

      {/* Live Demos */}
      <div className="space-y-3 anim-fade-up anim-delay-2">
        <h3 className="text-[11px] text-white/25 uppercase tracking-wider font-medium">
          Live Demos
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              href: "/marketplace",
              title: "Live Marketplace",
              desc: "Two autonomous agents trade services over ARC Protocol. 6-step state machine with Lightning settlement and full provenance.",
              icon: Store,
              color: "#F7931A",
              badge: "6-step protocol",
            },
            {
              href: "/dag",
              title: "Memory DAG",
              desc: "Interactive visualization of the provenance graph. Every record is a node, every prev/memref is an edge. Click to explore.",
              icon: GitBranch,
              color: "#00F0FF",
              badge: "React Flow",
            },
            {
              href: "/marketplace#demo",
              title: "Autonomous Services",
              desc: "Customer requests mempool analysis, service agent delivers, Lightning settles. Dispute resolution walks the cross-agent DAG.",
              icon: Bot,
              color: "#22c55e",
              badge: "BIP-340 signed",
            },
          ].map(({ href, title, desc, icon: Icon, color, badge }) => (
            <Link key={title} href={href}>
              <Card className="glow-card group hover:border-white/[0.12] transition-all duration-500 cursor-pointer h-full relative overflow-hidden">
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                  style={{
                    background: `radial-gradient(ellipse at 50% 0%, ${color}08, transparent 70%)`,
                  }}
                />
                <CardContent className="p-5 relative">
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="p-2.5 rounded-xl border transition-all duration-300"
                      style={{
                        backgroundColor: `${color}08`,
                        borderColor: `${color}15`,
                      }}
                    >
                      <Icon
                        className="h-5 w-5 transition-all duration-300 group-hover:scale-110"
                        style={{ color }}
                      />
                    </div>
                    <ArrowUpRight
                      className="h-4 w-4 text-white/10 group-hover:text-white/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </div>
                  <h4 className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors mb-1.5">
                    {title}
                  </h4>
                  <p className="text-[11px] text-white/20 leading-relaxed mb-3">
                    {desc}
                  </p>
                  <span
                    className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border"
                    style={{
                      color,
                      backgroundColor: `${color}10`,
                      borderColor: `${color}20`,
                    }}
                  >
                    {badge}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Seed First Inscriptions */}
      {!isLoading && (!records || records.length === 0) && (
        <Card className="glow-card border-[#F7931A]/10 anim-fade-up anim-delay-3">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-[#F7931A]/[0.06] border border-[#F7931A]/10 shrink-0">
                <Rocket className="h-6 w-6 text-[#F7931A]" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-white/90 mb-1">
                  Seed First Inscriptions
                </h3>
                <p className="text-xs text-white/25 mb-4 leading-relaxed">
                  Bootstrap the network with demo data. Creates genesis records,
                  chains of actions, and runs the full marketplace protocol — all
                  BIP-340 signed on regtest.
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => seedGenesis.mutate()}
                    disabled={seedGenesis.isPending || seedDemo.isPending}
                    size="sm"
                    className="gap-2"
                  >
                    {seedGenesis.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlusCircle className="h-3.5 w-3.5" />
                    )}
                    Create Genesis
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => seedDemo.mutate()}
                    disabled={seedGenesis.isPending || seedDemo.isPending}
                    size="sm"
                    className="gap-2"
                  >
                    {seedDemo.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Run Full Marketplace Demo
                  </Button>
                </div>
                {seedGenesis.isError && (
                  <p className="text-xs text-red-400 mt-3">
                    {seedGenesis.error.message}
                  </p>
                )}
                {seedDemo.isError && (
                  <p className="text-xs text-red-400 mt-3">
                    {seedDemo.error.message}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content: Feed + Global Index */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Center: Feed */}
        <div className="space-y-4 anim-fade-up anim-delay-3">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-white/[0.02] rounded-lg border border-white/[0.04] w-fit">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filter === tab.key
                    ? "bg-white/[0.08] text-white shadow-[0_0_10px_rgba(247,147,26,0.06)]"
                    : "text-white/25 hover:text-white/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Records Feed */}
          <div className="space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[72px] rounded-lg skeleton-shimmer"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))
            ) : filteredRecords?.length ? (
              <AnimatePresence mode="popLayout">
                {filteredRecords.slice(0, 20).map(({ id, record }, i) => (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ delay: i * 0.03 }}
                    layout
                  >
                    <RecordCard id={id} record={record} />
                  </motion.div>
                ))}
              </AnimatePresence>
            ) : (
              <Card className="glow-card">
                <CardContent className="p-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-white/[0.03] flex items-center justify-center mx-auto mb-4 border border-white/[0.04]">
                    <Database className="h-6 w-6 text-white/15" />
                  </div>
                  <p className="text-white/30 mb-1 text-sm font-medium">
                    No records yet
                  </p>
                  <p className="text-white/15 mb-6 text-xs">
                    Create a genesis record to begin the provenance chain
                  </p>
                  <Link href="/create">
                    <Button size="sm">Create Genesis</Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Right: Global Index */}
        <div className="space-y-4 anim-fade-right anim-delay-5">
          <Card className="glass-active glow-card">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-[#00F0FF]" />
                <CardTitle className="text-xs uppercase tracking-wider text-white/35 font-medium">
                  Global Index
                </CardTitle>
              </div>
              <div className="accent-line mt-2" />
            </CardHeader>
            <CardContent className="space-y-3">
              {agentRanking.length > 0 ? (
                agentRanking.map((agent, i) => {
                  const agentType = agent.certifiedColor
                    ? {
                        color: agent.certifiedColor,
                        name: agent.certifiedName!,
                        href: agent.certifiedHref!,
                      }
                    : detectAgentType(agent.alias, agent.actions);
                  const dotColor =
                    agentType?.color ||
                    AGENT_PALETTE[i % AGENT_PALETTE.length];
                  const topCount = agentRanking[0]?.count || 1;
                  return (
                    <Link
                      key={agent.pubkey}
                      href={
                        agentType?.href || `/explorer?q=${agent.pubkey}`
                      }
                      className="flex items-center gap-3 group"
                    >
                      <span className="text-[10px] font-mono text-white/15 w-4">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: dotColor,
                          boxShadow: `0 0 6px ${dotColor}70`,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white/60 group-hover:text-white truncate transition-colors">
                          {agentType?.name ||
                            agent.alias ||
                            `${agent.pubkey.slice(0, 12)}...`}
                        </p>
                        <p className="text-[10px] text-white/15 font-mono">
                          {agent.count} records
                          {agent.sats > 0 &&
                            ` \u00b7 ${agent.sats.toLocaleString()} sats`}
                          {agent.memrefs > 0 &&
                            ` \u00b7 ${agent.memrefs} refs`}
                        </p>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.04] w-14 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: `linear-gradient(to right, ${dotColor}99, ${dotColor}4D)`,
                          }}
                          initial={{ width: 0 }}
                          animate={{
                            width: `${Math.min(100, (agent.count / topCount) * 100)}%`,
                          }}
                          transition={{
                            duration: 0.8,
                            ease: "easeOut",
                          }}
                        />
                      </div>
                    </Link>
                  );
                })
              ) : (
                CERTIFIED_AGENTS.map((agent, i) => (
                  <Link
                    key={agent.id}
                    href={agent.href}
                    className="flex items-center gap-3 group opacity-60"
                  >
                    <span className="text-[10px] font-mono text-white/15 w-4">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: agent.color,
                        boxShadow: `0 0 6px ${agent.color}70`,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/60 group-hover:text-white truncate transition-colors">
                        {agent.name}
                      </p>
                      <p className="text-[10px] text-white/15 font-mono">
                        awaiting sync
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="space-y-2">
            {[
              {
                href: "/create",
                label: "New Genesis",
                icon: PlusCircle,
                desc: "Create identity",
                color: "#F7931A",
              },
              {
                href: "/explorer",
                label: "Memory DAG",
                icon: Activity,
                desc: "Explore chains",
                color: "#00F0FF",
              },
              {
                href: "/settle",
                label: "Settlement",
                icon: Zap,
                desc: "Lightning payment",
                color: "#22c55e",
              },
            ].map(({ href, label, icon: Icon, desc, color }) => (
              <Link key={href} href={href}>
                <Card className="glow-card hover:border-white/[0.1] transition-all duration-300 cursor-pointer mb-2 group">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div
                      className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.04] group-hover:border-white/[0.08] transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100 transition-opacity" style={{ color }} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-white/60 group-hover:text-white/90 transition-colors">
                        {label}
                      </p>
                      <p className="text-[10px] text-white/15">{desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
