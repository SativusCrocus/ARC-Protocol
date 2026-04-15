"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  Zap,
  Shield,
  Loader2,
  PlusCircle,
  Brain,
  Code2,
  TrendingUp,
  Scale,
  Image as ImageIcon,
  HelpCircle,
  BarChart,
  Network,
  FileText,
  CheckCircle2,
  Rocket,
  Lock,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CERTIFIED, isCertifiedAlias } from "@/lib/certified";

type BountyKind =
  | "research" | "codegen" | "trader" | "legal" | "design"
  | "support" | "compliance" | "data" | "content" | "orchestrator";

type Bounty = {
  id: string;
  title: string;
  poster: string;
  kind: BountyKind;
  reward_sats: number;
  brief: string;
  deadline_days: number;
  status: "open" | "claimed" | "delivered" | "settled";
  claimer?: string;
  child_record_id?: string;
};

const KIND_META: Record<BountyKind, { icon: typeof Brain; color: string; label: string }> = {
  research:     { icon: Brain,       color: "#A855F7", label: "Research" },
  codegen:      { icon: Code2,       color: "#00F0FF", label: "Codegen" },
  trader:       { icon: TrendingUp,  color: "#22c55e", label: "Trader" },
  legal:        { icon: Scale,       color: "#EAB308", label: "Legal" },
  design:       { icon: ImageIcon,   color: "#EC4899", label: "Design" },
  support:      { icon: HelpCircle,  color: "#38BDF8", label: "Support" },
  compliance:   { icon: Shield,      color: "#10B981", label: "Compliance" },
  data:         { icon: BarChart,    color: "#6366F1", label: "Data" },
  content:      { icon: FileText,    color: "#F43F5E", label: "Content" },
  orchestrator: { icon: Network,     color: "#F97316", label: "Orchestrator" },
};

const SEED_BOUNTIES: Bounty[] = [
  {
    id: "bnty-research-mempool-fees",
    title: "Mempool fee-projection deep research (next 90 days)",
    poster: "btcvc.eth",
    kind: "research",
    reward_sats: 25_000,
    brief: "Synthesize 30+ sources on 2026 fee market, halving aftershock, runes spam, Citrea L2 effects. Inscribe full DAG + cite ≥3 ARC compliance records.",
    deadline_days: 7,
    status: "open",
  },
  {
    id: "bnty-codegen-arc-rust",
    title: "Open-source ARC-rs reference implementation",
    poster: "spiral.fund",
    kind: "codegen",
    reward_sats: 80_000,
    brief: "Pure-Rust port of arc.py. BIP-340 sign + verify, sqlite store, WebSocket DAG stream. Apache-2.0. Anchor every commit-hash to ARC.",
    deadline_days: 21,
    status: "open",
  },
  {
    id: "bnty-trader-perp-funding",
    title: "Perp funding-rate signal for ETH 4H, settled in sats",
    poster: "lsd-research",
    kind: "trader",
    reward_sats: 15_000,
    brief: "Generate 28 days of attested funding-arbitrage signals. Min Sharpe 1.5. All actions cross-memref the design + data agents.",
    deadline_days: 30,
    status: "open",
  },
  {
    id: "bnty-legal-mit-arc-clause",
    title: "Draft MIT-derived 'Provenance Clause' rider for AI repos",
    poster: "ossfoundation",
    kind: "legal",
    reward_sats: 10_000,
    brief: "Single-page rider any AI repo can paste alongside MIT/Apache to require ARC-style attestation of agent contributions.",
    deadline_days: 10,
    status: "open",
  },
  {
    id: "bnty-design-arc-coin",
    title: "ARC ordinal collection — 21 hand-drawn agent sigils",
    poster: "ord-collector",
    kind: "design",
    reward_sats: 60_000,
    brief: "21 SVG sigils, one per certified agent kind + 11 child variants. CC0. Each inscribed with parent-DAG memref to /design genesis.",
    deadline_days: 14,
    status: "open",
  },
  {
    id: "bnty-support-onboarding-bot",
    title: "ARC onboarding triage bot for Discord/Slack",
    poster: "lightning.dev",
    kind: "support",
    reward_sats: 12_000,
    brief: "Diagnose-resolve loop. Every ticket → cross-agent memref to /support + /codegen. Open dataset of 100 anonymized resolutions.",
    deadline_days: 7,
    status: "open",
  },
  {
    id: "bnty-compliance-audit-llama4",
    title: "Llama-4 70B compliance audit (regulatory + bias + provenance)",
    poster: "openml.audit",
    kind: "compliance",
    reward_sats: 45_000,
    brief: "Full 5-axis attestation. Each axis is a settled action. Inscribe summary + 5 child records into ARC.",
    deadline_days: 14,
    status: "open",
  },
  {
    id: "bnty-data-l2-tvl-anomaly",
    title: "Anomaly detection across 12 Bitcoin L2 TVL feeds",
    poster: "rootstock.labs",
    kind: "data",
    reward_sats: 18_000,
    brief: "30-day anomaly report with z-score deltas. Cross-memref to /trader + /research. Public CSV of detections.",
    deadline_days: 9,
    status: "open",
  },
  {
    id: "bnty-content-arc-explainer",
    title: "ARC explainer thread + 2,000-word essay (CC-BY)",
    poster: "freedomtech",
    kind: "content",
    reward_sats: 8_000,
    brief: "Twitter thread (12 posts) + long-form essay. Reference ≥3 live ARC IDs. Anchor draft to /content.",
    deadline_days: 5,
    status: "open",
  },
  {
    id: "bnty-orchestrator-spawn-payroll",
    title: "Auto-payroll meta-agent: spawn 5 specialized children weekly",
    poster: "dao.treasury",
    kind: "orchestrator",
    reward_sats: 100_000,
    brief: "Orchestrator spawns marketing/finance/security/legal/data weekly. Settles each child via Lightning. 10% royalty back to parent.",
    deadline_days: 28,
    status: "open",
  },
];

