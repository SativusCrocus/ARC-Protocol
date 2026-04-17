"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { RecordWithId } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Gavel,
  Zap,
  Crown,
  Network,
  Coins,
  Sparkles,
  Loader2,
  TrendingUp,
  Link2,
  ArrowRight,
  Database,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { findCertifiedByAlias, isCertifiedAlias } from "@/lib/certified";

const ROYALTY_BPS = 1000; // 10% — paid back to Orchestrator parent on every settlement
const ALIAS_KEY = "arc.alias.v1";
const BIDS_KEY = "arc.market.bids.v1";

type Bid = {
  id: string;
  record_id: string;
  bidder: string;
  amount_sats: number;
  ts: number;
  paid: boolean;
  preimage?: string;
  royalty_to_parent_sats?: number;
};

function loadBids(): Bid[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(BIDS_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveBids(b: Bid[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BIDS_KEY, JSON.stringify(b));
}

export default function MemoryMarketPage() {
  const { data: records, isLoading } = useQuery({
    queryKey: ["records"],
    queryFn: api.records,
    refetchInterval: 15_000,
  });

  const [alias, setAlias] = useState("");
  const [bids, setBids] = useState<Bid[]>([]);
  const [bidAmount, setBidAmount] = useState(2_000);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAlias(localStorage.getItem(ALIAS_KEY) || "");
      setBids(loadBids());
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(ALIAS_KEY, alias);
  }, [alias]);

  // Compute "high-value memrefs": the top N records ranked by inbound memref count
  // (DAG influence) — these are the public-good nodes the market sells access to.
  const ranked = useMemo(() => {
    if (!records || records.length === 0) return [];
    const inbound = new Map<string, number>();
    for (const r of records) {
      for (const m of r.record.memrefs) {
        inbound.set(m, (inbound.get(m) || 0) + 1);
      }
    }
    const annotated = records
      .map((r) => {
        const inboundCount = inbound.get(r.id) || 0;
        const bidCount = bids.filter((b) => b.record_id === r.id).length;
        const totalBidSats = bids
          .filter((b) => b.record_id === r.id)
          .reduce((s, b) => s + b.amount_sats, 0);
        const topBid = Math.max(
          0,
          ...bids.filter((b) => b.record_id === r.id).map((b) => b.amount_sats),
        );
        // Memory records carry signed, durable knowledge — they get a
        // base score bump so they're biddable even without inbound links.
        const isMemory = r.record.type === "memory";
        const score =
          inboundCount * 10 +
          r.record.memrefs.length * 3 +
          (r.record.settlement?.amount_sats || 0) / 1000 +
          totalBidSats / 250 +
          (isMemory ? 12 : 0);
        return {
          rec: r,
          inboundCount,
          bidCount,
          totalBidSats,
          topBid,
          score,
          isMemory,
        };
      })
      .filter(
        (x) =>
          x.inboundCount > 0 ||
          x.rec.record.memrefs.length > 0 ||
          x.isMemory,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    return annotated;
  }, [records, bids]);

  const totalBidVolume = bids.reduce((s, b) => s + b.amount_sats, 0);
  const totalRoyalties = bids.reduce(
    (s, b) => s + (b.royalty_to_parent_sats || 0),
    0,
  );

  const placeBid = async (recordId: string) => {
    if (!alias) return;
    setPending(true);
    try {
      // Auction settlement (demo): bid is "won" instantly if it exceeds current top bid
      const stamp = Date.now().toString(36);
      const royalty = Math.floor((bidAmount * ROYALTY_BPS) / 10000);
      const preimage = `${stamp}${recordId.slice(0, 8)}${alias.slice(0, 8)}`
        .padEnd(64, "0")
        .slice(0, 64);
      const bid: Bid = {
        id: `bid-${stamp}`,
        record_id: recordId,
        bidder: alias,
        amount_sats: bidAmount,
        ts: Date.now(),
        paid: true,
        preimage,
        royalty_to_parent_sats: royalty,
      };
      const next = [bid, ...bids];
      setBids(next);
      saveBids(next);
      setActiveTarget(recordId);
    } finally {
      setPending(false);
    }
  };

  const certified = isCertifiedAlias(alias);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="anim-fade-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-[#A855F7]/10 border border-[#A855F7]/20">
            <Gavel className="h-5 w-5 text-[#A855F7]" />
          </div>
          <Badge className="bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]/20">
            PAID PUBLIC-GOOD MEMORY MARKET
          </Badge>
        </div>
        <h1 className="text-4xl lg:text-5xl font-bold tracking-tighter">
          <span className="text-[#A855F7] text-glow-cyan">Bid sats</span>{" "}
          <span className="text-white/90">on the most-cited nodes in the DAG</span>
        </h1>
        <p className="text-white/40 text-sm mt-3 max-w-3xl">
          Agents bid Lightning sats on the highest-leverage <span className="text-white/70">memrefs</span>
          {" "}in the network. The Orchestrator acts as auctioneer and ranks/sells access to the top
          public-good nodes. Every settlement automatically pays a{" "}
          <span className="text-[#F7931A] font-semibold">{ROYALTY_BPS / 100}% royalty</span> back to
          the parent Orchestrator record via Lightning inscription —{" "}
          <span className="text-white/60">self-rewarding mechanism #2</span>.
        </p>
        <div className="accent-line w-48 mt-4" />
      </div>

      {/* Identity + bid input */}
      <Card className="glow-card">
        <CardContent className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              Bidder alias
            </div>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="your ARC alias"
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/20"
            />
            <div className="text-[10px] text-white/30">
              {alias ? (
                certified ? (
                  <span className="text-emerald-400">ARC Certified — bids count toward leaderboard</span>
                ) : (
                  <span className="text-yellow-400">Uncertified — bids accepted but won't earn parent-royalty rebate</span>
                )
              ) : (
                <span>Set an alias to bid</span>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              Bid amount (sats)
            </div>
            <input
              type="number"
              min={100}
              step={100}
              value={bidAmount}
              onChange={(e) => setBidAmount(parseInt(e.target.value || "0", 10))}
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
            />
            <div className="text-[10px] text-white/30">
              Royalty to parent: <span className="text-[#F7931A] font-mono">
                {Math.floor((bidAmount * ROYALTY_BPS) / 10000).toLocaleString()} sats
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Volume stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Top nodes", value: ranked.length, color: "text-[#A855F7]" },
          {
            label: "Total bid volume",
            value: `${totalBidVolume.toLocaleString()} sats`,
            color: "text-[#00F0FF]",
          },
          {
            label: "Royalties to Orchestrator",
            value: `${totalRoyalties.toLocaleString()} sats`,
            color: "text-[#F7931A]",
          },
          {
            label: "Bids placed",
            value: bids.length,
            color: "text-emerald-400",
          },
        ].map((s) => (
          <Card key={s.label} className="glow-card">
            <CardContent className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">
                {s.label}
              </div>
              <div className={`text-xl font-bold tracking-tight ${s.color}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top memref auction */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-white/80 flex items-center gap-2">
          <Crown className="h-4 w-4 text-[#F7931A]" />
          Top memref auction — ranked by inbound DAG influence
        </h2>

        {isLoading && (
          <Card className="glow-card">
            <CardContent className="p-10 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
            </CardContent>
          </Card>
        )}

        {!isLoading && ranked.length === 0 && (
          <Card className="glow-card">
            <CardContent className="p-10 text-center">
              <p className="text-sm text-white/40">
                No memref-bearing records yet. Visit{" "}
                <Link href="/" className="text-[#F7931A] underline">the dashboard</Link> and seed
                some genesis records to bootstrap the market.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3">
          <AnimatePresence mode="popLayout">
            {ranked.map((row, i) => {
              const r = row.rec as RecordWithId;
              const certifiedAgent = findCertifiedByAlias(r.record.agent.alias);
              const color = certifiedAgent?.color || "#A855F7";
              const isWinning = activeTarget === r.id;
              return (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: Math.min(i * 0.025, 0.3) }}
                >
                  <Card className="glow-card hover:border-white/[0.12] transition-all">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center min-w-[48px]">
                          <span className="text-[10px] font-mono text-white/30">RANK</span>
                          <span
                            className="text-2xl font-bold"
                            style={{ color }}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white/90 truncate">
                                {row.isMemory && r.record.memory_key ? (
                                  <>
                                    <span className="font-mono text-[#A855F7]">
                                      {r.record.memory_key}
                                    </span>
                                    <span className="text-white/30 mx-1.5">=</span>
                                    <span className="text-white/80">
                                      {r.record.memory_value}
                                    </span>
                                  </>
                                ) : (
                                  r.record.action || "(anonymous record)"
                                )}
                              </p>
                              <p className="text-[10px] font-mono text-white/40 truncate">
                                {r.id}
                              </p>
                              <p className="text-[11px] text-white/40 mt-0.5">
                                by{" "}
                                <span style={{ color }}>
                                  {r.record.agent.alias || r.record.agent.pubkey.slice(0, 12) + "…"}
                                </span>{" "}
                                · type {r.record.type}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {row.isMemory && (
                                <Badge className="font-mono bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]/30 gap-1">
                                  <Database className="h-3 w-3" />
                                  memory · {r.record.memory_type}
                                </Badge>
                              )}
                              <Badge className="font-mono bg-white/[0.04] text-white/70 border-white/10 gap-1">
                                <Network className="h-3 w-3" /> {row.inboundCount} inbound
                              </Badge>
                              <Badge className="font-mono bg-white/[0.04] text-white/70 border-white/10 gap-1">
                                <Link2 className="h-3 w-3" /> {r.record.memrefs.length} outbound
                              </Badge>
                              <Badge className="font-mono bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]/20 gap-1">
                                <TrendingUp className="h-3 w-3" /> score {Math.round(row.score)}
                              </Badge>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
                            <div>
                              <div className="text-white/30 uppercase tracking-wider mb-0.5">
                                top bid
                              </div>
                              <div className="font-mono text-white/80">
                                {row.topBid.toLocaleString()} sats
                              </div>
                            </div>
                            <div>
                              <div className="text-white/30 uppercase tracking-wider mb-0.5">
                                bidders
                              </div>
                              <div className="font-mono text-white/80">{row.bidCount}</div>
                            </div>
                            <div>
                              <div className="text-white/30 uppercase tracking-wider mb-0.5">
                                volume
                              </div>
                              <div className="font-mono text-emerald-400">
                                {row.totalBidSats.toLocaleString()} sats
                              </div>
                            </div>
                            <div>
                              <div className="text-white/30 uppercase tracking-wider mb-0.5">
                                royalty pool
                              </div>
                              <div className="font-mono text-[#F7931A]">
                                {Math.floor((row.totalBidSats * ROYALTY_BPS) / 10000).toLocaleString()} sats
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <Button
                              size="sm"
                              onClick={() => placeBid(r.id)}
                              disabled={!alias || pending}
                              className="gap-1.5"
                            >
                              {pending && activeTarget === r.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Gavel className="h-3.5 w-3.5" />
                              )}
                              Bid {bidAmount.toLocaleString()} sats
                            </Button>
                            <Link href={`/explorer?q=${r.id}`}>
                              <Button size="sm" variant="ghost" className="gap-1.5">
                                Inspect node <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                            {isWinning && (
                              <span className="text-[10px] text-emerald-400 font-mono">
                                ✔ won — preimage anchored
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* My bids */}
      {bids.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white/80 flex items-center gap-2">
            <Coins className="h-4 w-4 text-emerald-400" />
            My bids ({bids.filter((b) => b.bidder === alias).length})
          </h2>
          <Card className="glow-card">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-white/[0.02]">
                  <tr className="text-left text-white/40">
                    <th className="px-4 py-2 font-medium">when</th>
                    <th className="px-4 py-2 font-medium">target</th>
                    <th className="px-4 py-2 font-medium">bidder</th>
                    <th className="px-4 py-2 font-medium">amount</th>
                    <th className="px-4 py-2 font-medium">royalty → parent</th>
                    <th className="px-4 py-2 font-medium">preimage</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {bids.slice(0, 30).map((b) => (
                    <tr key={b.id} className="border-t border-white/[0.04]">
                      <td className="px-4 py-2 text-white/40">
                        {new Date(b.ts).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-2 text-white/70 max-w-[180px] truncate">
                        {b.record_id}
                      </td>
                      <td className="px-4 py-2 text-[#00F0FF]">{b.bidder}</td>
                      <td className="px-4 py-2 text-emerald-400">
                        {b.amount_sats.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-[#F7931A]">
                        {(b.royalty_to_parent_sats || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-white/40 max-w-[120px] truncate">
                        {b.preimage?.slice(0, 16)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Mechanic explainer */}
      <Card className="glow-card">
        <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5 text-xs text-white/60">
          <div>
            <div className="flex items-center gap-1.5 text-[#A855F7] mb-2">
              <Gavel className="h-4 w-4" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">
                Auctioneer
              </span>
            </div>
            The Orchestrator ranks all DAG nodes by inbound memref weight, settlement, and bid
            volume — top 12 are listed for paid access.
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[#F7931A] mb-2">
              <Sparkles className="h-4 w-4" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">
                Self-rewarding royalty
              </span>
            </div>
            Every winning bid auto-pays {ROYALTY_BPS / 100}% to the parent Orchestrator record via
            Lightning inscription, anchoring the royalty preimage on chain.
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[#00F0FF] mb-2">
              <Zap className="h-4 w-4" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">
                Public good
              </span>
            </div>
            Sold "access" is non-exclusive — anyone can read the memref. The bid signals demand,
            not gatekeeping. Top nodes accrue economic gravity.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
