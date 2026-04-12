"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordCard } from "@/components/record-card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlusCircle,
  Activity,
  Users,
  Zap,
  Database,
  TrendingUp,
} from "lucide-react";

const filterTabs = [
  { key: "all", label: "All" },
  { key: "genesis", label: "Genesis" },
  { key: "action", label: "Actions" },
  { key: "settlement", label: "Settlements" },
];

export default function Dashboard() {
  const [filter, setFilter] = useState("all");

  const { data: records, isLoading } = useQuery({
    queryKey: ["records"],
    queryFn: api.records,
  });

  const stats = records
    ? {
        total: records.length,
        genesis: records.filter((r) => r.record.type === "genesis").length,
        actions: records.filter((r) => r.record.type === "action").length,
        settlements: records.filter((r) => r.record.type === "settlement")
          .length,
        agents: new Set(records.map((r) => r.record.agent.pubkey)).size,
        totalSats: records.reduce(
          (sum, r) => sum + (r.record.settlement?.amount_sats || 0),
          0
        ),
      }
    : null;

  const filteredRecords = records?.filter(
    (r) => filter === "all" || r.record.type === filter
  );

  // Top agents by chain length
  const agentRanking = records
    ? Object.values(
        records.reduce<
          Record<
            string,
            { pubkey: string; alias?: string; count: number; sats: number }
          >
        >((acc, { record }) => {
          const key = record.agent.pubkey;
          if (!acc[key]) {
            acc[key] = {
              pubkey: key,
              alias: record.agent.alias,
              count: 0,
              sats: 0,
            };
          }
          acc[key].count++;
          acc[key].sats += record.settlement?.amount_sats || 0;
          return acc;
        }, {})
      )
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-3xl lg:text-[42px] font-bold tracking-tighter leading-none">
            <span className="text-[#F7931A]">ARC</span>{" "}
            <span className="text-white/90">Protocol</span>
          </h2>
          <p className="text-white/25 text-sm mt-2">
            Immutable provenance ledger for autonomous agents
          </p>
        </div>
        <Link href="/create">
          <Button className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Inscribe
          </Button>
        </Link>
      </motion.div>

      {/* Bento Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        {[
          {
            label: "Records",
            value: stats?.total ?? "\u2014",
            icon: Database,
            accent: "text-white",
          },
          {
            label: "Agents",
            value: stats?.agents ?? "\u2014",
            icon: Users,
            accent: "text-[#F7931A]",
          },
          {
            label: "Actions",
            value: stats?.actions ?? "\u2014",
            icon: Activity,
            accent: "text-[#00F0FF]",
          },
          {
            label: "Settled",
            value: stats?.totalSats
              ? stats.totalSats.toLocaleString()
              : "\u2014",
            unit: stats?.totalSats ? "sats" : "",
            icon: Zap,
            accent: "text-emerald-400",
          },
        ].map(({ label, value, unit, icon: Icon, accent }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 + i * 0.03 }}
          >
            <Card className="group hover:border-white/[0.1] transition-all duration-300">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`h-3.5 w-3.5 ${accent} opacity-50`} />
                  <p className="text-[11px] text-white/25 uppercase tracking-wider font-medium">
                    {label}
                  </p>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <p
                    className={`text-2xl lg:text-3xl font-bold tracking-tight ${accent}`}
                  >
                    {value}
                  </p>
                  {unit && (
                    <span className="text-[11px] text-white/15">{unit}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Feed */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="space-y-4"
        >
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-white/[0.02] rounded-lg border border-white/[0.04] w-fit">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filter === tab.key
                    ? "bg-white/[0.08] text-white"
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
                />
              ))
            ) : filteredRecords?.length ? (
              <AnimatePresence mode="popLayout">
                {filteredRecords.slice(0, 20).map(({ id, record }, i) => (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    <RecordCard id={id} record={record} />
                  </motion.div>
                ))}
              </AnimatePresence>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
                    <Database className="h-5 w-5 text-white/15" />
                  </div>
                  <p className="text-white/25 mb-4 text-sm">
                    No records yet. Create a genesis record to begin.
                  </p>
                  <Link href="/create">
                    <Button size="sm">Create Genesis</Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </motion.div>

        {/* Global Index */}
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <Card className="glass-active">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-[#00F0FF]" />
                <CardTitle className="text-xs uppercase tracking-wider text-white/35 font-medium">
                  Global Index
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {agentRanking.length > 0 ? (
                agentRanking.map((agent, i) => (
                  <Link
                    key={agent.pubkey}
                    href={`/explorer?q=${agent.pubkey}`}
                    className="flex items-center gap-3 group"
                  >
                    <span className="text-[10px] font-mono text-white/15 w-4">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/60 group-hover:text-white truncate transition-colors">
                        {agent.alias || `${agent.pubkey.slice(0, 12)}...`}
                      </p>
                      <p className="text-[10px] text-white/15 font-mono">
                        {agent.count} records
                        {agent.sats > 0 &&
                          ` \u00b7 ${agent.sats.toLocaleString()} sats`}
                      </p>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.04] w-12">
                      <div
                        className="h-full rounded-full bg-[#F7931A]/40"
                        style={{
                          width: `${Math.min(100, (agent.count / (agentRanking[0]?.count || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-xs text-white/15 text-center py-4">
                  No agents yet
                </p>
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
              },
              {
                href: "/explorer",
                label: "Memory DAG",
                icon: Activity,
                desc: "Explore chains",
              },
              {
                href: "/settle",
                label: "Settlement",
                icon: Zap,
                desc: "Lightning payment",
              },
            ].map(({ href, label, icon: Icon, desc }) => (
              <Link key={href} href={href}>
                <Card className="hover:border-white/[0.1] transition-all duration-200 cursor-pointer mb-2">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-1.5 rounded-md bg-white/[0.03]">
                      <Icon className="h-3.5 w-3.5 text-[#F7931A]/60" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-white/60">
                        {label}
                      </p>
                      <p className="text-[10px] text-white/15">{desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