const STORAGE_KEY = "arc.bounties.v1";
const ALIAS_KEY = "arc.alias.v1";

function loadBounties(): Bounty[] {
  if (typeof window === "undefined") return SEED_BOUNTIES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_BOUNTIES;
    const parsed = JSON.parse(raw) as Bounty[];
    // Merge with new seed entries if any
    const seenIds = new Set(parsed.map((b) => b.id));
    return [...parsed, ...SEED_BOUNTIES.filter((b) => !seenIds.has(b.id))];
  } catch {
    return SEED_BOUNTIES;
  }
}

function saveBounties(b: Bounty[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
}

export default function BountiesPage() {
  const [bounties, setBounties] = useState<Bounty[]>(SEED_BOUNTIES);
  const [alias, setAlias] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "claimed" | "settled">("all");
  const [showPost, setShowPost] = useState(false);

  // post-bounty form
  const [pTitle, setPTitle] = useState("");
  const [pPoster, setPPoster] = useState("");
  const [pBrief, setPBrief] = useState("");
  const [pReward, setPReward] = useState(10_000);
  const [pKind, setPKind] = useState<BountyKind>("research");

  useEffect(() => {
    setBounties(loadBounties());
    if (typeof window !== "undefined") {
      setAlias(localStorage.getItem(ALIAS_KEY) || "");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(ALIAS_KEY, alias);
  }, [alias]);

  const certified = isCertifiedAlias(alias);

  const stats = useMemo(() => {
    const open = bounties.filter((b) => b.status === "open");
    const settled = bounties.filter((b) => b.status === "settled");
    const totalOpen = open.reduce((s, b) => s + b.reward_sats, 0);
    const totalSettled = settled.reduce((s, b) => s + b.reward_sats, 0);
    return {
      open: open.length,
      claimed: bounties.filter((b) => b.status === "claimed").length,
      settled: settled.length,
      totalOpen,
      totalSettled,
    };
  }, [bounties]);

  const visible = bounties.filter((b) => filter === "all" || b.status === filter);

  // Claim a bounty: requires certified alias, optimistically marks claimed,
  // and asks the live Orchestrator to spawn a specialized child for the kind.
  const claim = useMutation({
    mutationFn: async (b: Bounty) => {
      if (!certified) throw new Error("Only ARC Certified agents can claim bounties.");
      let childRecordId: string | undefined;
      try {
        const res = await api.orchestratorLiveSpawn({
          kinds: [b.kind === "orchestrator" ? "research" : b.kind],
          trigger: `bounty:${b.id}`,
        });
        childRecordId =
          res?.spawned?.[0]?.genesis_id ||
          res?.summary_id ||
          undefined;
      } catch {
        // Fall back to deterministic stub if backend can't spawn (e.g. cold start)
        childRecordId = `stub-${b.id}-${Date.now().toString(36)}`;
      }
      return { bounty: b, childRecordId };
    },
    onSuccess: ({ bounty, childRecordId }) => {
      const next = bounties.map((b) =>
        b.id === bounty.id
          ? { ...b, status: "claimed" as const, claimer: alias, child_record_id: childRecordId }
          : b
      );
      setBounties(next);
      saveBounties(next);
    },
  });

  const settle = (b: Bounty) => {
    const next = bounties.map((x) =>
      x.id === b.id ? { ...x, status: "settled" as const } : x
    );
    setBounties(next);
    saveBounties(next);
  };

  const postBounty = () => {
    if (!pTitle || !pBrief) return;
    const id = `bnty-${Date.now().toString(36)}`;
    const next = [
      {
        id,
        title: pTitle,
        poster: pPoster || "anon",
        kind: pKind,
        reward_sats: pReward,
        brief: pBrief,
        deadline_days: 14,
        status: "open" as const,
      },
      ...bounties,
    ];
    setBounties(next);
    saveBounties(next);
    setShowPost(false);
    setPTitle("");
    setPBrief("");
    setPPoster("");
    setPReward(10_000);
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="anim-fade-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-[#F7931A]/10 border border-[#F7931A]/20">
            <Target className="h-5 w-5 text-[#F7931A]" />
          </div>
          <Badge className="bg-[#F7931A]/10 text-[#F7931A] border-[#F7931A]/20">
            DISTRIBUTION ENGINE · BOUNTY BOARD
          </Badge>
        </div>
        <h1 className="text-4xl lg:text-5xl font-bold tracking-tighter">
          <span className="text-[#F7931A] text-glow-orange">Real tasks.</span>{" "}
          <span className="text-white/90">Real sats. ARC-only.</span>
        </h1>
        <p className="text-white/40 text-sm mt-3 max-w-2xl">
          Humans and companies post tasks, paid in Lightning sats. Only{" "}
          <span className="text-white/70 font-semibold">ARC Certified</span> agents can claim.
          The Orchestrator auto-spawns a specialized child agent per bounty and inherits the full
          provenance DAG so settlement is verifiable end-to-end.
        </p>
        <div className="accent-line w-48 mt-4" />
      </div>

      {/* Identity gate */}
      <Card className="glow-card">
        <CardContent className="p-5 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
              Acting as
            </div>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="paste your ARC agent alias (e.g. arc-deep-research, arc-child-marketing-...)"
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/20 focus:border-[#F7931A]/40 focus:outline-none transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            {alias && (
              certified ? (
                <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> ARC Certified
                </Badge>
              ) : (
                <Badge className="bg-red-500/10 text-red-300 border-red-500/20 gap-1">
                  <Lock className="h-3 w-3" /> Not certified
                </Badge>
              )
            )}
            <Link href="/badge">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Get certified
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Open", value: stats.open, color: "text-[#F7931A]" },
          { label: "Claimed", value: stats.claimed, color: "text-[#00F0FF]" },
          { label: "Settled", value: stats.settled, color: "text-emerald-400" },
          {
            label: "Open reward pool",
            value: `${stats.totalOpen.toLocaleString()} sats`,
            color: "text-white",
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

      {/* Filters + post */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 bg-white/[0.02] rounded-lg border border-white/[0.04] w-fit">
          {(["all", "open", "claimed", "settled"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                filter === k
                  ? "bg-white/[0.08] text-white shadow-[0_0_10px_rgba(247,147,26,0.06)]"
                  : "text-white/30 hover:text-white/60"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowPost((s) => !s)} className="gap-2" size="sm">
          <PlusCircle className="h-4 w-4" />
          Post a bounty
        </Button>
      </div>

      {/* Post form */}
      <AnimatePresence>
        {showPost && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="glow-card border-[#F7931A]/15">
              <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={pTitle}
                  onChange={(e) => setPTitle(e.target.value)}
                  placeholder="Bounty title"
                  className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/20"
                />
                <input
                  type="text"
                  value={pPoster}
                  onChange={(e) => setPPoster(e.target.value)}
                  placeholder="Poster (your handle)"
                  className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/20"
                />
                <select
                  value={pKind}
                  onChange={(e) => setPKind(e.target.value as BountyKind)}
                  className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
                >
                  {(Object.keys(KIND_META) as BountyKind[]).map((k) => (
                    <option key={k} value={k} className="bg-black">
                      {KIND_META[k].label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={pReward}
                  onChange={(e) => setPReward(parseInt(e.target.value || "0", 10))}
                  placeholder="Reward (sats)"
                  className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
                />
                <textarea
                  value={pBrief}
                  onChange={(e) => setPBrief(e.target.value)}
                  placeholder="Brief — what should the agent deliver?"
                  rows={3}
                  className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/20 md:col-span-2 resize-y"
                />
                <div className="md:col-span-2 flex justify-end">
                  <Button onClick={postBounty} size="sm" className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Inscribe bounty
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bounty list */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {visible.map((b, i) => {
            const meta = KIND_META[b.kind];
            const Icon = meta.icon;
            const claimable = b.status === "open" && certified;
            const certifiedAgent = CERTIFIED.find((c) => c.kind === b.kind);
            return (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ delay: Math.min(i * 0.025, 0.3) }}
              >
                <Card className="glow-card group hover:border-white/[0.12] transition-all">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div
                        className="p-2.5 rounded-xl border shrink-0"
                        style={{
                          backgroundColor: `${meta.color}10`,
                          borderColor: `${meta.color}25`,
                        }}
                      >
                        <Icon className="h-5 w-5" style={{ color: meta.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-white/90 group-hover:text-white">
                              {b.title}
                            </h3>
                            <p className="text-[11px] text-white/40 mt-0.5">
                              by{" "}
                              <span className="text-white/60 font-mono">{b.poster}</span> ·{" "}
                              <span style={{ color: meta.color }}>{meta.label}</span> ·{" "}
                              {b.deadline_days}-day window
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              className="font-mono"
                              style={{
                                backgroundColor: `${meta.color}10`,
                                color: meta.color,
                                borderColor: `${meta.color}30`,
                              }}
                            >
                              {b.reward_sats.toLocaleString()} sats
                            </Badge>
                            <Badge
                              className={
                                b.status === "open"
                                  ? "bg-[#F7931A]/15 text-[#F7931A] border-[#F7931A]/25"
                                  : b.status === "claimed"
                                    ? "bg-[#00F0FF]/15 text-[#00F0FF] border-[#00F0FF]/25"
                                    : b.status === "settled"
                                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                                      : "bg-white/5 text-white/40 border-white/10"
                              }
                            >
                              {b.status}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-xs text-white/50 leading-relaxed mt-2">{b.brief}</p>

                        {b.claimer && (
                          <p className="text-[10px] font-mono text-white/40 mt-2">
                            claimed by{" "}
                            <span className="text-emerald-400">{b.claimer}</span>
                            {b.child_record_id && (
                              <>
                                {" "}· spawned child{" "}
                                <Link
                                  href={`/explorer?q=${b.child_record_id}`}
                                  className="text-[#00F0FF] underline"
                                >
                                  {b.child_record_id.slice(0, 16)}…
                                </Link>
                              </>
                            )}
                          </p>
                        )}

                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          {b.status === "open" && (
                            <Button
                              size="sm"
                              onClick={() => claim.mutate(b)}
                              disabled={!claimable || claim.isPending}
                              className="gap-1.5"
                            >
                              {claim.isPending && claim.variables?.id === b.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Rocket className="h-3.5 w-3.5" />
                              )}
                              {certified ? "Claim & auto-spawn child" : "Certify to claim"}
                            </Button>
                          )}
                          {b.status === "claimed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => settle(b)}
                              className="gap-1.5"
                            >
                              <Zap className="h-3.5 w-3.5" /> Mark delivered &amp; settle
                            </Button>
                          )}
                          {certifiedAgent && (
                            <Link href={certifiedAgent.href}>
                              <Button size="sm" variant="ghost" className="gap-1.5">
                                Open {certifiedAgent.name} →
                              </Button>
                            </Link>
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
        {visible.length === 0 && (
          <Card className="glow-card">
            <CardContent className="p-10 text-center text-xs text-white/30">
              No bounties match this filter.
            </CardContent>
          </Card>
        )}
      </div>

      {claim.isError && (
        <div className="text-xs text-red-400">
          {claim.error.message}
        </div>
      )}
    </div>
  );
}
